import { normalizeText } from "./projectContext.js";
import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
  extractContentToken,
  extractFinishReason,
  accumulateToolCallChunks,
  type OpenAiMessage,
  type OpenAiStreamChunk,
} from "../openAiClient.js";
import { isStreamActive } from "../chatSession.js";
import { executeToolCall, describeStreamingToolCall, type ToolExecutionResult } from "../chatToolExecution.js";
import {
  getNaviState,
  getEffectiveSlots,
  getAllSlotLabels,
  openSlots,
  NAVI_INITIAL_STATE_ID,
  type NaviState,
} from "../naviStateMachine.js";
import { loadNaviStates, loadNaviTips, loadNaviPersona } from "../naviStateConfigService.js";
import { buildNaviKnowledgePrompt } from "../naviKnowledgeBase.js";
import type { NaviTip } from "../../../src/naviTips.js";
import type { NaviPersonaConfig } from "../../../src/naviPersona.js";
import { TOOLKIT_TOOL_DEFINITIONS, type ToolDefinition } from "./systemPrompt.js";
import type { ChatRequest, ChatMessage, ToolCall, NaviFacts } from "../../../src/types.js";
import type { ChatStreamEvent } from "../chatTypes.js";

/**
 * Silent, in-turn bookkeeping tool: the model records new/updated facts here — every turn, not
 * just on phase transitions — so the fact sheet injected into the next prompt never lags behind
 * what was actually said. Replaces the former windowed Call 2b (question plan) + Call 2d
 * (context extraction), both of which only saw a truncated excerpt and only ran on transitions.
 */
const UPDATE_FACTS_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "update_facts",
    description:
      "Trage neue oder aktualisierte Fakten aus der letzten Händler-Nachricht in das Fakten-Blatt ein — auch beiläufig Erwähntes. Rufe dieses Werkzeug auf, bevor du antwortest oder die Phase wechselst, sobald die Nachricht auch nur eine Kleinigkeit Neues enthält. Trage nur ein, was der Händler wirklich gesagt hat — keine Vermutungen.",
    parameters: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          description: "Neue oder aktualisierte Slot-Werte aus der Checkliste dieser oder einer früheren Phase.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Die Slot-id aus der Checkliste." },
              value: { type: "string", description: "Der Fakt in einem kurzen Satz oder Stichpunkt." },
            },
            required: ["id", "value"],
          },
        },
        currentProblem: {
          type: "string",
          description: "Kurze Neuformulierung des aktuell behandelten Anliegens, falls neu oder präzisiert.",
        },
        hypothesis: {
          type: "string",
          description: "Was das Problem wirklich bedeutet und in welche Richtung die Lösung zeigt, falls neu erkannt.",
        },
        problemQueue: {
          type: "array",
          items: { type: "string" },
          description: "Vollständige aktualisierte Liste weiterer, noch nicht behandelter Anliegen des Händlers.",
        },
        recommendation: {
          type: "string",
          description: "Der aktuell gemachte Lösungsvorschlag in einem Satz, falls gerade gemacht oder geändert.",
        },
        notes: {
          type: "string",
          description: "Weitere konkrete Fakten als Stichpunkte ('- ...'), die in keinen Slot passen.",
        },
      },
    },
  },
};

/**
 * Model-driven phase transitions: the model picks the target phase itself via this tool's `to`
 * argument. The backend keeps exactly one deterministic guarantee — for phases with a non-empty
 * workPlan, the primary forward transition (index 0 by NAVI_STATES convention) is rejected unless
 * every slot of the current phase's checklist has a value in the fact sheet (enforced in the
 * advance_phase handler below). Every other transition is accepted on the model's judgment alone.
 */
function buildAdvancePhaseTool(state: NaviState): ToolDefinition {
  const targets = state.transitions.map((t) => t.to);
  const transitionLines = state.transitions.map((t) => `- "${t.to}": ${t.condition}`);
  const gateNote =
    state.workPlan.length > 0 && state.transitions[0]
      ? `Für den Wechsel zu "${state.transitions[0].to}" gilt zusätzlich: nur möglich, wenn ALLE Punkte der Slot-Checkliste bekannt sind — sonst wird der Wechsel abgelehnt; rufe in diesem Fall stattdessen update_facts auf und stelle die nächste offene Frage.`
      : "";
  return {
    type: "function",
    function: {
      name: "advance_phase",
      description: [
        "Wechsle die Gesprächsphase, sobald eine der folgenden Bedingungen eindeutig zutrifft:",
        ...transitionLines,
        gateNote,
        "Wechsle NICHT, wenn keine Bedingung eindeutig zutrifft — bleib in der aktuellen Phase und antworte normal weiter.",
      ]
        .filter(Boolean)
        .join("\n"),
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", enum: targets, description: "Die Ziel-Phase." },
        },
        required: ["to"],
      },
    },
  };
}

/**
 * Silent, in-turn tool: the model calls this in the same turn it actually weaves one of the pending
 * tips into its visible answer, so the tip is not offered again on later turns. Replaces the former
 * separate, lagging tips-classifier request (runTipsCheck), which spent a full extra LLM call per
 * turn against the *previous* answer — and therefore never checked the final answer of a chat.
 */
function buildMarkTipCoveredTool(pendingTipIds: string[]): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "mark_tip_covered",
      description:
        "Markiere einen Hinweis als abgedeckt, sobald du ihn in deiner Antwort dieses Zuges tatsächlich eingebracht hast — damit er nicht erneut vorgeschlagen wird. Rufe es nur für Hinweise auf, die du wirklich erwähnt hast.",
      parameters: {
        type: "object",
        properties: {
          tipIds: {
            type: "array",
            items: { type: "string", enum: pendingTipIds },
            description: "Die id(s) der gerade eingebrachten Hinweise.",
          },
        },
        required: ["tipIds"],
      },
    },
  };
}

/** The state's visible-reply tool(s) (ask_clarification / ask_yes_no), if any — always optional, never forced. */
function buildReplyTools(state: NaviState): ToolDefinition[] {
  if (!state.tools || state.tools.length === 0) return [];
  const tools: ToolDefinition[] = [];
  for (const name of state.tools) {
    if (name === "ask_clarification") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find((d) => d.function.name === "ask_clarification");
      if (t) tools.push(t);
    } else if (name === "ask_yes_no") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find((d) => d.function.name === "ask_yes_no");
      if (t) tools.push(t);
    }
  }
  return tools;
}

function buildToolSet(
  state: NaviState,
  includeSilent: boolean,
  pendingTipIds: string[],
): { tools: ToolDefinition[] } {
  const tools: ToolDefinition[] = [];
  if (includeSilent) {
    tools.push(UPDATE_FACTS_TOOL);
    if (state.transitions.length > 0) tools.push(buildAdvancePhaseTool(state));
    if (pendingTipIds.length > 0) tools.push(buildMarkTipCoveredTool(pendingTipIds));
  }
  tools.push(...buildReplyTools(state));
  return { tools };
}

function renderFactsSection(facts: NaviFacts, states: NaviState[]): string {
  const labels = getAllSlotLabels(states);
  const filledLines = Object.entries(facts.slots)
    .filter(([, v]) => v?.trim())
    .map(([id, v]) => `- ${labels.get(id) ?? id}: ${v}`);

  const parts: string[] = [];
  if (filledLines.length > 0) {
    parts.push("Bekannte Fakten über den Händler (aus dem bisherigen Gespräch):\n" + filledLines.join("\n"));
  }
  if (facts.hypothesis) parts.push(`Interpretation: ${facts.hypothesis}`);
  if (facts.recommendation) parts.push(`Bisheriger Lösungsvorschlag: ${facts.recommendation}`);
  if (facts.problemQueue.length > 0) {
    parts.push(`Weitere noch offene Anliegen des Händlers (danach behandeln): ${facts.problemQueue.join(", ")}`);
  }
  if (facts.notes) parts.push(`Weitere Notizen:\n${facts.notes}`);
  return parts.join("\n\n");
}

function renderSlotChecklist(
  stateId: string,
  states: NaviState[],
  facts: NaviFacts,
): string {
  const slots = getEffectiveSlots(states, stateId);
  if (slots.length === 0) return "";
  const lines = slots.map((s) => {
    const value = facts.slots[s.id]?.trim();
    return value ? `[bekannt] ${s.label} → ${value}` : `[offen] ${s.label}`;
  });
  return (
    "Slot-Checkliste dieser Phase — PFLICHT: advance_phase wird abgelehnt, solange [offen]-Punkte übrig sind:\n" +
    lines.join("\n")
  );
}

function buildNaviSystemPrompt(
  state: NaviState,
  facts: NaviFacts,
  states: NaviState[],
  persona: NaviPersonaConfig,
  tips: NaviTip[],
  naviCoveredTips: string[] | undefined,
): string {
  let effectiveInstruction = state.instruction;

  const problemFocusBlock = facts.currentProblem
    ? [
        `Das Anliegen des Händlers: "${facts.currentProblem}"`,
        ...(facts.hypothesis ? [`→ ${facts.hypothesis}`] : []),
        ...(facts.problemQueue.length > 0 ? [`Weitere Anliegen danach: ${facts.problemQueue.join(", ")}`] : []),
        "Alle Fragen ausschließlich zu diesem Anliegen – nichts anderes.",
      ].join("\n")
    : null;

  if (state.appendPendingProblemsAtEnd && facts.problemQueue.length > 0) {
    effectiveInstruction = `${effectiveInstruction}\n\nNoch nicht besprochene Anliegen des Händlers: ${facts.problemQueue
      .map((p) => `"${p}"`)
      .join(", ")}. Frage am Ende freundlich, ob der Händler eines dieser Themen noch angehen möchte.`;
  }

  const knowledgePrompt = buildNaviKnowledgePrompt(state);
  const factsSection = renderFactsSection(facts, states);
  const checklistSection = renderSlotChecklist(state.id, states, facts);
  const transitionSection = renderTransitionOptions(state);
  const factsToolNote =
    "Trage Fakten IMMER zuerst per update_facts ein (auch beiläufig Erwähntes), bevor du antwortest oder die Phase wechselst.";
  const requiresQuestionNote = state.validation?.requiresQuestion
    ? "PFLICHT: Deine Antwort muss mit genau einer Frage enden (Fragezeichen). Lass das Gespräch nie ohne nächsten Schritt oder offene Frage stehen."
    : "";

  const coveredTips = new Set(naviCoveredTips ?? []);
  const pendingTips = tips.filter((t) => !coveredTips.has(t.id));
  const tipsPromptSection =
    pendingTips.length > 0
      ? [
          "Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich in das Gespräch passen. Sobald du einen Hinweis in deiner Antwort tatsächlich eingebracht hast, rufe im selben Zug mark_tip_covered mit seiner id auf, damit er nicht erneut vorgeschlagen wird:",
          ...pendingTips.map((t) => `- ${t.id}: ${t.instruction}`),
        ].join("\n")
      : "";

  return [
    persona.roleIntro,
    ...persona.fullPersonaRules,
    ...(problemFocusBlock ? [problemFocusBlock] : []),
    ...(factsSection ? [factsSection] : []),
    ...(checklistSection ? [checklistSection] : []),
    factsToolNote,
    `Deine aktuelle Aufgabe: ${effectiveInstruction}`,
    ...(requiresQuestionNote ? [requiresQuestionNote] : []),
    ...(transitionSection ? [transitionSection] : []),
    ...(tipsPromptSection ? [tipsPromptSection] : []),
    ...(knowledgePrompt ? [knowledgePrompt] : []),
  ].join("\n\n");
}

/** Lists the phase's possible advance_phase transitions and their conditions, for the prompt. */
function renderTransitionOptions(state: NaviState): string {
  if (state.transitions.length === 0) return "";
  const lines = state.transitions.map((t) => `→ "${t.to}": ${t.condition}`);
  return (
    "Mögliche Phasenübergänge (per advance_phase-Werkzeug, nur wenn eine Bedingung eindeutig zutrifft):\n" +
    lines.join("\n")
  );
}

function buildNaviMessages(systemPrompt: string, history: ChatMessage[], userMessage: string): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: "system", content: systemPrompt }];
  for (const msg of history) {
    if (msg.hidden) continue;
    if (msg.role === "assistant") {
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      if (!content) continue;
      const toolCalls = Array.isArray(msg.toolCalls)
        ? msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }))
        : undefined;
      messages.push({
        role: "assistant",
        content,
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else if (msg.role === "tool") {
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      if (!content || !msg.toolCallId) continue;
      messages.push({ role: "tool", content, tool_call_id: msg.toolCallId });
    } else if (msg.role === "user") {
      const content = typeof msg.content === "string" ? msg.content.trim() : "";
      if (!content) continue;
      messages.push({ role: "user", content });
    }
  }
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }
  return messages;
}

function startNaviResponseFetch(
  endpoint: { apiUrl: string; apiKey: string; model: string },
  messages: OpenAiMessage[],
  tools: ToolDefinition[],
): Promise<Response> {
  return fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({
      model: endpoint.model,
      stream: true,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      // xAI/Grok only accepts "low" or "high" for reasoning_effort — any other value is silently
      // ignored (falls back to the model's default, effectively full reasoning).
      reasoning_effort: "low",
    }),
  });
}

interface StreamRoundResult {
  roundAssistantText: string;
  toolCalls: ToolCall[];
  tokenCount: number;
}

/** Reads one streamed response, forwarding content tokens live as they arrive. */
async function readStreamRound(
  streamId: string,
  response: Response,
  emit: (event: ChatStreamEvent) => void,
): Promise<StreamRoundResult> {
  if (!response.ok) {
    let detail = `Navi chat error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let roundAssistantText = "";
  let tokenCount = 0;
  const collectedToolCalls = new Map<number, ToolCall>();

  while (true) {
    if (!isStreamActive(streamId)) break;
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.substring(6).trim();
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const data = line.substring(5).trim();
      if (!data) continue;
      if (data === "[DONE]") { currentEvent = ""; continue; }
      if (currentEvent === "error") throw new Error(data);

      let parsed: OpenAiStreamChunk | null = null;
      try {
        parsed = JSON.parse(data) as OpenAiStreamChunk;
      } catch {
        parsed = null;
      }
      if (!parsed) { currentEvent = ""; continue; }

      const token = extractContentToken(parsed);
      if (token) {
        tokenCount++;
        roundAssistantText += token;
        emit({ type: "token", data: token });
      }

      accumulateToolCallChunks(parsed, collectedToolCalls);

      const finishReason = extractFinishReason(parsed);
      if (finishReason === "tool_calls") break;
      currentEvent = "";
    }
  }

  return { roundAssistantText, toolCalls: [...collectedToolCalls.values()], tokenCount };
}

function cloneFacts(facts: NaviFacts): NaviFacts {
  return { ...facts, slots: { ...facts.slots }, problemQueue: [...facts.problemQueue] };
}

/** Applies an update_facts tool call's arguments onto the live fact sheet. Returns whether anything changed. */
function applyUpdateFacts(facts: NaviFacts, argsJson: string): boolean {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson) as Record<string, unknown>;
  } catch {
    return false;
  }
  let changed = false;

  if (Array.isArray(args.slots)) {
    for (const entry of args.slots) {
      if (!entry || typeof entry !== "object") continue;
      const id = typeof (entry as Record<string, unknown>).id === "string" ? (entry as Record<string, unknown>).id as string : "";
      const value =
        typeof (entry as Record<string, unknown>).value === "string" ? (entry as Record<string, unknown>).value as string : "";
      const trimmedId = id.trim();
      const trimmedValue = value.trim();
      if (!trimmedId || !trimmedValue) continue;
      facts.slots[trimmedId] = trimmedValue;
      changed = true;
    }
  }
  if (typeof args.currentProblem === "string" && args.currentProblem.trim()) {
    facts.currentProblem = args.currentProblem.trim();
    changed = true;
  }
  if (typeof args.hypothesis === "string" && args.hypothesis.trim()) {
    facts.hypothesis = args.hypothesis.trim();
    changed = true;
  }
  if (Array.isArray(args.problemQueue)) {
    facts.problemQueue = args.problemQueue.filter((p): p is string => typeof p === "string" && !!p.trim());
    changed = true;
  }
  if (typeof args.recommendation === "string" && args.recommendation.trim()) {
    facts.recommendation = args.recommendation.trim();
    changed = true;
  }
  if (typeof args.notes === "string" && args.notes.trim()) {
    facts.notes = args.notes.trim();
    changed = true;
  }
  return changed;
}

export async function runNaviChatStream(
  streamId: string,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  try {
    const provider = await resolveAiProvider(request.llmId);
    const endpoint = resolveProviderEndpoint(provider, false);

    if (!isStreamActive(streamId)) return;

    emit({
      type: "context",
      data: { includedFiles: [], estimatedTokens: 0, maxContextTokens: endpoint.maxTokens },
    });

    const userMessage = normalizeText(request.message);
    if (userMessage) {
      emit({ type: "resolved_user_message", data: userMessage });
    }

    const states = await loadNaviStates();
    const tips = await loadNaviTips();
    const persona = await loadNaviPersona();

    const currentStateId = normalizeText(request.naviStateId ?? "") || NAVI_INITIAL_STATE_ID;
    const currentState = getNaviState(states, currentStateId) ?? getNaviState(states, NAVI_INITIAL_STATE_ID)!;

    const facts: NaviFacts = request.naviFacts
      ? {
          ...request.naviFacts,
          slots: { ...request.naviFacts.slots },
          problemQueue: [...(request.naviFacts.problemQueue ?? [])],
        }
      : { slots: {}, problemQueue: [] };

    // Debugging aid ("why did Navi just ask/advance the way it did") — snapshot slots as they
    // were at turn start so we can diff what update_facts actually changed this turn.
    const slotsAtTurnStart = { ...facts.slots };
    const advancePhaseAttempts: { target: string; accepted: boolean; openSlots: string[] }[] = [];

    const history = Array.isArray(request.history) ? request.history : [];

    // Tip coverage is now marked in-turn by the model (mark_tip_covered) rather than by a separate
    // classifier call; this set accumulates coverage as the turn's rounds progress so later rounds
    // and the next prompt no longer offer an already-covered tip.
    const coveredTipIds = new Set<string>(request.naviCoveredTips ?? []);
    const pendingTipIds = () => tips.filter((t) => !coveredTipIds.has(t.id)).map((t) => t.id);

    const finishTurn = async (fullAssistantText: string, replyStateId: string) => {
      const labels = getAllSlotLabels(states);
      const factsChanged = Object.entries(facts.slots)
        .filter(([id, value]) => value?.trim() && slotsAtTurnStart[id] !== value)
        .map(([id, value]) => ({ label: labels.get(id) ?? id, value }));
      emit({
        type: "navi_trace",
        data: {
          at: Date.now(),
          stateId: replyStateId,
          openSlots: openSlots(states, replyStateId, facts).map((s) => s.label),
          factsChanged,
          currentProblem: facts.currentProblem,
          hypothesis: facts.hypothesis,
          recommendation: facts.recommendation,
          ...(advancePhaseAttempts.length > 0 ? { advancePhaseAttempts } : {}),
        },
      });
      if (!isStreamActive(streamId)) return;
      emit({ type: "done", data: { fullAssistantText } });
    };

    let activeStateId = currentStateId;
    let activeState = currentState;
    const messages: OpenAiMessage[] = buildNaviMessages(
      buildNaviSystemPrompt(activeState, facts, states, persona, tips, [...coveredTipIds]),
      history,
      userMessage,
    );

    let fullAssistantText = "";
    let tokenCount = 0;
    const maxRounds = 4;
    let round = 0;
    const { tools: initialTools } = buildToolSet(activeState, true, pendingTipIds());
    let currentResponsePromise: Promise<Response> = startNaviResponseFetch(endpoint, messages, initialTools);

    while (round < maxRounds) {
      if (!isStreamActive(streamId)) return;

      const roundResult = await readStreamRound(streamId, await currentResponsePromise, emit);
      tokenCount += roundResult.tokenCount;

      const bookkeepingCalls = roundResult.toolCalls.filter(
        (tc) => tc.function.name === "update_facts" || tc.function.name === "advance_phase",
      );
      const tipCalls = roundResult.toolCalls.filter((tc) => tc.function.name === "mark_tip_covered");
      const otherReplyCalls = roundResult.toolCalls.filter(
        (tc) => tc.function.name === "ask_clarification" || tc.function.name === "ask_yes_no",
      );

      for (const call of tipCalls) {
        let ids: string[] = [];
        try {
          const args = JSON.parse(call.function.arguments) as { tipIds?: unknown };
          if (Array.isArray(args.tipIds)) {
            ids = args.tipIds.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim());
          }
        } catch {
          ids = [];
        }
        const newlyCovered = ids.filter((id) => tips.some((t) => t.id === id) && !coveredTipIds.has(id));
        for (const id of newlyCovered) coveredTipIds.add(id);
        if (newlyCovered.length > 0) emit({ type: "navi_tips_covered", data: { coveredIds: newlyCovered } });
      }

      for (const call of bookkeepingCalls) {
        if (call.function.name === "update_facts") {
          const applied = applyUpdateFacts(facts, call.function.arguments);
          if (applied) emit({ type: "navi_facts", data: cloneFacts(facts) });
        } else if (call.function.name === "advance_phase") {
          let target = "";
          try {
            const args = JSON.parse(call.function.arguments) as { to?: unknown };
            target = typeof args.to === "string" ? args.to.trim() : "";
          } catch {
            target = "";
          }
          const transition = activeState.transitions.find((t) => t.to === target);
          if (!transition) {
            advancePhaseAttempts.push({ target: target || "(ungültig)", accepted: false, openSlots: [] });
            continue;
          }
          // The deterministic slot-gate applies only to the primary forward transition (index 0)
          // of a phase with a non-empty workPlan — every other transition is accepted on the
          // model's own judgment, since it's a semantic exception (topic change, satisfaction, …)
          // rather than a "have I gathered everything" progress check.
          const isGatedForward = activeState.transitions[0]?.to === target && activeState.workPlan.length > 0;
          const open = isGatedForward ? openSlots(states, activeStateId, facts) : [];
          const accepted = open.length === 0;
          advancePhaseAttempts.push({ target, accepted, openSlots: open.map((s) => s.label) });
          if (accepted) {
            const completed = activeStateId;
            activeStateId = target;
            activeState = getNaviState(states, target) ?? activeState;
            emit({ type: "navi_state", data: { stateId: activeStateId, completedStateId: completed } });
          }
        }
      }

      if (otherReplyCalls.length > 0) {
        for (const tc of otherReplyCalls) emit({ type: "tool_call", data: describeStreamingToolCall(tc) });
        const executedResults: ToolExecutionResult[] = [];
        for (const tc of otherReplyCalls) executedResults.push(await executeToolCall(tc));
        const toolHistoryMessages: ChatMessage[] = [
          { role: "assistant", content: roundResult.roundAssistantText, toolCalls: otherReplyCalls, hidden: true },
          ...executedResults.map((r) => ({
            role: "tool" as const,
            toolCallId: r.toolCallId,
            content: r.result,
            hidden: false,
          })),
        ];
        emit({ type: "tool_history", data: toolHistoryMessages });
        fullAssistantText += roundResult.roundAssistantText;
        await finishTurn(fullAssistantText, activeStateId);
        return;
      }

      // Rounds that only did silent bookkeeping (facts/phase) — or only marked a tip before the
      // visible answer exists yet — continue the loop with a freshly rendered prompt. Any round
      // that produced visible text (free-form) ends the turn, mirroring the pre-tips behaviour.
      const producedText = !!roundResult.roundAssistantText.trim();
      const continuationCalls = [...bookkeepingCalls, ...tipCalls];
      const shouldContinue = bookkeepingCalls.length > 0 || (tipCalls.length > 0 && !producedText);

      if (!shouldContinue) {
        // Free-form text round (full-persona phases) or an empty completion.
        fullAssistantText += roundResult.roundAssistantText;
        if (tokenCount === 0 && !fullAssistantText.trim()) {
          if (!isStreamActive(streamId)) return;
          emit({ type: "error", data: { message: "MODEL_EMPTY_RESPONSE" } });
          return;
        }
        await finishTurn(fullAssistantText, activeStateId);
        return;
      }

      // Continue the loop with a fresh fetch reflecting the (possibly changed) phase, updated facts
      // and remaining pending tips.
      messages.push({
        role: "assistant",
        content: roundResult.roundAssistantText,
        tool_calls: continuationCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
      for (const call of continuationCalls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
      }
      messages[0] = {
        role: "system",
        content: buildNaviSystemPrompt(activeState, facts, states, persona, tips, [...coveredTipIds]),
      };

      round += 1;
      if (!isStreamActive(streamId)) return;
      const nextIsLastRound = round === maxRounds - 1;
      const { tools: nextTools } = buildToolSet(activeState, !nextIsLastRound, pendingTipIds());
      currentResponsePromise = startNaviResponseFetch(endpoint, messages, nextTools);
    }

    // Round budget exhausted without a visible reply.
    if (!isStreamActive(streamId)) return;
    if (fullAssistantText.trim() || tokenCount > 0) {
      await finishTurn(fullAssistantText, activeStateId);
    } else {
      emit({ type: "error", data: { message: "NAVI_STREAM_STUCK" } });
    }
  } catch (error) {
    if (!isStreamActive(streamId)) return;
    emit({
      type: "error",
      data: { message: error instanceof Error ? error.message : "NAVI_STREAM_FAILED" },
    });
  }
}

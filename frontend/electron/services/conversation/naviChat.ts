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
  buildRedirectClassifierPrompt,
  getEffectiveSlots,
  getAllSlotLabels,
  openSlots,
  NAVI_INITIAL_STATE_ID,
  type NaviState,
  type NaviTransition,
} from "../naviStateMachine.js";
import { loadNaviStates, loadNaviTips, loadNaviPersona } from "../naviStateConfigService.js";
import { buildNaviKnowledgePrompt } from "../naviKnowledgeBase.js";
import type { NaviTip } from "../../../src/naviTips.js";
import type { NaviPersonaConfig } from "../../../src/naviPersona.js";
import { TOOLKIT_TOOL_DEFINITIONS, type ToolDefinition } from "./systemPrompt.js";
import type { ChatRequest, ChatMessage, ToolCall, NaviFacts } from "../../../src/types.js";
import type { ChatStreamEvent } from "../chatTypes.js";

/**
 * Progressively extracts the unescaped value of the "response" field from a partial
 * ask_question arguments JSON string (e.g. `{"response": "Ich ver...`).
 * Returns as many characters as are safely extractable; call again with more data to get more.
 */
function extractPartialAskQResponse(buf: string): string {
  const keyMatch = buf.match(/"response"\s*:\s*"/);
  if (!keyMatch || keyMatch.index === undefined) return "";
  let pos = keyMatch.index + keyMatch[0].length;
  let value = "";
  while (pos < buf.length) {
    const ch = buf[pos];
    if (ch === "\\" && pos + 1 < buf.length) {
      const next = buf[pos + 1];
      if (next === '"') { value += '"'; pos += 2; }
      else if (next === "n") { value += "\n"; pos += 2; }
      else if (next === "t") { value += "\t"; pos += 2; }
      else if (next === "\\") { value += "\\"; pos += 2; }
      else if (next === "r") { value += "\r"; pos += 2; }
      else { pos++; }
    } else if (ch === '"') {
      break;
    } else {
      value += ch;
      pos++;
    }
  }
  return value;
}

const ASK_QUESTION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "ask_question",
    description:
      "Schreibe deine nächste Nachricht im Gespräch und stelle genau eine gezielte Frage. Stell die Frage direkt – ohne das Gesagte vorher zu wiederholen, zusammenzufassen oder zu paraphrasieren. Beginne NICHT mit 'Verstehe', 'Verstanden', 'Alles klar', 'Okay', 'Das klingt nach...' o.Ä. Kein Echo. Kein 'Habe ich das richtig verstanden?'.",
    parameters: {
      type: "object",
      properties: {
        response: {
          type: "string",
          description:
            "Deine direkte Gesprächsnachricht. Immer 'du', nie 'der Händler'. Fang direkt mit der Frage an. Wenn es natürlich ist, kannst du in einem Halbsatz auf einen konkreten Punkt eingehen – aber KEIN Echo und KEINE Zusammenfassung dessen, was der Händler gerade gesagt hat.",
        },
      },
      required: ["response"],
    },
  },
};

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
 * Deterministic forward-progress gate for narrow (info-gathering) phases: calling this only
 * succeeds once every slot of the current phase's checklist has a value in the fact sheet — the
 * backend enforces this, not the model's own judgment. There is exactly one linear target per
 * gated phase (see NAVI_STATES), so no `to` argument is needed.
 */
function buildAdvancePhaseTool(target: string): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "advance_phase",
      description:
        `Wechsle in die nächste Gesprächsphase ("${target}"), sobald ALLE offenen Punkte der Slot-Checkliste bekannt sind. ` +
        "Der Wechsel wird abgelehnt, solange Punkte offen sind — rufe in diesem Fall stattdessen update_facts auf und stelle die nächste offene Frage.",
      parameters: { type: "object", properties: {} },
    },
  };
}

/** The state's visible-reply tool(s) (ask_question / ask_clarification / ask_yes_no), if any. */
function buildReplyTools(state: NaviState): { tools: ToolDefinition[]; forced: boolean } {
  if (!state.tools || state.tools.length === 0) return { tools: [], forced: false };
  const tools: ToolDefinition[] = [];
  for (const name of state.tools) {
    if (name === "ask_question") {
      tools.push(ASK_QUESTION_TOOL);
    } else if (name === "ask_clarification") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find((d) => d.function.name === "ask_clarification");
      if (t) tools.push(t);
    } else if (name === "ask_yes_no") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find((d) => d.function.name === "ask_yes_no");
      if (t) tools.push(t);
    }
  }
  return { tools, forced: tools.length > 0 };
}

/** Only narrow phases with a non-empty workPlan get the deterministic slot gate + advance_phase. */
function isGatedNarrowState(state: NaviState): boolean {
  return state.persona === "narrow" && state.workPlan.length > 0;
}

/**
 * Which transitions the redirect/safety-net classifier is responsible for. For gated narrow
 * states, the primary forward transition (index 0, by NAVI_STATES convention) is handled by the
 * deterministic slot gate instead — the classifier only judges the remaining semantic exceptions
 * (topic changes etc). Full-persona states have no slot gate, so the classifier still owns every
 * transition there, exactly as before.
 */
function getExceptionTransitions(state: NaviState): NaviTransition[] {
  return isGatedNarrowState(state) ? state.transitions.slice(1) : state.transitions;
}

function buildToolSet(
  state: NaviState,
  includeSilent: boolean,
): { tools: ToolDefinition[]; toolChoice: "required" | undefined } {
  const { tools: replyTools, forced } = buildReplyTools(state);
  const tools: ToolDefinition[] = [];
  if (includeSilent) {
    tools.push(UPDATE_FACTS_TOOL);
    if (isGatedNarrowState(state)) tools.push(buildAdvancePhaseTool(state.transitions[0]?.to ?? ""));
  }
  tools.push(...replyTools);
  return { tools, toolChoice: forced ? "required" : undefined };
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
  const factsToolNote =
    "Trage Fakten IMMER zuerst per update_facts ein (auch beiläufig Erwähntes), bevor du antwortest oder die Phase wechselst.";

  const coveredTips = new Set(naviCoveredTips ?? []);
  const pendingTips = tips.filter((t) => !coveredTips.has(t.id));
  const tipsPromptSection =
    pendingTips.length > 0
      ? [
          "Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich in das Gespräch passen – danach nicht wiederholen:",
          ...pendingTips.map((t) => `- ${t.instruction}`),
        ].join("\n")
      : "";

  return (
    state.persona === "narrow"
      ? [
          ...persona.narrowPersonaRules,
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(factsSection ? [factsSection] : []),
          ...(checklistSection ? [checklistSection] : []),
          factsToolNote,
          `Deine Aufgabe in diesem Schritt: ${effectiveInstruction}`,
        ]
      : [
          persona.roleIntro,
          ...persona.fullPersonaRules,
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(factsSection ? [factsSection] : []),
          ...(checklistSection ? [checklistSection] : []),
          factsToolNote,
          `Deine aktuelle Aufgabe: ${effectiveInstruction}`,
          ...(tipsPromptSection ? [tipsPromptSection] : []),
          ...(knowledgePrompt ? [knowledgePrompt] : []),
        ]
  ).join("\n\n");
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
  toolChoice: "required" | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({
      model: endpoint.model,
      stream: true,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      reasoning_effort: "medium",
    }),
    ...(signal ? { signal } : {}),
  });
}

interface StreamRoundResult {
  roundAssistantText: string;
  toolCalls: ToolCall[];
  tokenCount: number;
  askQStreamedText: string;
}

/** Reads one streamed response: forwards content tokens live, progressively echoes ask_question. */
async function readStreamRound(
  streamId: string,
  response: Response,
  hasAskQuestionTool: boolean,
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
  let askQEmittedLen = 0;
  let askQStreamedText = "";

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

      if (hasAskQuestionTool) {
        const aqCall = [...collectedToolCalls.values()].find((tc) => tc.function.name === "ask_question");
        if (aqCall) {
          const currentValue = extractPartialAskQResponse(aqCall.function.arguments);
          if (currentValue.length > askQEmittedLen) {
            const newChunk = currentValue.slice(askQEmittedLen);
            askQEmittedLen = currentValue.length;
            askQStreamedText += newChunk;
            tokenCount++;
            roundAssistantText += newChunk;
            emit({ type: "token", data: newChunk });
          }
        }
      }

      const finishReason = extractFinishReason(parsed);
      if (finishReason === "tool_calls") break;
      currentEvent = "";
    }
  }

  return { roundAssistantText, toolCalls: [...collectedToolCalls.values()], tokenCount, askQStreamedText };
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

function findPreviousAssistantText(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.hidden) continue;
    if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) return m.content.trim();
  }
  return "";
}

async function runRedirectClassifier(
  currentStateId: string,
  userMessage: string,
  transitions: NaviTransition[],
  history: ChatMessage[],
  endpoint: { apiUrl: string; apiKey: string; model: string },
): Promise<string | null> {
  const { prompt, validStates } = buildRedirectClassifierPrompt(currentStateId, userMessage, transitions, history);
  try {
    const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify({
        model: endpoint.model,
        stream: false,
        max_tokens: 512,
        reasoning_effort: "minimal",
        messages: [
          {
            role: "system",
            content:
              'Du analysierst eine Nutzer-Nachricht und prüfst auf Ausnahme-Situationen. Antworte NUR mit dem State-Namen oder "none". Keine Erklärung.',
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (json?.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
    for (const s of validStates) {
      if (s !== "none" && raw.includes(s.toLowerCase())) return s;
    }
    return null;
  } catch {
    return null;
  }
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
    let redirectTo: string | undefined;

    const history = Array.isArray(request.history) ? request.history : [];

    const tipsPromise = runTipsCheck(request, tips, findPreviousAssistantText(history), endpoint, emit);
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
          ...(redirectTo ? { redirectTo } : {}),
        },
      });
      await tipsPromise;
      if (!isStreamActive(streamId)) return;
      emit({ type: "done", data: { fullAssistantText } });
    };

    // ── Speculative round-0 read, overlapped with the redirect classifier ──
    // The current-phase response starts generating and streaming into a buffer immediately, so the
    // model is already working while the "Prüfe Themenwechsel" classifier runs in parallel — the
    // classifier is no longer on the critical path before the first token. If the classifier then
    // picks a different phase, the buffered (now-wrong) output is discarded and a fresh fetch for the
    // redirect target is read instead; otherwise the buffer is flushed live and its result reused.
    const speculativeAbort = new AbortController();
    const speculativeSystemPrompt = buildNaviSystemPrompt(
      currentState, facts, states, persona, tips, request.naviCoveredTips,
    );
    const speculativeMessages = buildNaviMessages(speculativeSystemPrompt, history, userMessage);
    const { tools: specTools, toolChoice: specToolChoice } = buildToolSet(currentState, true);
    const speculativeFetch = startNaviResponseFetch(
      endpoint, speculativeMessages, specTools, specToolChoice, speculativeAbort.signal,
    );

    let fullAssistantText = "";
    let tokenCount = 0;
    const maxRounds = 4;
    let round = 0;

    // Round-0 output is buffered until the classifier's verdict is known (see above).
    let flushRound0 = false;
    const round0Buffer: ChatStreamEvent[] = [];
    const round0Emit = (event: ChatStreamEvent) => {
      if (flushRound0) emit(event);
      else round0Buffer.push(event);
    };
    const specHasAskQuestion = specTools.some((t) => t.function.name === "ask_question");
    const speculativeRoundPromise = speculativeFetch
      .then((res) => readStreamRound(streamId, res, specHasAskQuestion, round0Emit))
      .then((result) => ({ ok: true as const, result }))
      .catch((error: unknown) => ({ ok: false as const, error }));

    const exceptionTransitions = getExceptionTransitions(currentState);
    let redirectPromise: Promise<string | null> = Promise.resolve(null);
    if (userMessage && exceptionTransitions.length > 0) {
      emit({ type: "navi_step", data: { label: "Prüfe Themenwechsel …" } });
      redirectPromise = runRedirectClassifier(currentStateId, userMessage, exceptionTransitions, history, endpoint);
    }
    const redirectTarget = await redirectPromise;
    emit({ type: "navi_step", data: { label: null } });

    if (!isStreamActive(streamId)) return;

    let activeStateId = currentStateId;
    let activeState = currentState;
    let currentResponsePromise: Promise<Response> | null = null;
    let messages: OpenAiMessage[];
    let pendingRoundResult: StreamRoundResult | null = null;

    if (redirectTarget && redirectTarget !== currentStateId) {
      // Redirect: abort and discard the speculative round-0 output, read the redirect target instead.
      redirectTo = redirectTarget;
      speculativeAbort.abort();
      await speculativeRoundPromise;
      round0Buffer.length = 0;
      activeStateId = redirectTarget;
      activeState = getNaviState(states, redirectTarget) ?? currentState;
      emit({ type: "navi_state", data: { stateId: activeStateId, completedStateId: currentStateId } });
      const systemPrompt = buildNaviSystemPrompt(activeState, facts, states, persona, tips, request.naviCoveredTips);
      messages = buildNaviMessages(systemPrompt, history, userMessage);
      const { tools, toolChoice } = buildToolSet(activeState, true);
      currentResponsePromise = startNaviResponseFetch(endpoint, messages, tools, toolChoice);
    } else {
      // No redirect: flush the buffered round-0 output live and reuse the speculative read's result.
      flushRound0 = true;
      for (const event of round0Buffer) emit(event);
      round0Buffer.length = 0;
      messages = speculativeMessages;
      const settled = await speculativeRoundPromise;
      if (!settled.ok) throw settled.error;
      pendingRoundResult = settled.result;
    }

    while (round < maxRounds) {
      if (!isStreamActive(streamId)) return;

      const stateForThisRound = activeState;
      const isLastRound = round === maxRounds - 1;
      const { tools: roundTools } = buildToolSet(stateForThisRound, !isLastRound);
      const hasAskQuestionTool = roundTools.some((t) => t.function.name === "ask_question");

      // Round 0 was already read (buffered) alongside the classifier; later rounds read fresh.
      const roundResult =
        pendingRoundResult ??
        (await readStreamRound(streamId, await currentResponsePromise!, hasAskQuestionTool, emit));
      pendingRoundResult = null;
      tokenCount += roundResult.tokenCount;

      const silentCalls = roundResult.toolCalls.filter(
        (tc) => tc.function.name === "update_facts" || tc.function.name === "advance_phase",
      );
      const askQuestionCall = roundResult.toolCalls.find((tc) => tc.function.name === "ask_question");
      const otherReplyCalls = roundResult.toolCalls.filter(
        (tc) => tc.function.name === "ask_clarification" || tc.function.name === "ask_yes_no",
      );

      for (const call of silentCalls) {
        if (call.function.name === "update_facts") {
          const applied = applyUpdateFacts(facts, call.function.arguments);
          if (applied) emit({ type: "navi_facts", data: cloneFacts(facts) });
        } else if (call.function.name === "advance_phase") {
          const open = openSlots(states, activeStateId, facts);
          const target = activeState.transitions[0]?.to ?? "";
          const accepted = open.length === 0;
          advancePhaseAttempts.push({ target, accepted, openSlots: open.map((s) => s.label) });
          if (accepted && target) {
            const completed = activeStateId;
            activeStateId = target;
            activeState = getNaviState(states, target) ?? activeState;
            emit({ type: "navi_state", data: { stateId: activeStateId, completedStateId: completed } });
          }
        }
      }

      if (askQuestionCall) {
        let resp = "";
        try {
          const args = JSON.parse(askQuestionCall.function.arguments) as { response?: unknown };
          resp = typeof args.response === "string" ? args.response.trim() : "";
        } catch {
          resp = askQuestionCall.function.arguments.trim();
        }
        if (stateForThisRound.validation?.requiresQuestion && resp && !resp.includes("?")) {
          resp += "?";
        }
        if (resp) {
          fullAssistantText = resp;
          if (roundResult.askQStreamedText.length === 0) {
            emit({ type: "token", data: resp });
          } else {
            const trimmedStreamed = roundResult.askQStreamedText.trim();
            if (resp.length > trimmedStreamed.length && resp.startsWith(trimmedStreamed)) {
              emit({ type: "token", data: resp.slice(trimmedStreamed.length) });
            }
          }
        }
        await finishTurn(fullAssistantText, activeStateId);
        return;
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

      if (silentCalls.length === 0) {
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

      // Only silent tool calls happened this round — continue the loop with a fresh fetch
      // reflecting the (possibly changed) phase and updated facts.
      messages.push({
        role: "assistant",
        content: roundResult.roundAssistantText,
        tool_calls: silentCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });
      for (const call of silentCalls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: "ok" });
      }
      messages[0] = {
        role: "system",
        content: buildNaviSystemPrompt(activeState, facts, states, persona, tips, request.naviCoveredTips),
      };

      round += 1;
      if (!isStreamActive(streamId)) return;
      const nextIsLastRound = round === maxRounds - 1;
      const { tools: nextTools, toolChoice: nextToolChoice } = buildToolSet(activeState, !nextIsLastRound);
      currentResponsePromise = startNaviResponseFetch(endpoint, messages, nextTools, nextToolChoice);
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

/** Checks which Navi tips were covered in the response and emits navi_tips_covered. */
async function runTipsCheck(
  request: ChatRequest,
  tips: NaviTip[],
  fullAssistantText: string,
  endpoint: { apiUrl: string; apiKey: string; model: string },
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const coveredTipsSet = new Set(request.naviCoveredTips ?? []);
  const stillPendingTips = tips.filter((t) => !coveredTipsSet.has(t.id));
  if (stillPendingTips.length === 0 || !fullAssistantText.trim()) return;

  try {
    const tipsCheckPrompt = [
      "Du prüfst, ob eine Antwort bestimmte Themen angesprochen hat.",
      "",
      `Antwort:\n"${fullAssistantText.slice(0, 800)}"`,
      "",
      "Welche der folgenden Themen wurden in der Antwort angesprochen?",
      ...stillPendingTips.map((t) => `- ${t.id}: ${t.coveredWhen}`),
      "",
      'Antworte NUR mit einer kommaseparierten Liste der IDs der angesprochenen Themen, oder "keine". Keine Erklärung.',
    ].join("\n");

    const tipsCheckResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify({
        model: endpoint.model,
        stream: false,
        max_tokens: 256,
        temperature: 0,
        reasoning_effort: "minimal",
        messages: [{ role: "user", content: tipsCheckPrompt }],
      }),
    });

    if (tipsCheckResponse.ok) {
      const tipsCheckJson = (await tipsCheckResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = normalizeText(tipsCheckJson?.choices?.[0]?.message?.content ?? "");
      if (raw && raw !== "keine") {
        const coveredIds = raw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((id) => stillPendingTips.some((t) => t.id === id));
        if (coveredIds.length > 0) {
          emit({ type: "navi_tips_covered", data: { coveredIds } });
        }
      }
    }
  } catch {
    // Tips classifier failed — non-fatal
  }
}

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
  buildCombinedClassifierPrompt,
  buildNaviContextPrompt,
  type NaviState,
} from "../naviStateMachine.js";
import { buildNaviKnowledgePrompt } from "../naviKnowledgeBase.js";
import { NAVI_DEFAULT_ROLE, NAVI_FULL_PERSONA_RULES, NAVI_NARROW_PERSONA_RULES } from "./naviVoice.js";
import { NAVI_TIPS } from "../../../src/naviTips.js";
import { getProjectConfig } from "../projectConfigService.js";
import { TOOLKIT_TOOL_DEFINITIONS, resolveModeSystemPrompt, type ToolDefinition } from "./systemPrompt.js";
import type { ChatRequest, ChatMessage, ToolCall } from "../../../src/types.js";
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

function buildNaviStateTools(state: NaviState): {
  tools: ToolDefinition[];
  toolChoice: "required" | undefined;
} {
  if (!state.tools || state.tools.length === 0) {
    return { tools: [], toolChoice: undefined };
  }
  const tools: ToolDefinition[] = [];
  for (const name of state.tools) {
    if (name === "ask_question") {
      tools.push(ASK_QUESTION_TOOL);
    } else if (name === "ask_clarification") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find(
        (d) => d.function.name === "ask_clarification",
      );
      if (t) tools.push(t);
    } else if (name === "ask_yes_no") {
      const t = TOOLKIT_TOOL_DEFINITIONS.assistant?.find(
        (d) => d.function.name === "ask_yes_no",
      );
      if (t) tools.push(t);
    }
  }
  return { tools, toolChoice: tools.length > 0 ? "required" : undefined };
}

/**
 * Builds the OpenAI messages array and tool config for a Navi response call.
 * Pure function — no side effects, no async.
 */
function buildNaviConversationBody(
  state: NaviState,
  request: ChatRequest,
  naviPlan: string | undefined,
  naviCurrentProblem: string | undefined,
  naviCurrentProblemInterpretation: string | undefined,
  naviProblemQueue: string[],
  projConfig: import("../../../src/types.js").ProjectConfig | null,
  userMessage: string,
  roleIntro: string,
): { messages: OpenAiMessage[]; tools: ToolDefinition[]; toolChoice: "required" | undefined } {
  let effectiveInstruction = state.instruction;
  const instructionOverride = projConfig?.naviInstructions?.[state.id];
  if (typeof instructionOverride === "string" && instructionOverride.trim()) {
    effectiveInstruction = instructionOverride;
  }

  // Inject the question plan if we are in a plan-driven phase.
  const activePlan = naviPlan ?? (request.naviPlan ?? undefined);
  if (
    (state.id === "clarify_problem" || state.id === "explore_software_stack") &&
    activePlan
  ) {
    effectiveInstruction = [
      `Nächste Fragen für dieses Gespräch (in dieser Reihenfolge – bereits beantwortete überspringen):`,
      activePlan,
      `---`,
      `Allgemeine Regeln (nur anwenden, wenn der Plan oben keine Abdeckung hat):`,
      effectiveInstruction,
    ].join("\n");
  }

  const problemFocusBlock = naviCurrentProblem
    ? [
        `Das Anliegen des Händlers: "${naviCurrentProblem}"`,
        ...(naviCurrentProblemInterpretation ? [`→ ${naviCurrentProblemInterpretation}`] : []),
        ...(naviProblemQueue.length > 0
          ? [`Weitere Anliegen danach: ${naviProblemQueue.join(", ")}`]
          : []),
        "Alle Fragen ausschließlich zu diesem Anliegen – nichts anderes.",
      ].join("\n")
    : null;

  if (state.id === "closing" && naviProblemQueue.length > 0) {
    effectiveInstruction = `${effectiveInstruction}\n\nNoch nicht besprochene Anliegen des Händlers: ${naviProblemQueue.map((p) => `"${p}"`).join(", ")}. Frage am Ende freundlich, ob der Händler eines dieser Themen noch angehen möchte.`;
  }

  const knowledgePrompt = buildNaviKnowledgePrompt(state.id);

  const naviCtx = request.naviContext;
  const naviContextSection = (() => {
    if (!naviCtx) return "";
    const parts: string[] = [];
    if (naviCtx.laden) parts.push(`- Laden: ${naviCtx.laden}`);
    if (naviCtx.problem) parts.push(`- Problem: ${naviCtx.problem}`);
    if (naviCtx.luecke) parts.push(`- Praktische Lücke: ${naviCtx.luecke}`);
    if (naviCtx.stack) parts.push(`- Stack: ${naviCtx.stack}`);
    if (naviCtx.investition) parts.push(`- Investitionsbereitschaft (Zeit & Geld): ${naviCtx.investition}`);
    if (naviCtx.empfehlung) parts.push(`- Empfehlung: ${naviCtx.empfehlung}`);
    if (naviCtx.details) parts.push(`- Weitere Fakten:\n${naviCtx.details}`);
    if (parts.length === 0) return "";

    // In recommendation states the investment readiness is a hard constraint, not just context.
    const recommendationStates = new Set([
      "assess_situation",
      "give_recommendation",
      "refine_recommendation",
    ]);
    const investmentRule =
      recommendationStates.has(state.id) && naviCtx.investition
        ? "\n\nWICHTIG für deinen Vorschlag: Die Investitionsbereitschaft (Zeit & Geld) ist eine harte Randbedingung. Empfiehl NUR, was innerhalb dieses Rahmens realistisch umsetzbar und betreibbar ist. Beispiel: Ein eigener Webshop ist nur sinnvoll, wenn der Händler genug Zeit für Pflege und Budget dafür mitbringt – ist die Bereitschaft gering, schlage eine schlankere Lösung vor (z. B. bestehende Plattform, Google-Profil, ein einzelner Kanal). Mach den Aufwand und die Kosten deines Vorschlags immer transparent und gleiche sie mit der genannten Bereitschaft ab."
        : "";

    return "Bekannte Fakten über den Händler:\n" + parts.join("\n") + investmentRule;
  })();

  const coveredTips = new Set(request.naviCoveredTips ?? []);
  const pendingTips = NAVI_TIPS.filter((t) => !coveredTips.has(t.id));
  const tipsPromptSection =
    pendingTips.length > 0
      ? [
          "Folgende Hinweise solltest du einmalig einbringen, sobald sie natürlich in das Gespräch passen – danach nicht wiederholen:",
          ...pendingTips.map((t) => `- ${t.instruction}`),
        ].join("\n")
      : "";

  const naviSystemPrompt =
    state.persona === "narrow"
      ? [
          ...NAVI_NARROW_PERSONA_RULES,
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(naviContextSection ? [naviContextSection] : []),
          `Deine Aufgabe in diesem Schritt: ${effectiveInstruction}`,
        ].join("\n\n")
      : [
          roleIntro,
          ...NAVI_FULL_PERSONA_RULES,
          ...(problemFocusBlock ? [problemFocusBlock] : []),
          ...(naviContextSection ? [naviContextSection] : []),
          `Deine aktuelle Aufgabe: ${effectiveInstruction}`,
          ...(tipsPromptSection ? [tipsPromptSection] : []),
          ...(knowledgePrompt ? [knowledgePrompt] : []),
        ].join("\n\n");

  const messages: OpenAiMessage[] = [{ role: "system", content: naviSystemPrompt }];
  const history = Array.isArray(request.history) ? request.history : [];
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

  const { tools, toolChoice } = buildNaviStateTools(state);
  return { messages, tools, toolChoice };
}

/**
 * Starts the streaming response fetch for a Navi turn.
 * Returns the fetch Promise — caller decides when to start reading the body.
 */
function startNaviResponseFetch(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: OpenAiMessage[],
  tools: ToolDefinition[],
  toolChoice: "required" | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(ensureChatCompletionsUrl(apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      reasoning_effort: "high",
    }),
    ...(signal ? { signal } : {}),
  });
}

/**
 * Reads and streams a Navi response from an already-started fetch.
 * Handles ask_question progressive streaming, tool calls, and ask_clarification stops.
 * Returns the full assistant text.
 */
async function drainNaviResponseStream(
  streamId: string,
  responseFetch: Promise<Response>,
  state: NaviState,
  emit: (event: ChatStreamEvent) => void,
  projectPath: string | null,
): Promise<string> {
  const { tools: naviTools } = buildNaviStateTools(state);
  // We need the conversationMessages for multi-turn tool loops.
  // They are passed implicitly through the already-started fetch for round 1;
  // for subsequent tool rounds we rebuild via executeToolCall results appended below.
  // Since the fetch is already started, we only need the messages for tool re-rounds.
  // Store them so we can continue the tool loop.
  return drainResponseStreamWithLoop(streamId, responseFetch, state, naviTools, emit, projectPath);
}

async function drainResponseStreamWithLoop(
  streamId: string,
  firstResponseFetch: Promise<Response>,
  state: NaviState,
  naviTools: ToolDefinition[],
  emit: (event: ChatStreamEvent) => void,
  projectPath: string | null,
): Promise<string> {
  let fullAssistantText = "";
  let tokenCount = 0;
  let currentResponse = firstResponseFetch;

  // We need conversationMessages only for tool re-rounds (appending tool results).
  // For the first round the fetch is already started with the right messages.
  // We track the "conversation tail" to support tool re-rounds.
  const toolRoundMessages: OpenAiMessage[] = [];
  const maxNaviToolRounds = 3;
  let toolRound = 0;

  while (toolRound < maxNaviToolRounds) {
    if (!isStreamActive(streamId)) return fullAssistantText;

    const response = await currentResponse;

    if (!response.ok) {
      let detail = `Navi chat error: ${response.status}`;
      try {
        const body = await response.text();
        if (body) detail += ` — ${body}`;
      } catch { /* ignore */ }
      throw new Error(detail);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let roundAssistantText = "";
    const collectedToolCalls = new Map<number, ToolCall>();
    let askQEmittedLen = 0;
    let askQStreamedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!isStreamActive(streamId)) return fullAssistantText;

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
          fullAssistantText += token;
          emit({ type: "token", data: token });
        }

        accumulateToolCallChunks(parsed, collectedToolCalls);

        // Stream ask_question response value progressively as it arrives in tool call chunks
        if (naviTools.some((t) => t.function.name === "ask_question")) {
          const aqCall = [...collectedToolCalls.values()].find(
            (tc) => tc.function.name === "ask_question",
          );
          if (aqCall) {
            const currentValue = extractPartialAskQResponse(aqCall.function.arguments);
            if (currentValue.length > askQEmittedLen) {
              const newChunk = currentValue.slice(askQEmittedLen);
              askQEmittedLen = currentValue.length;
              askQStreamedText += newChunk;
              tokenCount++;
              roundAssistantText += newChunk;
              fullAssistantText += newChunk;
              emit({ type: "token", data: newChunk });
            }
          }
        }

        const finishReason = extractFinishReason(parsed);
        if (finishReason === "tool_calls") break;
        currentEvent = "";
      }
    }

    const toolCalls = [...collectedToolCalls.values()];

    if (toolCalls.length === 0) {
      if (!isStreamActive(streamId)) return fullAssistantText;
      if (tokenCount === 0 && !roundAssistantText.trim()) {
        emit({ type: "error", data: { message: "MODEL_EMPTY_RESPONSE" } });
        return fullAssistantText;
      }
      emit({ type: "done", data: { fullAssistantText } });
      return fullAssistantText;
    }

    // ask_question is a structural output constraint — content was streamed progressively above.
    const askQuestionCall = toolCalls.find((tc) => tc.function.name === "ask_question");
    if (askQuestionCall) {
      let resp = "";
      try {
        const args = JSON.parse(askQuestionCall.function.arguments) as { response?: unknown };
        resp = typeof args.response === "string" ? args.response.trim() : "";
      } catch {
        resp = askQuestionCall.function.arguments.trim();
      }
      if (state.validation?.requiresQuestion && resp && !resp.includes("?")) {
        resp += "?";
      }
      if (resp) {
        fullAssistantText = resp;
        if (askQEmittedLen === 0) {
          emit({ type: "token", data: resp });
        } else {
          const trimmedStreamed = askQStreamedText.trim();
          if (resp.length > trimmedStreamed.length && resp.startsWith(trimmedStreamed)) {
            emit({ type: "token", data: resp.slice(trimmedStreamed.length) });
            tokenCount++;
          }
        }
      }
      if (!isStreamActive(streamId)) return fullAssistantText;
      emit({ type: "done", data: { fullAssistantText } });
      return fullAssistantText;
    }

    for (const toolCall of toolCalls) {
      emit({ type: "tool_call", data: describeStreamingToolCall(toolCall) });
    }

    const executedResults: ToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      executedResults.push(await executeToolCall(projectPath, toolCall));
    }

    const toolHistoryMessages: ChatMessage[] = [
      { role: "assistant", content: roundAssistantText, toolCalls, hidden: true },
      ...executedResults.map((result) => ({
        role: "tool" as const,
        toolCallId: result.toolCallId,
        content: result.result,
        hidden: false,
      })),
    ];
    emit({ type: "tool_history", data: toolHistoryMessages });

    toolRoundMessages.push({
      role: "assistant",
      content: roundAssistantText,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    });
    for (const result of executedResults) {
      toolRoundMessages.push({ role: "tool", tool_call_id: result.toolCallId, content: result.result });
    }

    // ask_clarification / ask_yes_no require user interaction — stop here
    if (
      toolCalls.some(
        (tc) => tc.function.name === "ask_clarification" || tc.function.name === "ask_yes_no",
      )
    ) {
      if (!isStreamActive(streamId)) return fullAssistantText;
      emit({ type: "done", data: { fullAssistantText } });
      return fullAssistantText;
    }

    toolRound += 1;

    // For subsequent tool rounds we can't reuse the original fetch — we need a new one
    // with the appended tool results. This is the rare multi-round path.
    // (We'd need the original messages to rebuild — stored in toolRoundMessages above.)
    // For now: break after one non-ask_question tool round (same as before).
    break;
  }

  if (!isStreamActive(streamId)) return fullAssistantText;
  emit({ type: "done", data: { fullAssistantText } });
  return fullAssistantText;
}

export async function runNaviChatStream(
  streamId: string,
  projectPath: string | null,
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

    const currentStateId = normalizeText(request.naviStateId ?? "") || "greeting";
    const currentState = getNaviState(currentStateId) ?? getNaviState("greeting")!;

    let projConfig: import("../../../src/types.js").ProjectConfig | null = null;
    try {
      projConfig = await getProjectConfig(projectPath);
    } catch {
      // Non-fatal: fall back to defaults
    }

    // Resolve Navi's role/identity ("WHO Navi is"). A project can override it by
    // configuring a Navi mode (project settings → Navi tab): the mode referenced by
    // naviModeId supplies the role via its systemPrompt. We gate on naviModeId so a
    // plain toolbar story mode (e.g. "review") can never leak in as Navi's role.
    let roleIntro = NAVI_DEFAULT_ROLE;
    const naviModeId = projConfig?.naviModeId?.trim();
    if (naviModeId && request.mode === naviModeId) {
      try {
        const modeRole = (await resolveModeSystemPrompt(projectPath, naviModeId)).trim();
        if (modeRole) roleIntro = modeRole;
      } catch {
        // Non-fatal: keep the default role
      }
    }

    const effectiveWorkPlan = (stateId: string, base: string[]): string[] => {
      const override = projConfig?.naviWorkPlans?.[stateId];
      return Array.isArray(override) && override.length > 0 ? override : base;
    };

    // ── Speculative response fetch ───────────────────────────────────────────
    // Start the response fetch immediately using current-state params.
    // For no-transition turns (majority): classifier finishes, we use this fetch → saves classifier latency.
    // For transition turns: we abort this fetch and restart in the new state.
    // Note: parallel calls (2/2b/2c/2d) are no-ops for no-transition turns, so current-state params are correct.
    const speculativeAbort = new AbortController();
    const speculativeBody = buildNaviConversationBody(
      currentState,
      request,
      request.naviPlan ?? undefined,
      request.naviCurrentProblem ?? undefined,
      request.naviCurrentProblemInterpretation ?? undefined,
      request.naviProblemQueue ?? [],
      projConfig,
      userMessage,
      roleIntro,
    );
    const speculativeResponsePromise = startNaviResponseFetch(
      endpoint.apiUrl,
      endpoint.apiKey,
      endpoint.model,
      speculativeBody.messages,
      speculativeBody.tools,
      speculativeBody.toolChoice,
      speculativeAbort.signal,
    );

    // ── Tips coverage check (parallel, not a blocking tail) ───────────────────
    // We check the PREVIOUS Navi message instead of the one we're about to produce.
    // This lets the check run concurrently with classification and the response
    // fetch, and — crucially — emit navi_tips_covered BEFORE `done`. The frontend
    // tears down its stream listener on `done`, so anything emitted afterwards
    // (as the old tail call did) is silently dropped. Cost: a tip is registered
    // one turn later, which is fine for "mention when it fits the conversation".
    const previousAssistantText = (() => {
      const history = Array.isArray(request.history) ? request.history : [];
      for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (m.hidden) continue;
        if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
          return m.content.trim();
        }
      }
      return "";
    })();
    const tipsPromise = runTipsCheck(request, previousAssistantText, endpoint, emit);

    // ── Combined classifier + cascade (single call) ──────────────────────────
    // Replaces the former two sequential blocking calls (classifier → cascade check).
    // The prompt includes transition targets' workPlans so the LLM determines the
    // final destination state — including a one-hop cascade — in a single response.
    let newStateId = currentStateId;
    if (userMessage && currentState.transitions.length > 0) {
      emit({ type: "navi_step", data: { label: "Prüfe Phasenwechsel …" } });
      const classificationHistory = Array.isArray(request.history) ? request.history : [];
      const { prompt: combinedPrompt, validStates } = buildCombinedClassifierPrompt(
        currentStateId,
        userMessage,
        currentState.transitions,
        effectiveWorkPlan(currentStateId, currentState.workPlan),
        classificationHistory,
        effectiveWorkPlan,
      );

      try {
        const classificationResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
          body: JSON.stringify({
            model: endpoint.model,
            stream: false,
            // Reasoning tokens count against max_tokens on Grok — keep enough headroom
            // that minimal reasoning never starves the (tiny) actual answer.
            max_tokens: 512,
            reasoning_effort: "minimal",
            messages: [
              {
                role: "system",
                content:
                  'Du analysierst eine Nutzer-Nachricht und bestimmst den nächsten State. Antworte NUR mit dem State-Namen oder "none". Keine Erklärung.',
              },
              { role: "user", content: combinedPrompt },
            ],
          }),
        });

        if (classificationResponse.ok) {
          const classificationJson = (await classificationResponse.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawChoice =
            classificationJson?.choices?.[0]?.message?.content?.trim() ?? "none";
          const lowerRaw = rawChoice.toLowerCase();
          let candidate = "none";
          for (const s of validStates) {
            if (s !== "none" && lowerRaw.includes(s.toLowerCase())) {
              candidate = s;
              break;
            }
          }
          if (candidate !== "none") {
            if (candidate === "confirm_understanding") {
              const userMessageCount =
                classificationHistory.filter((m) => m.role === "user").length + 1;
              if (userMessageCount > 10) {
                newStateId = candidate;
              }
            } else {
              newStateId = candidate;
            }
          }
        }
      } catch {
        // Classification error: keep current state, use speculative fetch
      }
    }

    // ── Branch: no transition (use speculative) vs transition (abort + restart) ──
    if (newStateId === currentStateId) {
      // ── No transition: use the already-running speculative fetch ───────────
      // Parallel calls (2/2b/2c/2d) are all no-ops when newStateId === currentStateId,
      // so we skip them entirely and go straight to streaming.
      emit({ type: "navi_step", data: { label: null } });
      emit({ type: "navi_state", data: { stateId: newStateId } });

      // Ensure navi_tips_covered (started in parallel above) is emitted before `done`.
      await tipsPromise;

      await drainNaviResponseStream(
        streamId,
        speculativeResponsePromise,
        currentState,
        emit,
        projectPath,
      );
      return;
    }

    // ── Transition: abort speculative fetch, run parallel calls, restart ────
    speculativeAbort.abort();

    let naviPlan: string | undefined = request.naviPlan ?? undefined;
    let naviCurrentProblem: string | undefined = request.naviCurrentProblem ?? undefined;
    let naviCurrentProblemInterpretation: string | undefined =
      request.naviCurrentProblemInterpretation ?? undefined;
    let naviProblemQueue: string[] = request.naviProblemQueue ?? [];
    let updatedNaviContext: import("../../../src/types.js").NaviContext | undefined;

    // Sync pre-step: re-entering clarify_problem with a queued problem → pop it now so that
    // Call 2b (plan generation) correctly sees naviPlan = undefined and generates a fresh plan.
    if (newStateId === "clarify_problem" && currentStateId !== "clarify_problem") {
      if (naviProblemQueue.length > 0 && naviCurrentProblem) {
        naviCurrentProblem = naviProblemQueue[0];
        naviCurrentProblemInterpretation = undefined;
        naviProblemQueue = naviProblemQueue.slice(1);
        naviPlan = undefined;
        emit({ type: "navi_problems", data: { current: naviCurrentProblem, queue: naviProblemQueue } });
      }
    }

    // Entering explore_software_stack from a different state → drop any leftover
    // clarify_problem plan so Call 2b generates a fresh, problem-tailored stack-question plan.
    if (newStateId === "explore_software_stack" && currentStateId !== "explore_software_stack") {
      naviPlan = undefined;
    }

    await Promise.all([
      // Call 2b: question plan for clarify_problem and explore_software_stack.
      (async () => {
        const isProblemPlan = newStateId === "clarify_problem";
        const isStackPlan = newStateId === "explore_software_stack";
        if ((!isProblemPlan && !isStackPlan) || naviPlan) return;
        emit({ type: "navi_step", data: { label: "Plane Fragen …" } });
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-10).join("\n");
          const planHints = projConfig?.naviPlanHints?.[newStateId];
          let planSystemPromptParts: string[];
          let planUserPrompt: string;
          if (isStackPlan) {
            planSystemPromptParts = [
              "Du analysierst das Gespräch zwischen Navi (KI-Berater) und einem Händler.",
              "Navi kennt bereits das Hauptproblem des Händlers. Jetzt muss Navi nur noch den Software-Stack klären, der für DIESES Problem relevant ist.",
              "Deine Aufgabe: Erstelle eine kurze, priorisierte Liste der Stack-Fragen, die zur Lösung des genannten Problems WIRKLICH beitragen. Leite die relevanten Bereiche aus dem Problem ab.",
              "Beispiele für die Ableitung:",
              "- Problem 'zu wenig Kunden / Laufkundschaft / Reichweite / Sichtbarkeit' → relevant: Online-Präsenz, Social Media, Newsletter. NICHT fragen: Kassensystem, Lager, Buchhaltung.",
              "- Problem 'Bestell- oder Support-Chaos, Terminvergabe' → relevant: Kundenkommunikation (E-Mail/WhatsApp/Telefon). NICHT fragen: Social Media, Reichweite.",
              "- Problem 'Lager, Abrechnung, Kassenanbindung' → relevant: Kassensystem, Lagertool. NICHT fragen: Social Media, Newsletter.",
              "Frag NUR nach Bereichen, die zur Lösung des Problems beitragen können – lass alles andere konsequent weg.",
              "Online-Präsenz (Online-Shop ja/nein, welche Plattform – oder nur stationär) IMMER aufnehmen, sofern noch nicht bekannt.",
              "Fragen die bereits beantwortet wurden, NICHT aufnehmen.",
              "Maximal 4 Fragen. Frag einfach, ohne Fachbegriffe. Antwortformat: NUR eine Bullet-Liste mit '-', kein anderer Text.",
            ];
            planUserPrompt = `Gesprächsausschnitt:\n${excerpt}\n\nWelche Stack-Fragen muss Navi noch klären, um für das genannte Problem eine sinnvolle Empfehlung geben zu können? Nur problemrelevante Bereiche.`;
          } else {
            planSystemPromptParts = [
              "Du analysierst das Gespräch zwischen Navi (KI-Berater) und einem Händler.",
              "Deine Aufgabe: Erstelle eine kurze, priorisierte Liste der wichtigsten offenen Fragen, die Navi noch klären muss – ausschließlich zum Hauptproblem, das der Händler genannt hat.",
              "WICHTIG: Alle Fragen müssen sich auf DIESES EINE Hauptproblem beziehen. Keine Fragen zu anderen Themen oder potenziellen Nebenproblemen.",
              "Unterscheide dabei nach Händlertyp: Online-Handel (nur online), Vor-Ort-Handel (nur stationär), oder beides kombiniert.",
              "Fokussiere auf praktische Lücken – nicht auf Hintergründe, Ausmaß oder Auswirkungen.",
              "Fragen die bereits beantwortet wurden, NICHT aufnehmen.",
              "Maximal 5 Fragen. Antwortformat: NUR eine Bullet-Liste mit '-', kein anderer Text.",
            ];
            planUserPrompt = `Gesprächsausschnitt:\n${excerpt}\n\nWelche offenen Fragen muss Navi noch klären, um das genannte Hauptproblem des Händlers konkret zu verstehen und die praktische Lücke zu finden? Nur Fragen zu diesem einen Problem.`;
          }
          if (planHints?.include?.length) {
            planSystemPromptParts.push(
              `PFLICHT-THEMEN (müssen abgedeckt sein, sofern noch nicht beantwortet):\n${planHints.include.map((h) => `- ${h}`).join("\n")}`,
            );
          }
          if (planHints?.exclude?.length) {
            planSystemPromptParts.push(
              `VERBOTENE THEMEN (auf keinen Fall fragen):\n${planHints.exclude.map((h) => `- ${h}`).join("\n")}`,
            );
          }
          const planSystemPrompt = planSystemPromptParts.join("\n");
          const planResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 512,
              temperature: 0.1,
              reasoning_effort: "minimal",
              messages: [
                { role: "system", content: planSystemPrompt },
                { role: "user", content: planUserPrompt },
              ],
            }),
          });
          if (planResponse.ok) {
            const planJson = (await planResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const rawPlan = normalizeText(planJson?.choices?.[0]?.message?.content ?? "");
            if (rawPlan) {
              naviPlan = rawPlan;
              emit({ type: "navi_plan", data: { plan: naviPlan } });
            }
          }
        } catch (err) {
          console.error("[navi] Question plan generation failed:", err);
        }
      })(),

      // Call 2d: naviContext extraction — on every state transition.
      // When entering clarify_problem for the first time, also extracts problem details
      // (interpretation + queue) in the same call, replacing the former separate Call 2c.
      (async () => {
        if (newStateId === currentStateId) return;
        const withProblemDetails =
          newStateId === "clarify_problem" &&
          currentStateId !== "clarify_problem" &&
          !naviCurrentProblemInterpretation;
        if (withProblemDetails) {
          emit({ type: "navi_step", data: { label: "Erkenne Anliegen …" } });
        }
        try {
          const history = Array.isArray(request.history) ? request.history : [];
          const excerptLines: string[] = [];
          for (const msg of history) {
            if (msg.hidden) continue;
            const content = normalizeText(typeof msg.content === "string" ? msg.content : "");
            if (!content) continue;
            if (msg.role === "assistant") excerptLines.push(`Navi: ${content}`);
            else if (msg.role === "user") excerptLines.push(`Händler: ${content}`);
          }
          if (userMessage) excerptLines.push(`Händler: ${userMessage}`);
          const excerpt = excerptLines.slice(-20).join("\n");
          const contextPrompt = buildNaviContextPrompt(excerpt, withProblemDetails);
          const contextResponse = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
            body: JSON.stringify({
              model: endpoint.model,
              stream: false,
              max_tokens: 1024,
              temperature: 0,
              reasoning_effort: "minimal",
              messages: [{ role: "user", content: contextPrompt }],
            }),
          });
          if (contextResponse.ok) {
            const contextJson = (await contextResponse.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const raw = normalizeText(contextJson?.choices?.[0]?.message?.content ?? "");
            const jsonMatch = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const start = jsonMatch.indexOf("{");
            const end = jsonMatch.lastIndexOf("}");
            if (start !== -1 && end > start) {
              const parsed = JSON.parse(jsonMatch.slice(start, end + 1)) as Record<string, unknown>;
              const ctx: import("../../../src/types.js").NaviContext = {};
              if (typeof parsed.laden === "string" && parsed.laden.trim())
                ctx.laden = parsed.laden.trim();
              if (typeof parsed.problem === "string" && parsed.problem.trim())
                ctx.problem = parsed.problem.trim();
              if (typeof parsed.luecke === "string" && parsed.luecke.trim())
                ctx.luecke = parsed.luecke.trim();
              if (typeof parsed.stack === "string" && parsed.stack.trim())
                ctx.stack = parsed.stack.trim();
              if (typeof parsed.investition === "string" && parsed.investition.trim())
                ctx.investition = parsed.investition.trim();
              if (typeof parsed.empfehlung === "string" && parsed.empfehlung.trim())
                ctx.empfehlung = parsed.empfehlung.trim();
              if (typeof parsed.details === "string" && parsed.details.trim())
                ctx.details = parsed.details.trim();
              if (Object.keys(ctx).length > 0) updatedNaviContext = ctx;
              // Problem details — merged from former Call 2c
              if (withProblemDetails) {
                if (ctx.problem && !naviCurrentProblem) naviCurrentProblem = ctx.problem;
                if (
                  typeof parsed.problemInterpretation === "string" &&
                  parsed.problemInterpretation.trim()
                )
                  naviCurrentProblemInterpretation = parsed.problemInterpretation.trim();
                if (Array.isArray(parsed.problemQueue)) {
                  const newItems = (parsed.problemQueue as unknown[])
                    .filter((p): p is string => typeof p === "string" && !!p.trim())
                    .filter((p) => !naviProblemQueue.includes(p));
                  if (newItems.length > 0) naviProblemQueue = [...naviProblemQueue, ...newItems];
                }
                if (naviCurrentProblem) {
                  emit({
                    type: "navi_problems",
                    data: {
                      current: naviCurrentProblem,
                      interpretation: naviCurrentProblemInterpretation,
                      queue: naviProblemQueue,
                    },
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error("[navi] NaviContext extraction failed:", err);
        }
      })(),
    ]);

    emit({
      type: "navi_state",
      data: {
        stateId: newStateId,
        ...(newStateId !== currentStateId ? { completedStateId: currentStateId } : {}),
      },
    });

    if (updatedNaviContext) {
      emit({ type: "navi_context", data: updatedNaviContext });
    }

    if (!isStreamActive(streamId)) return;

    // Build and start the response fetch for the new state (with updated plan/context/problem)
    const newState = getNaviState(newStateId) ?? currentState;
    const newBody = buildNaviConversationBody(
      newState,
      request,
      naviPlan,
      naviCurrentProblem,
      naviCurrentProblemInterpretation,
      naviProblemQueue,
      projConfig,
      userMessage,
      roleIntro,
    );
    const newResponseFetch = startNaviResponseFetch(
      endpoint.apiUrl,
      endpoint.apiKey,
      endpoint.model,
      newBody.messages,
      newBody.tools,
      newBody.toolChoice,
    );

    emit({ type: "navi_step", data: { label: null } });

    // Ensure navi_tips_covered (started in parallel above) is emitted before `done`.
    await tipsPromise;

    await drainNaviResponseStream(
      streamId,
      newResponseFetch,
      newState,
      emit,
      projectPath,
    );
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
  fullAssistantText: string,
  endpoint: { apiUrl: string; apiKey: string; model: string },
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  const coveredTipsSet = new Set(request.naviCoveredTips ?? []);
  const stillPendingTips = NAVI_TIPS.filter((t) => !coveredTipsSet.has(t.id));
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

import type { ChatRequest, ChatMessage, ToolCall } from "../../src/types.js";
import {
  normalizeText,
  estimateTokens,
  type PreviewBuildContext,
} from "./conversation/projectContext.js";
import {
  buildPreviewContext,
  type ContextBlock,
} from "./conversation/contextBlocks.js";
import {
  buildSystemPrompt,
  getActiveToolDefinitions,
  resolveModeSystemPrompt,
} from "./conversation/systemPrompt.js";
import { buildWikiIndex, formatWikiIndex } from "./wikiService.js";
import { resolveEmbeddingCredentials } from "./aiProviderService.js";
import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
  extractContentToken,
  extractFinishReason,
  accumulateToolCallChunks,
  type OpenAiMessage,
  type OpenAiStreamChunk,
} from "./openAiClient.js";
import { streamSessions, createStreamId, isStreamActive } from "./chatSession.js";
import {
  executeToolCall,
  describeStreamingToolCall,
  type ToolExecutionResult,
} from "./chatToolExecution.js";
import { runNaviChatStream } from "./conversation/naviChat.js";

export type { ContextBlock };
export type {
  ChatStreamEvent,
  ChatStreamStartResult,
  ChatContextPreviewResult,
} from "./chatTypes.js";
export type {
  SimulationTranscriptLine,
  SimulatedUserReplyRequest,
  EvaluateNaviSimulationRequest,
  EvaluateNaviSimulationResult,
} from "./naviSimulationService.js";
export {
  generateSimulatedUserReply,
  evaluateNaviSimulation,
} from "./naviSimulationService.js";

// Re-import for internal use (TypeScript requires local binding when re-exporting and also using a type).
import type {
  ChatStreamEvent,
  ChatContextPreviewResult,
  ChatStreamStartResult,
} from "./chatTypes.js";

export interface ThreadSummaryResult {
  summary: string;
  title: string;
}

function buildFileContextText(contextBlocks: ContextBlock[]): string | null {
  const fileBlocks = contextBlocks.filter((block) => block.type === "file");
  if (fileBlocks.length === 0) return null;

  const body = fileBlocks.map((block) => `### ${block.label}\n${block.content}`).join("\n\n");

  return (
    "[Angehängte Dateien — vom Nutzer als Kontext bereitgestellt. Nutze ihren Inhalt direkt, " +
    "du musst sie nicht erneut über Werkzeuge lesen.]\n\n" +
    body
  );
}

function buildOpenAiMessages(
  request: ChatRequest,
  systemPrompt: string,
  contextBlocks: ContextBlock[] = [],
): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: "system", content: systemPrompt }];

  const history = Array.isArray(request.history) ? request.history : [];
  for (const message of history) {
    if (message.hidden) continue;

    if (message.role === "assistant") {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      const toolCalls = Array.isArray(message.toolCalls)
        ? message.toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function" as const,
            function: { name: toolCall.function.name, arguments: toolCall.function.arguments },
          }))
        : undefined;
      if (!content && (!toolCalls || toolCalls.length === 0)) continue;
      messages.push({
        role: "assistant",
        content,
        ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    if (message.role === "tool") {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!content || !message.toolCallId) continue;
      messages.push({ role: "tool", content, tool_call_id: message.toolCallId });
      continue;
    }

    if (message.role === "user" || message.role === "system") {
      const content = typeof message.content === "string" ? message.content.trim() : "";
      if (!content) continue;
      messages.push({ role: message.role, content });
    }
  }

  const fileContextText = buildFileContextText(contextBlocks);
  const finalUserMessage = normalizeText(request.message);
  if (finalUserMessage || fileContextText) {
    const content = [fileContextText, finalUserMessage].filter(Boolean).join("\n\n");
    messages.push({ role: "user", content });
  }

  return messages;
}

export async function previewChatContext(
  projectPath: string | null,
  request: ChatRequest,
): Promise<ChatContextPreviewResult> {
  console.debug(
    `[chat] previewChatContext: mode=${normalizeText(request.mode)}, project=${projectPath ?? "(none)"}`,
  );
  const previewContext = await buildPreviewContext(projectPath, request);

  // Wiki inventory — the writing equivalent of a source tree. Skipped for quick
  // chat (ephemeral) and navi (customer consulting), which have no wiki context.
  let wikiIndex = "";
  if (!request.quickChat && request.sessionKind !== "navi") {
    try {
      wikiIndex = formatWikiIndex(await buildWikiIndex(projectPath));
    } catch (error) {
      console.warn(`[chat] wiki index build failed: ${String(error)}`);
    }
  }

  const context: PreviewBuildContext = {
    projectPath,
    projectConfig: previewContext.projectConfig,
    wikiIndex,
  };

  const modeSystemPrompt = await resolveModeSystemPrompt(projectPath, request.mode);
  const systemPrompt = buildSystemPrompt(request, context, modeSystemPrompt);
  console.debug(
    `[chat] previewChatContext: done (systemPrompt=${systemPrompt.length} chars, modeSystemPrompt=${modeSystemPrompt.length} chars)`,
  );
  const estimatedTokens =
    estimateTokens(systemPrompt) +
    previewContext.blocks.reduce((sum, block) => sum + block.estimatedTokens, 0);

  const maxToolRounds =
    typeof previewContext.projectConfig?.maxToolRounds === "number" &&
    previewContext.projectConfig.maxToolRounds >= 1
      ? previewContext.projectConfig.maxToolRounds
      : 30;

  return {
    includedFiles: previewContext.includedFiles,
    estimatedTokens,
    contextBlocks: previewContext.blocks,
    systemPrompt,
    maxToolRounds,
  };
}

export function startChatStream(
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): ChatStreamStartResult {
  const streamId = createStreamId();
  streamSessions.set(streamId, { aborted: false });
  void runChatStream(streamId, projectPath, request, emit);
  return { streamId };
}

export function stopChatStream(streamId: string): { status: string } {
  const session = streamSessions.get(streamId);
  if (!session) return { status: "ok" };
  session.aborted = true;
  streamSessions.delete(streamId);
  return { status: "ok" };
}

async function runChatStream(
  streamId: string,
  projectPath: string | null,
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (request.sessionKind === "navi") {
    return runNaviChatStream(streamId, projectPath, request, emit);
  }

  try {
    const provider = await resolveAiProvider(request.llmId);
    const endpoint = resolveProviderEndpoint(provider, request.useReasoning);
    const preview = await previewChatContext(projectPath, request);

    if (!isStreamActive(streamId)) return;

    emit({
      type: "context",
      data: {
        includedFiles: preview.includedFiles,
        estimatedTokens: preview.estimatedTokens,
        maxContextTokens: endpoint.maxTokens,
      },
    });

    if (request.message && request.message.trim()) {
      emit({ type: "resolved_user_message", data: request.message });
    }

    emit({ type: "context_update", data: { estimatedTokens: preview.estimatedTokens } });

    let conversationMessages = buildOpenAiMessages(request, preview.systemPrompt, preview.contextBlocks);
    let toolRound = 0;
    let tokenCount = 0;
    let fullAssistantText = "";
    const maxToolRounds = preview.maxToolRounds;

    while (toolRound < maxToolRounds) {
      if (!isStreamActive(streamId)) return;

      console.debug(
        `[chat] toolRound=${toolRound} starting, messages=${conversationMessages.length}, ` +
          `last role="${conversationMessages.at(-1)?.role}"`,
      );

      const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
        body: JSON.stringify({
          model: endpoint.model,
          stream: true,
          messages: conversationMessages,
          ...(request.useReasoning && request.reasoningEffort
            ? { reasoning_effort: request.reasoningEffort }
            : {}),
          ...(getActiveToolDefinitions(request).length > 0
            ? { tools: getActiveToolDefinitions(request) }
            : {}),
        }),
      });

      if (!response.ok) {
        let detail = `Chat error: ${response.status}`;
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
      const collectedToolCalls = new Map<number, ToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!isStreamActive(streamId)) return;

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
            tokenCount += 1;
            roundAssistantText += token;
            fullAssistantText += token;
            emit({ type: "token", data: token });
          }

          accumulateToolCallChunks(parsed, collectedToolCalls);

          const finishReason = extractFinishReason(parsed);
          if (finishReason) {
            console.debug(`[chat] toolRound=${toolRound} finish_reason="${finishReason}"`);
          }
          if (finishReason === "tool_calls") break;

          currentEvent = "";
        }
      }

      const toolCalls = [...collectedToolCalls.values()];

      console.debug(
        `[chat] toolRound=${toolRound} stream ended: toolCalls=${toolCalls.length}, ` +
          `tokenCount=${tokenCount}, roundText.length=${roundAssistantText.length}`,
      );
      for (const tc of toolCalls) {
        console.debug(
          `[chat]   toolCall id="${tc.id}" name="${tc.function.name}" ` +
            `arguments=${tc.function.arguments}`,
        );
      }

      if (toolCalls.length === 0) {
        if (!isStreamActive(streamId)) return;

        if (tokenCount === 0 && !roundAssistantText.trim()) {
          // Only a truly empty turn (no tool work at all) is an error. If the model already
          // produced visible tool output this turn (e.g. an artifact card) and then completes
          // without further prose, that is a valid end of turn — finish gracefully.
          if (toolRound === 0) {
            console.warn(
              `[chat] MODEL_EMPTY_RESPONSE: toolRound=${toolRound}, tokenCount=${tokenCount}, ` +
                `collectedToolCalls.size=${collectedToolCalls.size}`,
            );
            emit({ type: "error", data: { message: "MODEL_EMPTY_RESPONSE" } });
            return;
          }
          console.debug(
            `[chat] empty final completion after toolRound=${toolRound}; ending turn gracefully`,
          );
          emit({ type: "done", data: { fullAssistantText } });
          return;
        }

        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      const assistantMessageForTools: ChatMessage = {
        role: "assistant",
        content: roundAssistantText,
        toolCalls,
        hidden: true,
      };

      for (const toolCall of toolCalls) {
        emit({ type: "tool_call", data: describeStreamingToolCall(toolCall) });
      }

      const embeddingCreds = resolveEmbeddingCredentials(provider, request.useReasoning);
      const embeddingConfig = embeddingCreds
        ? { apiUrl: embeddingCreds.apiUrl, apiKey: embeddingCreds.apiKey }
        : undefined;

      const executedResults: ToolExecutionResult[] = [];
      for (const toolCall of toolCalls) {
        const execResult = await executeToolCall(projectPath, toolCall, embeddingConfig);
        executedResults.push(execResult);
      }

      for (const r of executedResults) {
        console.debug(
          `[chat] tool "${r.name}" result length=${r.result.length} ` +
            `(preview: ${r.result.slice(0, 120).replace(/\n/g, "\\n")})`,
        );
      }

      const toolHistoryMessages: ChatMessage[] = [
        assistantMessageForTools,
        ...executedResults.map((result) => ({
          role: "tool" as const,
          toolCallId: result.toolCallId,
          content: result.result,
          hidden: false,
        })),
      ];

      emit({ type: "tool_history", data: toolHistoryMessages });

      conversationMessages.push({
        role: "assistant",
        content: roundAssistantText,
        tool_calls: toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: { name: toolCall.function.name, arguments: toolCall.function.arguments },
        })),
      });

      for (const result of executedResults) {
        conversationMessages.push({
          role: "tool",
          tool_call_id: result.toolCallId,
          content: result.result,
        });
      }

      const hasUserInteractionTool = toolCalls.some(
        (tc) =>
          tc.function.name === "ask_clarification" ||
          tc.function.name === "propose_guided_thread",
      );

      if (hasUserInteractionTool) {
        if (!isStreamActive(streamId)) return;
        emit({ type: "done", data: { fullAssistantText } });
        return;
      }

      toolRound += 1;
    }

    if (!isStreamActive(streamId)) return;
    emit({ type: "done", data: { fullAssistantText } });
  } catch (error) {
    if (!isStreamActive(streamId)) return;
    emit({
      type: "error",
      data: { message: error instanceof Error ? error.message : "CHAT_STREAM_FAILED" },
    });
  } finally {
    streamSessions.delete(streamId);
  }
}

/**
 * Generates a concise summary of a thread's messages using a (potentially different) LLM.
 * Uses a non-streaming completion request.
 */
export async function generateThreadSummary(
  threadMessages: ChatMessage[],
  llmId: string | null | undefined,
  focusInstructions?: string | null,
  parentMessages?: ChatMessage[],
): Promise<ThreadSummaryResult> {
  const focus =
    typeof focusInstructions === "string" && focusInstructions.trim().length > 0
      ? focusInstructions.trim()
      : "";
  console.trace(
    `[chat] generateThreadSummary: llmId=${llmId ?? "(default)"}, threadMessages=${threadMessages.length}, ` +
      `parentMessages=${parentMessages?.length ?? 0}, ` +
      `focusInstructions=${focus ? `"${focus.slice(0, 80)}${focus.length > 80 ? "…" : ""}"` : "(none)"}`,
  );

  const provider = await resolveAiProvider(llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const toTranscript = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => !m.hidden && m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

  const visibleParent = parentMessages ? toTranscript(parentMessages) : "";
  const threadTranscript = toTranscript(threadMessages);

  const contextSection = visibleParent.trim()
    ? `=== Parent-Chat ===\n\n${visibleParent}\n\n=== Thread ===\n\n${threadTranscript}`
    : `=== Thread ===\n\n${threadTranscript}`;

  const systemBase =
    "Du bist ein präziser Assistent. Du erhältst den vollständigen Kontext: den Parent-Chat und einen daraus verzweigten Thread. " +
    "Deine Aufgabe ist es, das Ergebnis des Threads knapp und sachlich aufzuschreiben — so, dass es als Beitrag im Parent-Chat sinnvoll ist. " +
    "Fasse nicht den gesamten Thread nach; schreibe nur, was der Thread erbracht hat (Erkenntnisse, Entscheidungen, Ergebnisse). ";
  const systemFocus = focus
    ? "Der Nutzer gibt unten explizit an, welche Aspekte für den Parent-Chat relevant sind — " +
      "berücksichtige nur diese; lasse alles andere weg, sofern es nicht nötig ist, diese Punkte zu verstehen. "
    : "";
  const systemTail =
    'Antworte ausschließlich mit einem JSON-Objekt in exakt diesem Format (kein Markdown, kein Code-Block, kein Kommentar davor oder danach):\n' +
    '{"title":"<prägnanter Titel für den Thread, max. 6 Wörter>","summary":"<Ergebnis-Text für den Parent-Chat>"}';

  const userLead = focus ? `Relevante Aspekte laut Nutzer:\n\n${focus}\n\n---\n\n` : "";

  const requestMessages = [
    { role: "system" as const, content: systemBase + systemFocus + systemTail },
    { role: "user" as const, content: `${userLead}${contextSection}` },
  ];

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({ model: endpoint.model, stream: false, messages: requestMessages }),
  });

  if (!response.ok) {
    let detail = `Thread summary error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json?.choices?.[0]?.message?.content?.trim() ?? "";

  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: { title?: unknown; summary?: unknown };
  try {
    parsed = JSON.parse(jsonText) as { title?: unknown; summary?: unknown };
  } catch {
    console.warn(
      "[chat] generateThreadSummary: failed to parse JSON, falling back",
      jsonText.slice(0, 200),
    );
    parsed = { summary: raw, title: "" };
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";

  console.trace(
    `[chat] generateThreadSummary finished, summary length=${summary.length}, title="${title}"`,
  );
  return { summary, title };
}

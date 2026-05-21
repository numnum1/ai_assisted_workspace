import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat } from "../../../api";
import type { ChatStream } from "./chat-streaming-types";
import type { Finder } from "../../../utils/generics";
import type { AssistantMode } from "../project/project-types";
import type { ChatMessage, ChatRequest } from "../../../types";
import type { AssistantTurn, ConversationTurn, UserTurn } from "../turn/turn.types";
import type { Chat } from "../chat/Chat";
import type { Message } from "../message/message.types";
import type { FunctionCallToolCall } from "../tool_call/tool_call.types";
import { writeStreamingText, parseStreamMessages } from "./assistantStreamStore";

function turnsToChatMessages(turns: ConversationTurn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.type === "SYSTEM") {
      messages.push({ role: "system", content: turn.text });
    } else if (turn.type === "USER") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.type === "ASSISTANT") {
      const content = turn.messages
        .filter((m) => m.type === "TEXT")
        .map((m) => m.text)
        .join("");
      messages.push({ role: "assistant", content });
    }
  }
  return messages;
}

function buildChatRequest(
  chat: Chat,
  userMessage: string,
  modeName: string,
  systemPrompt?: string,
): ChatRequest {
  return {
    message: userMessage,
    mode: modeName,
    history: turnsToChatMessages(chat.conversation.turns),
    referencedFiles: [],
    useReasoning: chat.settings.selectedLLM.useReasoning ?? false,
    llmId: chat.settings.selectedLLM.id ?? undefined,
    systemPrompt,
  };
}

function addTurnsToChat(chat: Chat, userMessage: string, modeName: string): Chat {
  const now = Date.now();

  const userTurn: UserTurn = {
    type: "USER",
    text: userMessage,
    timestamp: now,
  };

  const assistantTurn: AssistantTurn = {
    type: "ASSISTANT",
    usedModeName: modeName,
    messages: [],
    timestamp: now + 1,
  };

  return {
    ...chat,
    conversation: {
      turns: [...chat.conversation.turns, userTurn, assistantTurn],
    },
    userMessage: "",
  };
}

/**
 * Converts the old-format ChatMessage[] from a tool_history event into the new Message[] format.
 * Groups assistant text + tool calls, attaches tool results where available.
 */
function convertToolHistoryToMessages(toolMessages: ChatMessage[]): Message[] {
  const out: Message[] = [];

  for (const msg of toolMessages) {
    if (msg.role === "assistant") {
      if (msg.content?.trim()) {
        out.push({ type: "TEXT", text: msg.content });
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          // Find the matching tool result message
          const resultMsg = toolMessages.find(
            (m) => m.role === "tool" && m.toolCallId === tc.id,
          );
          const call: FunctionCallToolCall = {
            type: "FUNCTION_CALL",
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            result: resultMsg?.content,
          };
          out.push({ type: "TOOL_CALL", content: call });
        }
      }
    }
    // Tool result messages are embedded into TOOL_CALL above; skip them at the top level
  }

  return out;
}

export type ChatStreamingApi = {
  startStream: (
    chatId: string,
    userMessage: string,
    systemPrompt?: string,
  ) => void;
  stopStream: (chatId: string) => void;
  getStream: (chatId: string) => ChatStream | undefined;
  streams: Map<string, ChatStream>;
};

export function useChatStreaming(
  chats: Chat[],
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  findModeById: Finder<AssistantMode>,
): ChatStreamingApi {
  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const streamsRef = useRef<Map<string, ChatStream>>(new Map());
  const [streams, setStreams] = useState<Map<string, ChatStream>>(new Map());

  const tickScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Batches stream-metadata renders to ~60 fps (avoids setStreams on every token).
  const scheduleRender = useCallback(() => {
    if (tickScheduledRef.current !== null) return;
    tickScheduledRef.current = setTimeout(() => {
      setStreams(new Map(streamsRef.current));
      tickScheduledRef.current = null;
    }, 16);
  }, []);

  const updateStream = useCallback((chatId: string, patch: Partial<ChatStream>) => {
    const current = streamsRef.current.get(chatId);
    if (!current) return;
    streamsRef.current.set(chatId, { ...current, ...patch });
    setStreams(new Map(streamsRef.current));
  }, []);

  const getStream = useCallback(
    (chatId: string) => streamsRef.current.get(chatId),
    [],
  );

  const stopStream = useCallback((chatId: string) => {
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    const stream = streamsRef.current.get(chatId);
    if (stream && stream.status !== "done" && stream.status !== "error") {
      streamsRef.current.set(chatId, { ...stream, status: "stopped" });
      setStreams(new Map(streamsRef.current));
    }
    writeStreamingText(chatId, null);
  }, []);

  const startStream = useCallback(
    (chatId: string, userMessage: string, systemPrompt?: string) => {
      if (!userMessage.trim()) return;

      if (abortControllersRef.current.has(chatId)) {
        console.warn(`[useChatStreaming] Stream already active for chat: ${chatId}`);
        return;
      }

      const chat = chatsRef.current.find((c) => c.id === chatId) ?? null;
      if (!chat) {
        console.warn(`[useChatStreaming] Chat not found: ${chatId}`);
        return;
      }

      const mode = findModeById(chat.settings.selectedModeId ?? "");
      const modeName = mode?.name ?? chat.settings.selectedModeId ?? "default";
      const request = buildChatRequest(chat, userMessage, modeName, systemPrompt);

      // Add user + empty assistant turn to the conversation (one setChats at turn start)
      setChats((prevChats) =>
        prevChats.map((c) =>
          c.id === chatId ? addTurnsToChat(c, userMessage, modeName) : c,
        ),
      );

      streamsRef.current.set(chatId, {
        chatId,
        status: "starting",
        assistantText: "",
      });
      setStreams(new Map(streamsRef.current));

      const abortController = streamChat(
        request,
        // onToken — write to external store only, no React state change
        (token) => {
          const stream = streamsRef.current.get(chatId);
          if (!stream) return;
          const newText = stream.assistantText + token;
          streamsRef.current.set(chatId, {
            ...stream,
            status: "streaming",
            assistantText: newText,
          });
          scheduleRender();
          writeStreamingText(chatId, newText);
        },
        // onContext
        (context) => {
          updateStream(chatId, { contextInfo: context });
        },
        // onDone — commit final parsed messages to conversation state, then clear store
        (fullText) => {
          writeStreamingText(chatId, null);
          const finalMessages = parseStreamMessages(fullText);
          setChats((prevChats) =>
            prevChats.map((c) => {
              if (c.id !== chatId) return c;
              const turns = [...c.conversation.turns];
              const lastIdx = turns.findLastIndex((t) => t.type === "ASSISTANT");
              if (lastIdx >= 0) {
                turns[lastIdx] = { ...(turns[lastIdx] as AssistantTurn), messages: finalMessages };
              }
              return { ...c, conversation: { turns } };
            }),
          );
          updateStream(chatId, { status: "done", assistantText: fullText });
          abortControllersRef.current.delete(chatId);
        },
        // onError
        (err) => {
          writeStreamingText(chatId, null);
          updateStream(chatId, { status: "error", errorMessage: err.message });
          abortControllersRef.current.delete(chatId);
        },
        // onToolCall (activity description)
        (description) => {
          updateStream(chatId, { toolCallDescription: description });
        },
        // onContextUpdate
        (estimatedTokens) => {
          const stream = streamsRef.current.get(chatId);
          if (stream?.contextInfo) {
            streamsRef.current.set(chatId, {
              ...stream,
              contextInfo: { ...stream.contextInfo, estimatedTokens },
            });
            scheduleRender();
          }
        },
        // onToolHistory — convert to new Message format and commit; store is cleared so next
        // round starts with a fresh streaming text accumulator
        (toolMessages) => {
          writeStreamingText(chatId, null);
          const roundMessages = convertToolHistoryToMessages(toolMessages);
          setChats((prevChats) =>
            prevChats.map((c) => {
              if (c.id !== chatId) return c;
              const turns = [...c.conversation.turns];
              const lastIdx = turns.findLastIndex((t) => t.type === "ASSISTANT");
              if (lastIdx >= 0) {
                const prev = turns[lastIdx] as AssistantTurn;
                // Append this tool round's messages to whatever was already in the turn
                turns[lastIdx] = {
                  ...prev,
                  messages: [...prev.messages, ...roundMessages],
                };
              }
              return { ...c, conversation: { turns } };
            }),
          );
          // Reset accumulated text so the next streaming round starts clean
          const stream = streamsRef.current.get(chatId);
          if (stream) {
            streamsRef.current.set(chatId, { ...stream, assistantText: "" });
          }
        },
      );

      abortControllersRef.current.set(chatId, abortController);
    },
    [findModeById, setChats, scheduleRender, updateStream],
  );

  return {
    startStream,
    stopStream,
    getStream,
    streams,
  };
}

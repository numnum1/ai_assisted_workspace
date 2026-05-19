import { useCallback, useRef, useState } from "react";
import { streamChat } from "../../../api";
import type { Chat } from "../chat/Chat";
import type {
  AssistantTurn,
  ConversationTurn,
  UserTurn,
} from "../chat/unsortedChatTypes";
import type { ChatStream } from "./chat-streaming-types";
import type { Finder } from "../../../utils/generics";
import type { AssistantMode } from "../project/project-types";
import type { ChatMessage, ChatRequest } from "../../../types";

function turnsToChatMessages(turns: ConversationTurn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    if (turn.type === "SYSTEM") {
      messages.push({ role: "system", content: turn.text });
    } else if (turn.type === "USER") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.type === "ASSISTANT") {
      const content = turn.messages
        .map((m) => (m.type === "TEXT" ? m.text : ""))
        .join("");
      messages.push({ role: "assistant", content });
    }
  }
  return messages;
}

export type ChatStreamingApi = {
  startStream: (chatId: string, userMessage: string) => void;
  stopStream: (chatId: string) => void;
  getStream: (chatId: string) => ChatStream | undefined;
  streams: Map<string, ChatStream>;
};

export function useChatStreaming(
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  findModeById: Finder<AssistantMode>,
): ChatStreamingApi {
  const streamsRef = useRef<Map<string, ChatStream>>(new Map());
  const [streams, setStreams] = useState<Map<string, ChatStream>>(new Map());

  const tickScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingRequestRef = useRef<ChatRequest | null>(null);

  const scheduleRender = useCallback(() => {
    if (tickScheduledRef.current !== null) return;
    tickScheduledRef.current = setTimeout(() => {
      setStreams(new Map(streamsRef.current));
      tickScheduledRef.current = null;
    }, 16);
  }, []);

  const updateStream = useCallback(
    (chatId: string, patch: Partial<ChatStream>) => {
      const current = streamsRef.current.get(chatId);
      if (!current) return;
      const updated = { ...current, ...patch };
      streamsRef.current.set(chatId, updated);
      setStreams(new Map(streamsRef.current));
    },
    [],
  );

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
  }, []);

  const startStream = useCallback(
    (chatId: string, userMessage: string) => {
      if (!userMessage.trim()) {
        console.warn(
          `[useChatStreaming] userMessage is empty for chat: ${chatId}`,
        );
        return;
      }

      pendingRequestRef.current = null;

      setChats((prevChats) => {
        const chat = prevChats.find((c) => c.id === chatId) ?? null;
        if (!chat) {
          console.warn(`[useChatStreaming] Chat not found: ${chatId}`);
          return prevChats;
        }
        if (abortControllersRef.current.has(chatId)) {
          console.warn(
            `[useChatStreaming] Stream already active for chat: ${chatId}`,
          );
          return prevChats;
        }

        const mode = findModeById(chat.settings.selectedModeId ?? "");
        const modeName =
          mode?.name ?? chat.settings.selectedModeId ?? "default";

        pendingRequestRef.current = {
          message: userMessage,
          mode: modeName,
          history: turnsToChatMessages(chat.conversation.turns),
          referencedFiles: [],
          useReasoning: chat.settings.selectedLLM.useReasoning ?? false,
          llmId: chat.settings.selectedLLM.id ?? undefined,
        };

        const now = Date.now();

        const userTurn: UserTurn = {
          type: "USER",
          text: userMessage,
          timestamp: now,
        };

        const assistantTurn: AssistantTurn = {
          type: "ASSISTANT",
          usedModeName: modeName,
          messages: [{ type: "TEXT", text: "" }],
          timestamp: now + 1,
        };

        const updatedChat: Chat = {
          ...chat,
          conversation: {
            turns: [...chat.conversation.turns, userTurn, assistantTurn],
          },
          userMessage: "",
        };

        return prevChats.map((c) => (c.id === chatId ? updatedChat : c));
      });

      const request = pendingRequestRef.current;
      if (!request) return;

      streamsRef.current.set(chatId, {
        chatId,
        status: "starting",
        assistantText: "",
      });
      setStreams(new Map(streamsRef.current));

      const abortController = streamChat(
        request,
        (token) => {
          const stream = streamsRef.current.get(chatId);
          if (stream) {
            streamsRef.current.set(chatId, {
              ...stream,
              status: "streaming",
              assistantText: stream.assistantText + token,
            });
            scheduleRender();
          }

          setChats((prevChats) =>
            prevChats.map((c) => {
              if (c.id !== chatId) return c;
              const turns = [...c.conversation.turns];
              const lastTurn = turns[turns.length - 1];
              if (lastTurn?.type === "ASSISTANT") {
                const messages = [...lastTurn.messages];
                const lastMsg = messages[messages.length - 1];
                if (lastMsg?.type === "TEXT") {
                  messages[messages.length - 1] = {
                    ...lastMsg,
                    text: lastMsg.text + token,
                  };
                } else {
                  messages.push({ type: "TEXT", text: token });
                }
                turns[turns.length - 1] = {
                  ...lastTurn,
                  messages,
                };
              }
              return {
                ...c,
                conversation: { turns },
              };
            }),
          );
        },
        (context) => {
          updateStream(chatId, { contextInfo: context });
        },
        (fullText) => {
          updateStream(chatId, { status: "done", assistantText: fullText });
          abortControllersRef.current.delete(chatId);
        },
        (err) => {
          updateStream(chatId, { status: "error", errorMessage: err.message });
          abortControllersRef.current.delete(chatId);
        },
        (description) => {
          updateStream(chatId, { toolCallDescription: description });
        },
        (estimatedTokens) => {
          const stream = streamsRef.current.get(chatId);
          if (stream?.contextInfo) {
            streamsRef.current.set(chatId, {
              ...stream,
              contextInfo: {
                ...stream.contextInfo,
                estimatedTokens,
              },
            });
            scheduleRender();
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
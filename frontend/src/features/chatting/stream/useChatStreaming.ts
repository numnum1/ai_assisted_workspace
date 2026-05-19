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

function buildChatRequest(chat: Chat, modeName: string): ChatRequest {
  return {
    message: chat.userMessage,
    mode: modeName,
    history: turnsToChatMessages(chat.conversation.turns),
    referencedFiles: [],
    useReasoning: chat.settings.selectedLLM.useReasoning ?? false,
    llmId: chat.settings.selectedLLM.id ?? undefined,
  };
}

export type ChatStreamingApi = {
  startStream: (chatId: string) => void;
  stopStream: (chatId: string) => void;
  getStream: (chatId: string) => ChatStream | undefined;
  streams: Map<string, ChatStream>;
};

export function useChatStreaming(
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>,
  findModeById: Finder<AssistantMode>,
): ChatStreamingApi {
  const [streams, setStreams] = useState<Map<string, ChatStream>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const getStream = useCallback(
    (chatId: string) => streams.get(chatId),
    [streams],
  );

  const stopStream = useCallback((chatId: string) => {
    const controller = abortControllersRef.current.get(chatId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(chatId);
    }
    setStreams((prev) => {
      const next = new Map(prev);
      const stream = next.get(chatId);
      if (stream && stream.status !== "done" && stream.status !== "error") {
        next.set(chatId, { ...stream, status: "stopped" });
      }
      return next;
    });
  }, []);

  const startStream = useCallback(
    (chatId: string) => {
      const snapshotRef = { current: null as Chat | null };

      setChats((prevChats) => {
        const chat = prevChats.find((c) => c.id === chatId) ?? null;
        if (!chat) {
          console.warn(`[useChatStreaming] Chat not found: ${chatId}`);
          return prevChats;
        }
        if (!chat.userMessage.trim()) {
          console.warn(
            `[useChatStreaming] userMessage is empty for chat: ${chatId}`,
          );
          return prevChats;
        }
        if (abortControllersRef.current.has(chatId)) {
          console.warn(
            `[useChatStreaming] Stream already active for chat: ${chatId}`,
          );
          return prevChats;
        }

        snapshotRef.current = chat;
        const mode = findModeById(chat.settings.selectedModeId ?? "");
        const modeName =
          mode?.name ?? chat.settings.selectedModeId ?? "default";
        const now = Date.now();

        const userTurn: UserTurn = {
          type: "USER",
          text: chat.userMessage,
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

      const chatSnapshot = snapshotRef.current;
      if (!chatSnapshot) return;

      const mode = findModeById(chatSnapshot.settings.selectedModeId ?? "");
      const modeName =
        mode?.name ?? chatSnapshot.settings.selectedModeId ?? "default";
      const request = buildChatRequest(chatSnapshot, modeName);

      setStreams((prev) => {
        const next = new Map(prev);
        next.set(chatId, {
          chatId,
          status: "starting",
          assistantText: "",
        });
        return next;
      });

      const abortController = streamChat(
        request,
        (token) => {
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream) {
              next.set(chatId, {
                ...stream,
                status: "streaming",
                assistantText: stream.assistantText + token,
              });
            }
            return next;
          });

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
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream) {
              next.set(chatId, {
                ...stream,
                contextInfo: context,
              });
            }
            return next;
          });
        },
        (fullText) => {
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream) {
              next.set(chatId, {
                ...stream,
                status: "done",
                assistantText: fullText,
              });
            }
            return next;
          });
          abortControllersRef.current.delete(chatId);
        },
        (err) => {
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream) {
              next.set(chatId, {
                ...stream,
                status: "error",
                errorMessage: err.message,
              });
            }
            return next;
          });
          abortControllersRef.current.delete(chatId);
        },
        (description) => {
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream) {
              next.set(chatId, {
                ...stream,
                toolCallDescription: description,
              });
            }
            return next;
          });
        },
        (estimatedTokens) => {
          setStreams((prev) => {
            const next = new Map(prev);
            const stream = next.get(chatId);
            if (stream?.contextInfo) {
              next.set(chatId, {
                ...stream,
                contextInfo: {
                  ...stream.contextInfo,
                  estimatedTokens,
                },
              });
            }
            return next;
          });
        },
      );

      abortControllersRef.current.set(chatId, abortController);
    },
    [findModeById, setChats],
  );

  return {
    startStream,
    stopStream,
    getStream,
    streams,
  };
}

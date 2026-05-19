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
  // --- Optimierung: useRef statt useState für die Map ---
  // Die Map wird direkt mutiert; nur ein primitiver Zahl-Ticker
  // löst Re-Renders aus. Dadurch entsteht bei jedem Token
  // kein neues Map-Objekt mehr.
  const streamsRef = useRef<Map<string, ChatStream>>(new Map());
  const [, setStreamsTick] = useState(0);

  // Throttle-Ref: maximale Render-Rate ~60fps
  const tickScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Render maximal einmal pro ~16ms auslösen
  const scheduleRender = useCallback(() => {
    if (tickScheduledRef.current !== null) return;
    tickScheduledRef.current = setTimeout(() => {
      setStreamsTick((t) => t + 1);
      tickScheduledRef.current = null;
    }, 16);
  }, []);

  // Hilfsfunktion: Stream-Eintrag patchen und Render planen
  const updateStream = useCallback(
    (chatId: string, patch: Partial<ChatStream>) => {
      const current = streamsRef.current.get(chatId);
      if (!current) return;
      streamsRef.current.set(chatId, { ...current, ...patch });
      scheduleRender();
    },
    [scheduleRender],
  );

  const getStream = useCallback(
    (chatId: string) => streamsRef.current.get(chatId),
    // streamsRef ist stabil; kein Dep nötig
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setStreamsTick((t) => t + 1); // sofortiger Render beim Stop
    }
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

      // Stream-Eintrag direkt in die Ref schreiben, einmal rendern
      streamsRef.current.set(chatId, {
        chatId,
        status: "starting",
        assistantText: "",
      });
      setStreamsTick((t) => t + 1);

      const abortController = streamChat(
        request,
        (token) => {
          // Token: nur Ref mutieren + gedrosselter Render
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
    // Wir geben die Ref-Map direkt zurück. Der Ticker sorgt dafür,
    // dass Konsumenten bei Änderungen neu rendern – die Map-Referenz
    // bleibt dabei stabil (kein unnötiges Diffing).
    streams: streamsRef.current,
  };
}
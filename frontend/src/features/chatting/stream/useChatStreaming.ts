import { useCallback, useEffect, useRef, useState } from "react";
import { streamChat } from "../../../api";
import type { Chat } from "../chat/Chat";
import type {
  AssistantTurn,
  ConversationTurn,
  UserTurn,
} from "../chat/chat.types";
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

function addTurnsToChat(
  chat: Chat,
  userMessage: string,
  modeName: string,
): Chat {
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

  return {
    ...chat,
    conversation: {
      turns: [...chat.conversation.turns, userTurn, assistantTurn],
    },
    userMessage: "",
  };
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
  // Mirror of chats in a ref so callbacks can read current state without
  // being listed as dependencies or triggering re-renders.
  const chatsRef = useRef<Chat[]>(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const streamsRef = useRef<Map<string, ChatStream>>(new Map());
  const [streams, setStreams] = useState<Map<string, ChatStream>>(new Map());

  const tickScheduledRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

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
      streamsRef.current.set(chatId, { ...current, ...patch });
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
    (chatId: string, userMessage: string, systemPrompt?: string) => {
      console.log(
        `[useChatStreaming] startStream called for chatId=${chatId}, msg.length=${userMessage.length}`,
      );

      if (!userMessage.trim()) {
        console.warn(
          `[useChatStreaming] userMessage is empty for chat: ${chatId}`,
        );
        return;
      }

      if (abortControllersRef.current.has(chatId)) {
        console.warn(
          `[useChatStreaming] Stream already active for chat: ${chatId}`,
        );
        return;
      }

      // 1. Read current chat state synchronously from the ref — no setState needed.
      const chat = chatsRef.current.find((c) => c.id === chatId) ?? null;
      if (!chat) {
        console.warn(`[useChatStreaming] Chat not found: ${chatId}`);
        return;
      }

      // 2. Build the request from the current chat — pure, no side-effects.
      const mode = findModeById(chat.settings.selectedModeId ?? "");
      const modeName = mode?.name ?? chat.settings.selectedModeId ?? "default";
      const request = buildChatRequest(
        chat,
        userMessage,
        modeName,
        systemPrompt,
      );

      console.log(`[useChatStreaming] Request built:`, request);

      // 3. Update UI state — purely for rendering, decoupled from request building.
      setChats((prevChats) =>
        prevChats.map((c) =>
          c.id === chatId ? addTurnsToChat(c, userMessage, modeName) : c,
        ),
      );

      // 4. Initialise the stream entry.
      streamsRef.current.set(chatId, {
        chatId,
        status: "starting",
        assistantText: "",
      });
      setStreams(new Map(streamsRef.current));
      console.log(
        `[useChatStreaming] Stream status set to "starting" for chatId=${chatId}`,
      );

      // 5. Kick off the actual streaming.
      const abortController = streamChat(
        request,
        (token) => {
          console.log(
            `[useChatStreaming] onToken: "${token.slice(0, 40)}${token.length > 40 ? "..." : ""}"`,
          );

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
                turns[turns.length - 1] = { ...lastTurn, messages };
              }
              return { ...c, conversation: { turns } };
            }),
          );
        },
        (context) => {
          console.log(`[useChatStreaming] onContext:`, context);
          updateStream(chatId, { contextInfo: context });
        },
        (fullText) => {
          console.log(
            `[useChatStreaming] onDone: fullText.length=${fullText.length}`,
          );
          updateStream(chatId, { status: "done", assistantText: fullText });
          abortControllersRef.current.delete(chatId);
        },
        (err) => {
          console.error(`[useChatStreaming] onError:`, err.message);
          updateStream(chatId, { status: "error", errorMessage: err.message });
          abortControllersRef.current.delete(chatId);
        },
        (description) => {
          console.log(`[useChatStreaming] onToolCall:`, description);
          updateStream(chatId, { toolCallDescription: description });
        },
        (estimatedTokens) => {
          console.log(
            `[useChatStreaming] onContextUpdate: estimatedTokens=${estimatedTokens}`,
          );
          const stream = streamsRef.current.get(chatId);
          if (stream?.contextInfo) {
            streamsRef.current.set(chatId, {
              ...stream,
              contextInfo: { ...stream.contextInfo, estimatedTokens },
            });
            scheduleRender();
          }
        },
      );

      abortControllersRef.current.set(chatId, abortController);
      console.log(
        `[useChatStreaming] AbortController stored for chatId=${chatId}`,
      );
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

import { useCallback } from "react";
import type { ChatMessage, Mode, LlmPublic, ChatSessionKind } from "../types.ts";
import type { NewChatConfirmPayload } from "../components/chat/NewChatDialog.tsx";
import {
  buildNaviConversationPatch,
  isNewChatConfirmPayload,
} from "../components/chat/chatAgentUtils.ts";
import { scheduleNaviGreetingKickoff } from "../components/chat/naviGreetingKickoff.ts";
import type { useChatHistory } from "./useChatHistory.ts";
import type { useChat } from "./useChat.ts";

interface ConversationActionsDeps {
  history: ReturnType<typeof useChatHistory>;
  chatMessages: ReturnType<typeof useChat>["messages"];
  selectedMode: string;
  modes: Mode[];
  llms: LlmPublic[];
}

/** Deep-clone chat messages for a new thread (incl. toolCalls, selectionContext). */
function cloneChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((m) => structuredClone(m) as ChatMessage);
}

/** Hidden system intro + parent transcript through `messageIndex` (inclusive) for a new thread.
 * Note: The last message (at `messageIndex`) is kept VISIBLE so users can see where the thread starts.
 */
function buildThreadHiddenBootstrap(
  parentDisplayTitle: string,
  chatMessages: ChatMessage[],
  messageIndex: number,
): ChatMessage[] {
  const title = parentDisplayTitle.trim() || "Haupt-Chat";
  const transcript = cloneChatMessages(chatMessages.slice(0, messageIndex + 1));
  const systemIntro: ChatMessage = {
    role: "system",
    content:
      `Du befindest dich in einem **Thread**, der vom Haupt-Chat „${title}“ abzweigt.\n\n` +
      `Die folgenden Nachrichten zeigen den Verlauf des Haupt-Chats bis einschließlich der Nachricht, ` +
      `an der dieser Thread gestartet wurde. Diese Nachrichten dienen als **Kontext** für die neue Diskussion. ` +
      `Die **letzte sichtbare Nachricht** zeigt, wo der Thread beginnt. Ab hier werden neue Themen behandelt.`,
    hidden: true,
  };
  return [
    systemIntro,
    ...transcript.map((m, idx) => ({
      ...m,
      hidden: idx < transcript.length - 1,
    })),
  ];
}

export function useConversationActions({
  history,
  chatMessages,
  selectedMode,
  modes,
  llms,
}: ConversationActionsDeps) {
  const applyNewChatPayload = useCallback(
    (newConvId: string) => {
      history.patchConversation(
        newConvId,
        buildNaviConversationPatch({}, modes, llms),
      );
      scheduleNaviGreetingKickoff(newConvId);
    },
    [history, modes, llms],
  );

  const handleNewChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const titleArg = payload.title.trim() || undefined;
        const newConv = history.createConversation(
          selectedMode,
          undefined,
          titleArg,
          payload.sessionKind,
        );
        applyNewChatPayload(newConv.id);
        return;
      }
      history.createConversation(selectedMode, undefined, undefined, "navi");
    },
    [history, selectedMode, applyNewChatPayload],
  );

  const handleDiscardCurrentChat = useCallback(
    (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => {
      if (isNewChatConfirmPayload(kindOrPayload)) {
        const payload = kindOrPayload;
        const newConv = history.discardActiveAndCreateConversation(
          selectedMode,
          payload.sessionKind,
        );
        const t = payload.title.trim();
        if (t) history.patchConversation(newConv.id, { title: t });
        applyNewChatPayload(newConv.id);
        return;
      }
      history.discardActiveAndCreateConversation(selectedMode, "navi");
    },
    [history, selectedMode, applyNewChatPayload],
  );

  const handleForkToNewConversation = useCallback(
    (index: number) => {
      if (history.activeConversation?.isThread) return;
      const forkedMessages = chatMessages.slice(0, index + 1);
      const baseTitle = history.activeConversation?.title ?? "Chat";
      const base = `${baseTitle}-fork`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;
      const parent = history.activeConversation;
      const sk = parent?.sessionKind ?? "navi";
      history.createConversation(
        selectedMode,
        forkedMessages,
        `${base} (${n})`,
        sk,
      );
    },
    [chatMessages, history, selectedMode],
  );

  const handleStartThreadFromMessage = useCallback(
    (messageIndex: number) => {
      const parent = history.activeConversation;
      if (!parent) return;
      if (messageIndex < 0 || messageIndex >= chatMessages.length) return;

      const baseTitle = parent.title?.trim() || "Chat";
      const base = `${baseTitle}-Thread`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;

      const initialMessages = buildThreadHiddenBootstrap(
        baseTitle,
        chatMessages,
        messageIndex,
      );

      const sk = parent.sessionKind ?? "navi";
      const threadMode = parent.mode || selectedMode;
      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
        sk,
      );
      history.patchConversation(newConv.id, {
        isThread: true,
        parentConversationId: parent.id,
      });
    },
    [chatMessages, history, selectedMode],
  );

  return {
    handleNewChat,
    handleDiscardCurrentChat,
    handleForkToNewConversation,
    handleStartThreadFromMessage,
  };
}

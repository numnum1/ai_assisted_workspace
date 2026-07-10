import { useCallback } from "react";
import type { Conversation, Mode } from "../types.ts";
import { resolveDefaultModeId } from "../components/chat/effectiveChatModeForRequest.ts";
import { buildThreadHiddenBootstrap } from "../components/chat/chatThreadUtils.ts";
import type { useChatHistory } from "./useChatHistory.ts";
import type { useChat } from "./useChat.ts";

interface ConversationActionsDeps {
  history: ReturnType<typeof useChatHistory>;
  chatMessages: ReturnType<typeof useChat>["messages"];
  selectedMode: string;
  modes: Mode[];
  handleModeChange: (modeId: string, modeList?: Mode[]) => void;
}

const NEW_CHAT_TITLE_PATTERN = /^Neuer Chat(?: (\d+))?$/;

function nextNewChatTitle(conversations: Conversation[]): string {
  let max = 0;
  for (const c of conversations) {
    const m = NEW_CHAT_TITLE_PATTERN.exec(c.title);
    if (m) {
      const num = m[1] ? parseInt(m[1], 10) : 1;
      if (num > max) max = num;
    }
  }
  return `Neuer Chat ${max + 1}`;
}

export function useConversationActions({
  history,
  chatMessages,
  selectedMode,
  modes,
  handleModeChange,
}: ConversationActionsDeps) {
  const handleNewChat = useCallback((title?: string) => {
    let modeForNew = selectedMode;
    if (!modes.some((m) => m.id === modeForNew)) {
      modeForNew = resolveDefaultModeId(modes, undefined);
      handleModeChange(modeForNew, modes);
    }
    const finalTitle = title?.trim() || nextNewChatTitle(history.conversations);
    history.createConversation(modeForNew, undefined, finalTitle);
  }, [history, selectedMode, modes, handleModeChange]);

  const handleDiscardCurrentChat = useCallback((title?: string) => {
    let modeDiscard = selectedMode;
    if (!modes.some((m) => m.id === modeDiscard)) {
      modeDiscard = resolveDefaultModeId(modes, undefined);
      handleModeChange(modeDiscard, modes);
    }
    const finalTitle = title?.trim() || nextNewChatTitle(history.conversations);
    history.discardActiveAndCreateConversation(modeDiscard, finalTitle);
  }, [history, selectedMode, modes, handleModeChange]);

  const handleForkToNewConversation = useCallback(
    (index: number) => {
      if (history.activeConversation?.isThread) return;
      const forkedMessages = chatMessages.slice(0, index + 1);
      const baseTitle = history.activeConversation?.title ?? "Chat";
      const base = `${baseTitle}-fork`;
      const existingTitles = new Set(history.conversations.map((c) => c.title));
      let n = 1;
      while (existingTitles.has(`${base} (${n})`)) n++;
      const forkMode = selectedMode;
      history.createConversation(forkMode, forkedMessages, `${base} (${n})`);
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

      const threadMode = parent.mode || selectedMode;
      const newConv = history.createConversation(
        threadMode,
        initialMessages,
        `${base} (${n})`,
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

import { useCallback } from "react";
import type { Mode, LlmPublic } from "../types.ts";
import { buildNaviConversationPatch } from "../components/chat/chatAgentUtils.ts";
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

export function useConversationActions({
  history,
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

  /** "Neuer Chat" replaces the current one: discard it and start a fresh empty Navi chat. */
  const handleNewChat = useCallback(() => {
    const newConv = history.discardActiveAndCreateConversation(
      selectedMode,
      "navi",
    );
    applyNewChatPayload(newConv.id);
  }, [history, selectedMode, applyNewChatPayload]);

  return {
    handleNewChat,
  };
}

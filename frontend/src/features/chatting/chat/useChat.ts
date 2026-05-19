import { useCallback, useContext } from "react";
import type { Chat } from "./Chat";
import type { ChatViewModel } from "./chat-view-model";
import type { ProjectViewModel } from "../project/project-types";
import ProjectContext from "../project/project-context";
import { useChatContext } from "./useChatContext";
import type { ToolId } from "../toolkit/Tools";

export function useChat({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  userMessage,
}: Chat): ChatViewModel {
  const { setChat, chatStreaming }: ProjectViewModel =
    useContext<ProjectViewModel>(ProjectContext);

  const setUseReasoning = useCallback(
    (newUseReasoning: boolean) => {
      setChat(id, {
        settings: {
          ...settings,
          selectedLLM: {
            ...settings.selectedLLM,
            useReasoning: newUseReasoning,
          },
        },
      });
    },
    [id, setChat, settings],
  );

  const enableToolById = useCallback(
    (toolId: ToolId) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolIds: [...settings.enabledToolIds, toolId],
        },
      });
    },
    [id, setChat, settings],
  );

  const disableToolById = useCallback(
    (toolId: ToolId) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolIds: settings.enabledToolIds.filter((id) => id !== toolId),
        },
      });
    },
    [id, setChat, settings],
  );

  const setUserMessage = useCallback(
    (newUserMessage: string) => {
      setChat(id, { userMessage: newUserMessage });
    },
    [id, setChat],
  );

  const addUserTurn = useCallback(
    (messageAsText: string) => {
      setChat(id, {
        conversation: {
          ...conversation,
          turns: [
            ...conversation.turns,
            { type: "USER", text: messageAsText, timestamp: Date.now() },
          ],
        },
      });
    },
    [id, setChat, conversation],
  );

  const send = useCallback(() => {
    console.log('Sending...')
    addUserTurn(userMessage);
    setUserMessage("");
    chatStreaming.startStream(id);
  }, [addUserTurn, id, chatStreaming, userMessage, setUserMessage]);

  const cancel = useCallback(() => {
    console.log('Cancelling...')
    chatStreaming.stopStream(id);
  }, [id, chatStreaming]);

  const rename = useCallback(
    (newName: string) => {
      setChat(id, { name: newName });
    },
    [setChat, id],
  );

  const selectMode = useCallback(
    (newSelectedModeId: string) => {
      setChat(id, {
        settings: { ...settings, selectedModeId: newSelectedModeId },
      });
    },
    [setChat, id, settings],
  );

  const selectLLM = useCallback(
    (newSelectedLLMId: string) => {
      setChat(id, {
        settings: {
          ...settings,
          selectedLLM: { id: newSelectedLLMId, useReasoning: true },
        },
      });
    },
    [setChat, id, settings],
  );

  const context = useChatContext(settings);

  const stream = chatStreaming.getStream(id);
  const streaming =
    stream?.status === "streaming" || stream?.status === "starting";

  return {
    parentChatId,
    id,
    name,
    conversation,
    settings,
    userMessage,
    streaming,
    send,
    cancel,
    setUserMessage: setUserMessage,
    setUseReasoning: setUseReasoning,
    enableToolById: enableToolById,
    disableToolById: disableToolById,
    rename,
    selectMode,
    selectLLM,
    context,
  };
}

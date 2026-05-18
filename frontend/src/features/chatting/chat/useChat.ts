import { useCallback, useContext, useMemo, useState } from "react";
import type { Chat } from "./Chat";
import { type ChatContext, type ChatViewModel } from "./chat-view-model";
import type { ProjectViewModel } from "../project/project-types";
import ProjectContext from "../project/project-context";

export function useChat({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  userMessage,
}: Chat): ChatViewModel {
  const { setChat }: ProjectViewModel =
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
    (toolId: string) => {
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
    (toolId: string) => {
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

  // TODO: Implement
  const send = useCallback(() => {
    console.log("Send Clicked");
  }, []);

  // TODO: Implement
  const cancel = useCallback(() => {
    console.log("Cancel Clicked");
  }, []);

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

  const context = useMemo<ChatContext>(() => {
    return {
      placeholder: 'TODO: Implement'
    }
  }, []);

  const [streaming, setStreaming] = useState(false);
  console.log(setStreaming) // TODO: Remove

  const res: ChatViewModel = useMemo<ChatViewModel>(() => {
    return {
      parentChatId,
      id,
      name,
      conversation,
      settings,
      userMessage,
      streaming,
      send: send,
      cancel: cancel,
      setUserMessage: setUserMessage,
      setUseReasoning: setUseReasoning,
      enableToolById: enableToolById,
      disableToolById: disableToolById,
      rename,
      selectMode,
      selectLLM,
      context,
    };
  }, [
    parentChatId,
    id,
    name,
    conversation,
    settings,
    userMessage,
    streaming,
    setUseReasoning,
    enableToolById,
    disableToolById,
    setUserMessage,
    send,
    cancel,
    rename,
    selectMode,
    selectLLM,
    context,
  ]);

  return res;
}

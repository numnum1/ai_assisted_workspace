import { useCallback, useContext, useMemo } from "react";
import type { Chat } from "./Chat";
import type { ChatViewModel } from "./chat-view-model";
import type {
  LLM,
  LLMVersion,
  ProjectViewModel,
} from "../project/project-types";
import ProjectContext from "../project/project-context";
import { useChatContext } from "./useChatContext";
import type { ToolkitId } from "../tools/toolkit";
import { getUserMessage, writeUserMessage } from "./userMessageStore";
import { useTurnViewFunctions } from "./useTurnViewFunctions";

export function useChat({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  userMessage,
}: Chat): ChatViewModel {
  const { setChat, chatStreaming, findLLMById }: ProjectViewModel =
    useContext<ProjectViewModel>(ProjectContext);

  useMemo(() => {
    writeUserMessage(id, userMessage);
  }, [id, userMessage]);

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
    (ToolkitId: ToolkitId) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolkitIds: [...settings.enabledToolkitIds, ToolkitId],
        },
      });
    },
    [id, setChat, settings],
  );

  const disableToolById = useCallback(
    (ToolkitId: ToolkitId) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolkitIds: settings.enabledToolkitIds.filter(
            (id) => id !== ToolkitId,
          ),
        },
      });
    },
    [id, setChat, settings],
  );

  const context = useChatContext(settings);

  const send = useCallback(() => {
    console.log("Sending...");
    chatStreaming.startStream(id, getUserMessage(id), context.systemPrompt);
  }, [id, chatStreaming, context.systemPrompt]);

  const cancel = useCallback(() => {
    console.log("Cancelling...");
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

  const selectedLLMVersion: LLMVersion | null = useMemo(() => {
    if (settings.selectedLLM.id == null) return null;
    const llm: LLM | null = findLLMById(settings.selectedLLM.id);
    if (llm == null) return null;
    return settings.selectedLLM.useReasoning ? llm.reasoning : llm.fast;
  }, [settings.selectedLLM, findLLMById]);

  const stream = chatStreaming.getStream(id);
  const streaming =
    stream?.status === "streaming" || stream?.status === "starting";

  const turnFunctions = useTurnViewFunctions(id, setChat);

  return {
    parentChatId,
    id,
    name,
    conversation,
    settings,
    streaming,
    send,
    cancel,
    setUseReasoning: setUseReasoning,
    enableToolById: enableToolById,
    disableToolById: disableToolById,
    rename,
    selectMode,
    selectLLM,
    context,
    selectedLLMVersion,
    ...turnFunctions,
  };
}

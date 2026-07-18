import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AltVersionSession,
  ClarificationData,
  Mode,
  ReasoningEffort,
  SelectionContext,
} from "../types.ts";
import type { useChat } from "./useChat.ts";
import type { useChatHistory } from "./useChatHistory.ts";

interface UseInlineChatParams {
  modes: Mode[];
  selectedMode: string;
  useReasoning: boolean;
  modeLlmId: string | undefined;
  disabledToolkits: Set<string>;
  setDisabledToolkits: Dispatch<SetStateAction<Set<string>>>;
  rulesEnabled: boolean;
  reasoningEffort: ReasoningEffort;
  chat: ReturnType<typeof useChat>;
  history: ReturnType<typeof useChatHistory>;
}

export function useInlineChat({
  modes,
  selectedMode,
  useReasoning,
  modeLlmId,
  disabledToolkits,
  setDisabledToolkits,
  rulesEnabled,
  reasoningEffort,
  chat,
  history,
}: UseInlineChatParams) {
  const [altVersionSession, setAltVersionSession] =
    useState<AltVersionSession | null>(null);

  const handleAltVersion = useCallback((session: AltVersionSession) => {
    setAltVersionSession(session);
  }, []);

  const handleCloseAltVersion = useCallback(() => {
    setAltVersionSession(null);
  }, []);

  const [inlineChatFiles, setInlineChatFiles] = useState<string[]>([]);

  const handleInlineChatAddFile = useCallback((path: string) => {
    setInlineChatFiles((prev) => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const handleInlineChatRemoveFile = useCallback((path: string) => {
    setInlineChatFiles((prev) => prev.filter((p) => p !== path));
  }, []);

  const handleInlineChatSend = useCallback(
    (
      text: string,
      selection: SelectionContext | null,
      clarificationData?: ClarificationData,
    ) => {
      const mode = modes.find((m) => m.id === selectedMode);
      chat.sendMessage(
        text,
        selectedMode,
        inlineChatFiles,
        mode?.name,
        mode?.color,
        useReasoning,
        modeLlmId,
        selection ?? undefined,
        null,
        disabledToolkits.size > 0 ? [...disabledToolkits] : undefined,
        {
          ...(clarificationData ? { clarificationData } : {}),
          ...(rulesEnabled ? {} : { rulesDisabled: true }),
          reasoningEffort,
        },
      );
    },
    [modes, selectedMode, inlineChatFiles, useReasoning, modeLlmId, disabledToolkits, rulesEnabled, reasoningEffort, chat],
  );

  const handleInlineChatToggleToolkit = useCallback((kitId: string) => {
    setDisabledToolkits((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
      return next;
    });
  }, [setDisabledToolkits]);

  const handleInlineChatEditMessage = useCallback(
    (index: number, newContent: string) => {
      chat.editMessage(index, newContent, {
        mode: selectedMode,
        referencedFiles: inlineChatFiles,
        useReasoning,
        reasoningEffort,
        llmId: modeLlmId,
        disabledToolkits: disabledToolkits.size > 0 ? [...disabledToolkits] : undefined,
        conversationId: history.activeId,
        rulesDisabled: !rulesEnabled,
      });
    },
    [chat, selectedMode, inlineChatFiles, useReasoning, reasoningEffort, modeLlmId, disabledToolkits, history.activeId, rulesEnabled],
  );

  const handleInlineChatForkToNew = useCallback(
    (index: number) => {
      const sliced = chat.messages.slice(0, index + 1);
      history.createConversation(selectedMode, sliced, `Verzweigt: ${history.activeConversation.title}`);
    },
    [chat.messages, selectedMode, history],
  );

  const handleInlineChatStartThread = useCallback(
    (messageIndex: number) => {
      const sliced = chat.messages.slice(0, messageIndex + 1);
      const parentId = history.activeId;
      const newConv = history.createConversation(selectedMode, sliced, "Thread");
      history.patchConversation(newConv.id, { isThread: true, parentConversationId: parentId });
    },
    [chat.messages, selectedMode, history],
  );

  const handleInlineChatSettleSnapshots = useCallback(
    (patch: Record<string, "applied" | "reverted">) => {
      history.settleWriteFileSnapshots(history.activeId, patch);
    },
    [history],
  );

  return {
    altVersionSession,
    handleAltVersion,
    handleCloseAltVersion,
    inlineChatFiles,
    handleInlineChatAddFile,
    handleInlineChatRemoveFile,
    handleInlineChatSend,
    handleInlineChatToggleToolkit,
    handleInlineChatEditMessage,
    handleInlineChatForkToNew,
    handleInlineChatStartThread,
    handleInlineChatSettleSnapshots,
  };
}

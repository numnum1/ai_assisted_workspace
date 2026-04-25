import { useState, useCallback, useRef, useLayoutEffect } from "react";
import type { ChatMessage, SelectionContext } from "../../types.ts";
import { ChatMessagesPane, EMPTY_SNAPSHOT_DISMISS, EMPTY_COMPOSER_BATCH_FORCED } from "./ChatMessagesPane.tsx";
import { ChatInput } from "./ChatInput.tsx";

interface ChatInteractivePaneProps {
  conversationId: string;
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  onSend: (message: string) => void;
  onStop: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onRetry?: () => void;
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  fullscreen?: boolean;
  structureRoot?: string | null;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  theme: "light" | "dark";
  fieldLabels?: Record<string, string>;
}

export function ChatInteractivePane({
  conversationId,
  messages,
  streaming,
  error,
  toolActivity,
  onSend,
  onStop,
  onEditMessage,
  onDeleteMessages,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onRetry,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  fullscreen,
  structureRoot,
  activeSelection,
  onDismissSelection,
  theme,
  fieldLabels,
}: ChatInteractivePaneProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Scroll to the bottom when conversation switches or new messages arrive
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, [conversationId, messages.length]);

  const commitEdit = useCallback(
    (index: number, text: string) => {
      onEditMessage(index, text);
      setEditingIdx(null);
    },
    [onEditMessage],
  );

  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
  }, []);

  return (
    <div className="chat-panel-body-main">
      <ChatMessagesPane
        messages={messages}
        readOnly={false}
        scrollRef={scrollRef}
        streaming={streaming}
        error={error}
        toolActivity={toolActivity}
        activeIsThread={false}
        editingIdx={editingIdx}
        setEditingIdx={setEditingIdx}
        copiedIdx={copiedIdx}
        setCopiedIdx={setCopiedIdx}
        bulkDismissIds={EMPTY_SNAPSHOT_DISMISS}
        composerBatchForced={EMPTY_COMPOSER_BATCH_FORCED}
        onForkFromMessage={onForkFromMessage}
        onStartThreadFromMessage={onStartThreadFromMessage}
        onForkToNewConversation={onForkToNewConversation}
        onEditMessage={onEditMessage}
        onDeleteMessages={onDeleteMessages}
        commitEdit={commitEdit}
        cancelEdit={cancelEdit}
        fieldLabels={fieldLabels}
        onRetry={onRetry}
        theme={theme}
      />
      <div className="chat-composer-stack">
        <ChatInput
          key={conversationId}
          onSend={onSend}
          onStop={onStop}
          streaming={streaming}
          referencedFiles={referencedFiles}
          onAddFile={onAddFile}
          onRemoveFile={onRemoveFile}
          fullscreen={fullscreen}
          structureRoot={structureRoot}
          activeSelection={activeSelection}
          onDismissSelection={onDismissSelection}
        />
      </div>
    </div>
  );
}

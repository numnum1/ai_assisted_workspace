import { useState, useEffect, useRef } from 'react';
import { Trash2, Search, Scissors, History, Copy, Check, Wand2 } from 'lucide-react';
import type { ChatMessage, Mode, Conversation, SelectionContext } from '../../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { ChatMessageMarkdown } from './ChatMessageMarkdown.tsx';

const PROMPT_PACK_DISPLAY_NAME = 'Prompt-Paket';

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  modes: Mode[];
  selectedMode: string;
  referencedFiles: string[];
  conversations: Conversation[];
  activeConversationId: string;
  useReasoning: boolean;
  onToggleReasoning: () => void;
  onModeChange: (mode: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onClear: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onNewChat: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onOpenPromptPack?: () => void;
  structureRoot?: string | null;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  chatFocusTriggerRef?: React.MutableRefObject<(() => void) | null>;
}

function getContrastingTextColor(hexColor?: string): string | undefined {
  if (!hexColor || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return undefined;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e1e2e' : '#f5f5ff';
}

export function ChatPanel({
  messages,
  streaming,
  error,
  toolActivity,
  modes,
  selectedMode,
  referencedFiles,
  conversations,
  activeConversationId,
  useReasoning,
  onToggleReasoning,
  onModeChange,
  onSend,
  onStop,
  onClear,
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
  onNewChat,
  onSwitchChat,
  onDeleteChat,
  onRenameChat,
  onOpenPromptPack,
  structureRoot = null,
  activeSelection = null,
  onDismissSelection,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  chatFocusTriggerRef,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <ModeSelector modes={modes} selectedMode={selectedMode} onModeChange={onModeChange} />
        <div className="chat-header-actions">
          {onOpenPromptPack && (
            <button
              type="button"
              className="chat-prompt-pack-btn"
              onClick={onOpenPromptPack}
              title="Prompt-Paket (Export für ChatGPT / Grok)"
            >
              <Wand2 size={14} />
            </button>
          )}
          <button
            className={`chat-history-btn ${historyOpen ? 'active' : ''}`}
            onClick={() => setHistoryOpen((prev) => !prev)}
            title="Chat-Historie"
          >
            <History size={14} />
          </button>
          <button className="chat-clear-btn" onClick={onClear} title="Clear chat">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {historyOpen && (
        <ChatHistory
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={onSwitchChat}
          onCreate={onNewChat}
          onDelete={onDeleteChat}
          onRename={onRenameChat}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className="chat-messages">
        {messages.filter((m) => !m.hidden).length === 0 && (
          <div className="chat-empty">
            <p>Start a conversation with your AI assistant.</p>
            <p className="chat-empty-hint">
              Drag files from the project tree into the input area to reference them,
              or use @filename syntax in your message.
              {onOpenPromptPack && (
                <>
                  {' '}
                  Für einen fertigen Export-Prompt nutze das Zauberstab-Symbol oben (Prompt-Paket).
                </>
              )}
            </p>
          </div>
        )}
        {messages
          .map((msg, originalIdx) => ({ msg, originalIdx }))
          .filter(({ msg }) => !msg.hidden)
          .map(({ msg, originalIdx }, visIdx, visArr) => {
          const prevUser = visIdx > 0 ? visArr[visIdx - 1].msg : null;
          const showCopyForPromptPack =
            msg.role === 'assistant' &&
            msg.content.trim() &&
            prevUser?.role === 'user' &&
            prevUser.mode === PROMPT_PACK_DISPLAY_NAME;

          return (
            <div
              key={originalIdx}
              className={`chat-message ${msg.role}`}
              style={msg.role === 'user' && msg.modeColor ? {
                backgroundColor: msg.modeColor,
                borderLeftColor: msg.modeColor,
                color: getContrastingTextColor(msg.modeColor),
              } : undefined}
            >
              <div
                className="chat-message-role"
                style={msg.role === 'user' && msg.modeColor ? { color: getContrastingTextColor(msg.modeColor) } : undefined}
              >
                {msg.role === 'user' ? (
                  <span>
                    You
                    {msg.mode && (
                      <span className="chat-message-mode" style={{ color: getContrastingTextColor(msg.modeColor) }}>
                        {' · '}{msg.mode}
                      </span>
                    )}
                  </span>
                ) : (
                  'Assistant'
                )}
              </div>
              <div
                className={
                  msg.role === 'assistant' ? 'chat-message-content chat-message-md' : 'chat-message-content'
                }
              >
                {msg.role === 'assistant' ? (
                  <ChatMessageMarkdown
                    content={msg.content}
                    streamingCursor={streaming && originalIdx === messages.length - 1}
                    selectionContext={msg.selectionContext}
                    onReplace={msg.selectionContext && onReplaceSelection
                      ? (text) => onReplaceSelection(text, msg.selectionContext!)
                      : undefined}
                    onApplyFieldUpdate={onApplyFieldUpdate}
                    fieldLabels={fieldLabels}
                    onSelectOption={onSend}
                    isAnswered={visIdx < visArr.length - 1 && visArr[visIdx + 1]?.msg.role === 'user'}
                  />
                ) : (
                  msg.content
                )}
              </div>
              {showCopyForPromptPack && (
                <button
                  type="button"
                  className="copy-msg-btn"
                  title="In Zwischenablage kopieren"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(msg.content);
                      setCopiedIdx(originalIdx);
                      setTimeout(() => setCopiedIdx(null), 2000);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copiedIdx === originalIdx ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
              {visIdx > 0 && !streaming && (
                <button
                  className="chat-fork-btn"
                  onClick={() => onForkFromMessage(originalIdx)}
                  title="Neuen Chat ab hier"
                >
                  <Scissors size={12} />
                </button>
              )}
            </div>
          );
        })}
        {toolActivity && streaming && (
          <div className="chat-tool-activity">
            <Search size={14} className="chat-tool-activity-icon" />
            <span>{toolActivity}</span>
          </div>
        )}
        {error && (
          <div className="chat-message error">
            <div className="chat-message-content">Error: {error}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        referencedFiles={referencedFiles}
        onAddFile={onAddFile}
        onRemoveFile={onRemoveFile}
        structureRoot={structureRoot}
        useReasoning={useReasoning}
        onToggleReasoning={onToggleReasoning}
        activeSelection={activeSelection}
        onDismissSelection={onDismissSelection}
        focusTriggerRef={chatFocusTriggerRef}
      />
    </div>
  );
}

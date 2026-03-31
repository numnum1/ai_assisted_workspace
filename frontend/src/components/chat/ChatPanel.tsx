import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Scissors, GitFork, History, Copy, Check, Wand2, Pencil } from 'lucide-react';
import type { ChatMessage, Mode, Conversation, SelectionContext, NoteProposal, WikiType, WikiEntry } from '../../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { NewChatButton } from './NewChatButton.tsx';
import { NewChatDialog } from './NewChatDialog.tsx';
import { ChatMessageMarkdown } from './ChatMessageMarkdown.tsx';
import { NoteCard } from './NoteCard.tsx';
import { wikiApi } from '../../api.ts';

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
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onNewChat: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onToggleSavedToProject: (id: string) => void;
  onClearAllBrowserChats?: () => void;
  clearAllBrowserChatsDisabled?: boolean;
  onOpenPromptPack?: () => void;
  structureRoot?: string | null;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  chatFocusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  wikiTypes?: WikiType[];
  onSaveFreeNote?: (note: NoteProposal) => Promise<void>;
  onAttachNoteToEntry?: (note: NoteProposal, typeId: string, entryId: string) => Promise<void>;
}

function getContrastingTextColor(hexColor?: string): string | undefined {
  if (!hexColor || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return undefined;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e1e2e' : '#f5f5ff';
}

/**
 * Scans all messages (including hidden tool-chain messages) and returns a map from
 * visible message index to the list of note proposals that should appear after it.
 * A note proposal is a tool result from a "propose_note" tool call.
 */
function extractNoteProposals(messages: ChatMessage[]): Map<number, NoteProposal[]> {
  // Build map: toolCallId → function name (from assistant messages with toolCalls)
  const toolCallFnMap = new Map<string, string>();
  messages.forEach((m) => {
    if (m.role === 'assistant' && m.toolCalls) {
      m.toolCalls.forEach((tc) => toolCallFnMap.set(tc.id, tc.function.name));
    }
  });

  // Track the index of the last visible (non-hidden) message seen so far
  const result = new Map<number, NoteProposal[]>();
  let lastVisibleIdx = -1;

  messages.forEach((m, idx) => {
    if (!m.hidden) {
      lastVisibleIdx = idx;
    }
    if (m.role === 'tool' && m.toolCallId) {
      const fnName = toolCallFnMap.get(m.toolCallId);
      if (fnName === 'propose_note') {
        try {
          const note = JSON.parse(m.content) as NoteProposal;
          if (note.id && note.title && note.content) {
            const key = lastVisibleIdx;
            const existing = result.get(key) ?? [];
            result.set(key, [...existing, note]);
          }
        } catch {
          /* ignore malformed note JSON */
        }
      }
    }
  });

  return result;
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
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
  onForkToNewConversation,
  onNewChat,
  onSwitchChat,
  onDeleteChat,
  onRenameChat,
  onToggleSavedToProject,
  onClearAllBrowserChats,
  clearAllBrowserChatsDisabled = true,
  onOpenPromptPack,
  structureRoot = null,
  activeSelection = null,
  onDismissSelection,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  chatFocusTriggerRef,
  wikiTypes = [],
  onSaveFreeNote,
  onAttachNoteToEntry,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [dismissedNoteIds, setDismissedNoteIds] = useState<Set<string>>(new Set());
  const [wikiEntriesByType, setWikiEntriesByType] = useState<Record<string, WikiEntry[]>>({});

  const activeTitle = conversations.find((c) => c.id === activeConversationId)?.title ?? '';

  const handleNewChatClick = () => {
    const hasMessages = messages.filter((m) => !m.hidden).length > 0;
    if (hasMessages) {
      setNewChatDialogOpen(true);
    } else {
      onNewChat();
    }
  };

  const handleNewChatConfirm = (title: string) => {
    setNewChatDialogOpen(false);
    if (title.trim() && title.trim() !== activeTitle) {
      onRenameChat(activeConversationId, title.trim());
    }
    onNewChat();
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setRenamingTitle(false);
  }, [activeConversationId]);

  // Reset dismissed notes when chat is cleared
  useEffect(() => {
    if (messages.length === 0) {
      setDismissedNoteIds(new Set());
    }
  }, [messages.length]);

  const handleLoadEntries = useCallback(async (typeId: string) => {
    if (wikiEntriesByType[typeId]) return;
    try {
      const entries = await wikiApi.listEntries(typeId);
      setWikiEntriesByType((prev) => ({ ...prev, [typeId]: entries }));
    } catch {
      /* ignore */
    }
  }, [wikiEntriesByType]);

  const noteProposalMap = extractNoteProposals(messages);

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
          <NewChatButton onClick={handleNewChatClick} />
        </div>
        <div className="chat-header-title-row">
          {renamingTitle ? (
            <input
              className="chat-header-rename-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => { onRenameChat(activeConversationId, titleDraft); setRenamingTitle(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onRenameChat(activeConversationId, titleDraft); setRenamingTitle(false); }
                if (e.key === 'Escape') setRenamingTitle(false);
              }}
              autoFocus
            />
          ) : (
            <span className="chat-header-title" title={activeTitle}>{activeTitle}</span>
          )}
          <button
            className="chat-header-rename-btn"
            onClick={() => { setTitleDraft(activeTitle); setRenamingTitle(true); }}
            title="Chat umbenennen"
          >
            <Pencil size={11} />
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
          onToggleSavedToProject={onToggleSavedToProject}
          onClearAllBrowserChats={onClearAllBrowserChats}
          clearAllBrowserDisabled={clearAllBrowserChatsDisabled}
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

          const noteProposalsForMsg = (noteProposalMap.get(originalIdx) ?? [])
            .filter((n) => !dismissedNoteIds.has(n.id));

          return (
            <div key={originalIdx}>
              <div
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
                  <div className="chat-fork-actions">
                    <button
                      className="chat-fork-btn"
                      onClick={() => onForkFromMessage(originalIdx)}
                      title="Hier abschneiden (in-place)"
                    >
                      <Scissors size={12} />
                    </button>
                    <button
                      className="chat-fork-btn"
                      onClick={() => onForkToNewConversation(originalIdx)}
                      title="Als neuen Chat forken"
                    >
                      <GitFork size={12} />
                    </button>
                  </div>
                )}
              </div>
              {noteProposalsForMsg.length > 0 && onSaveFreeNote && onAttachNoteToEntry && (
                <div className="note-cards-container">
                  {noteProposalsForMsg.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      wikiTypes={wikiTypes}
                      wikiEntriesByType={wikiEntriesByType}
                      onSaveFree={onSaveFreeNote}
                      onAttachToEntry={onAttachNoteToEntry}
                      onDismiss={(id) => setDismissedNoteIds((prev) => new Set([...prev, id]))}
                      onLoadEntries={handleLoadEntries}
                    />
                  ))}
                </div>
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

      {newChatDialogOpen && (
        <NewChatDialog
          currentTitle={activeTitle}
          onConfirm={handleNewChatConfirm}
          onCancel={() => setNewChatDialogOpen(false)}
        />
      )}
    </div>
  );
}

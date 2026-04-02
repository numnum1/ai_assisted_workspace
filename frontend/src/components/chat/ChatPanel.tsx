import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Scissors, GitFork, History, Copy, Check, Wand2, Pencil, BookMarked } from 'lucide-react';
import type { ChatMessage, Mode, Conversation, SelectionContext, NoteProposal, WikiType, WikiEntry, LlmPublic } from '../../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { NewChatButton } from './NewChatButton.tsx';
import { NewChatDialog } from './NewChatDialog.tsx';
import { ChatMessageMarkdown } from './ChatMessageMarkdown.tsx';
import { NoteCard } from './NoteCard.tsx';
import { wikiApi } from '../../api.ts';
import { GlossaryChatDialog } from './GlossaryChatDialog.tsx';

function buildGlossaryChatContext(msgs: ChatMessage[]): string {
  const visible = msgs.filter((m) => !m.hidden && (m.role === 'user' || m.role === 'assistant'));
  const last = visible.slice(-40);
  return last
    .map((m) => {
      const label = m.role === 'user' ? 'Nutzer' : 'Assistent';
      const text = m.role === 'user' ? (m.resolvedContent ?? m.content) : m.content;
      return `${label}: ${text}`;
    })
    .join('\n\n');
}

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
  onDiscardCurrentChat: () => void;
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
  llms?: LlmPublic[];
  selectedLlmId?: string;
  onLlmChange?: (id: string | undefined) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
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
  onDiscardCurrentChat,
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
  llms = [],
  selectedLlmId,
  onLlmChange,
  reasoningAvailable = true,
  fastAvailable = true,
}: ChatPanelProps) {
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<'user' | 'assistant' | undefined>(undefined);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [dismissedNoteIds, setDismissedNoteIds] = useState<Set<string>>(new Set());
  const [wikiEntriesByType, setWikiEntriesByType] = useState<Record<string, WikiEntry[]>>({});
  const [glossaryAnchor, setGlossaryAnchor] = useState<{ text: string; x: number; y: number } | null>(null);
  const [glossaryDialog, setGlossaryDialog] = useState<{ open: boolean; term: string; version: number }>({
    open: false,
    term: '',
    version: 0,
  });

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

  const handleNewChatDiscard = () => {
    setNewChatDialogOpen(false);
    onDiscardCurrentChat();
  };

  useEffect(() => {
    setRenamingTitle(false);
  }, [activeConversationId]);

  useEffect(() => {
    prevLastVisibleRoleRef.current = undefined;
  }, [activeConversationId]);

  // Once per sent user message: scroll to bottom (not on every streaming token).
  useEffect(() => {
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    const role =
      last?.role === 'user' ? 'user' : last?.role === 'assistant' ? 'assistant' : undefined;
    const prev = prevLastVisibleRoleRef.current;
    if (role === 'user' && prev !== 'user') {
      const el = messagesScrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevLastVisibleRoleRef.current = role;
  }, [messages]);

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

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => setGlossaryAnchor(null);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.glossary-chat-selection-btn')) return;
      if (t.closest('.chat-messages')) return;
      setGlossaryAnchor(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const handleChatMessagesMouseUp = useCallback(() => {
    const root = messagesScrollRef.current;
    if (!root) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setGlossaryAnchor(null);
      return;
    }
    const anchorNode = sel.anchorNode;
    const focusNode = sel.focusNode;
    if (!anchorNode || !focusNode) {
      setGlossaryAnchor(null);
      return;
    }
    if (!root.contains(anchorNode) || !root.contains(focusNode)) {
      setGlossaryAnchor(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length > 500) {
      setGlossaryAnchor(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setGlossaryAnchor({
      text,
      x: rect.left + rect.width / 2,
      y: Math.min(rect.bottom + 6, window.innerHeight - 8),
    });
  }, []);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <ModeSelector modes={modes} selectedMode={selectedMode} onModeChange={onModeChange} />
        <div className="chat-header-actions">
          {llms.length > 0 && onLlmChange && (
            <select
              className="chat-llm-select"
              value={selectedLlmId ?? ''}
              onChange={(e) => onLlmChange(e.target.value || undefined)}
              title="LLM auswählen"
            >
              <option value="">— Standard —</option>
              {llms.map((llm) => (
                <option key={llm.id} value={llm.id}>
                  {llm.name}
                </option>
              ))}
            </select>
          )}
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

      <div className="chat-messages" ref={messagesScrollRef} onMouseUp={handleChatMessagesMouseUp}>
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
      </div>

      {glossaryAnchor && !streaming && (
        <button
          type="button"
          className="glossary-chat-selection-btn"
          style={{ left: glossaryAnchor.x, top: glossaryAnchor.y }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setGlossaryDialog((p) => ({
              open: true,
              term: glossaryAnchor.text,
              version: p.version + 1,
            }));
            setGlossaryAnchor(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <BookMarked size={12} />
          Glossar
        </button>
      )}

      <GlossaryChatDialog
        open={glossaryDialog.open}
        dialogVersion={glossaryDialog.version}
        initialTerm={glossaryDialog.term}
        chatContext={buildGlossaryChatContext(messages)}
        onClose={() => setGlossaryDialog((p) => ({ ...p, open: false }))}
      />

      <ChatInput
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        referencedFiles={referencedFiles}
        onAddFile={onAddFile}
        onRemoveFile={onRemoveFile}
        structureRoot={structureRoot}
        useReasoning={useReasoning && reasoningAvailable}
        onToggleReasoning={onToggleReasoning}
        reasoningAvailable={reasoningAvailable}
        fastAvailable={fastAvailable}
        activeSelection={activeSelection}
        onDismissSelection={onDismissSelection}
        focusTriggerRef={chatFocusTriggerRef}
      />

      {newChatDialogOpen && (
        <NewChatDialog
          currentTitle={activeTitle}
          onConfirm={handleNewChatConfirm}
          onDiscard={handleNewChatDiscard}
          onCancel={() => setNewChatDialogOpen(false)}
        />
      )}
    </div>
  );
}

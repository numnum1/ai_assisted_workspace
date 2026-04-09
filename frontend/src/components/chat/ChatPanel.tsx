import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Search, Scissors, GitFork, History, Copy, Check, Wand2, Pencil, Maximize2, Minimize2, X, Trash2, RotateCcw } from 'lucide-react';
import type { ChatMessage, Mode, Conversation, SelectionContext, LlmPublic } from '../../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { NewChatButton } from './NewChatButton.tsx';
import { NewChatDialog } from './NewChatDialog.tsx';
import { ChatMessageMarkdown } from './ChatMessageMarkdown.tsx';
import { SuggestedActionsCard } from './SuggestedActionsCard.tsx';
import { parseClarificationQuestions, hasClarificationFence } from './clarificationUtils.ts';
import { ChangeCard } from './ChangeCard.tsx';
import type { ChangeCardData } from './ChangeCard.tsx';

const PROMPT_PACK_DISPLAY_NAME = 'Prompt-Paket';

/** Assistant reply length (chars) below which we keep following the stream with auto-scroll. */
const AUTOSCROLL_CHAR_LIMIT = 1500;

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
  /** Toolkit ids disabled for this session (persisted in App). */
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  onModeChange: (mode: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessage: (index: number) => void;
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
  llms?: LlmPublic[];
  selectedLlmId?: string;
  onLlmChange?: (id: string | undefined) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  onRetry?: () => void;
  onFileChanged?: (path: string) => void;
}

interface MessageEditBoxProps {
  initialContent: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

const MessageEditBox = memo(function MessageEditBox({ initialContent, onSave, onCancel }: MessageEditBoxProps) {
  const [draft, setDraft] = useState(initialContent);

  return (
    <div className="chat-message-edit-wrap">
      <textarea
        className="chat-message-edit-textarea"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(draft); }
        }}
        ref={(el) => {
          if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
        }}
        autoFocus
      />
      <div className="chat-edit-actions">
        <button
          type="button"
          className="chat-edit-save-btn"
          disabled={!draft.trim()}
          onClick={() => onSave(draft)}
          title="Speichern (Enter)"
        >
          <Check size={14} />
          <span>Speichern</span>
        </button>
        <button
          type="button"
          className="chat-edit-cancel-btn"
          onClick={onCancel}
          title="Abbrechen (Esc)"
        >
          <X size={14} />
          <span>Abbrechen</span>
        </button>
      </div>
    </div>
  );
});

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
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  onModeChange,
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
  onForkToNewConversation,
  onEditMessage,
  onDeleteMessage,
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
  llms = [],
  selectedLlmId,
  onLlmChange,
  reasoningAvailable = true,
  fastAvailable = true,
  onRetry,
  onFileChanged,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<'user' | 'assistant' | undefined>(undefined);
  const prevStreamingRef = useRef(false);
  /** When false, stop auto-scrolling for the current stream (user scrolled up or reply grew too large). */
  const autoScrollActiveRef = useRef(true);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [glossaryPopup, setGlossaryPopup] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const [glossaryForm, setGlossaryForm] = useState<{ term: string; definition: string } | null>(null);
  const [glossarySaving, setGlosarySaving] = useState(false);

  const pendingClarification = useMemo(() => {
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    const last = vis[vis.length - 1];
    if (!last || last.m.role !== 'assistant') return null;
    const qs = parseClarificationQuestions(last.m.content);
    if (!qs?.length) return null;
    const userAfter = messages
      .slice(last.originalIdx + 1)
      .some((m) => !m.hidden && m.role === 'user');
    if (userAfter) return null;
    return qs;
  }, [messages]);

  const activeTitle = conversations.find((c) => c.id === activeConversationId)?.title ?? '';

  const cancelEdit = useCallback(() => setEditingIdx(null), []);

  const commitEdit = useCallback(
    (originalIdx: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onEditMessage(originalIdx, trimmed);
      setEditingIdx(null);
    },
    [onEditMessage],
  );

  const handleMessagesMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setGlossaryPopup(null);
      return;
    }
    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      setGlossaryPopup(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!panelRect) return;
    setGlossaryPopup({
      x: rect.left - panelRect.left + rect.width / 2,
      y: rect.top - panelRect.top - 8,
      selectedText: text,
    });
  }, []);

  const handleSaveToGlossary = async () => {
    if (!glossaryForm) return;
    setGlosarySaving(true);
    try {
      await fetch('/api/glossary/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: glossaryForm.term, definition: glossaryForm.definition }),
      });
    } finally {
      setGlosarySaving(false);
      setGlossaryForm(null);
      setGlossaryPopup(null);
      window.getSelection()?.removeAllRanges();
    }
  };

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
    setEditingIdx(null);
  }, [activeConversationId]);

  // After load / conversation switch: show the latest messages.
  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const scrollToEnd = () => { el.scrollTop = el.scrollHeight; };
    requestAnimationFrame(() => { requestAnimationFrame(scrollToEnd); });
  }, [activeConversationId, messages.length]);

  useEffect(() => {
    prevLastVisibleRoleRef.current = undefined;
    autoScrollActiveRef.current = true;
  }, [activeConversationId]);

  // Re-enable follow-scroll when a new stream starts.
  useEffect(() => {
    if (streaming && !prevStreamingRef.current) {
      autoScrollActiveRef.current = true;
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  // Once per sent user message: scroll to bottom.
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

  // During streaming: auto-scroll for small/medium assistant replies; stop if reply is large or user scrolls up.
  useEffect(() => {
    if (!streaming) return;
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (!autoScrollActiveRef.current) return;
    if (last.content.length > AUTOSCROLL_CHAR_LIMIT) {
      autoScrollActiveRef.current = false;
      return;
    }
    const el = messagesScrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, streaming]);

  // Disable follow-scroll when the user scrolls away from the bottom during streaming.
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || !streaming) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 60) {
        autoScrollActiveRef.current = false;
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [streaming]);

  useEffect(() => {
    const panel = panelRef.current;
    const syncFullscreen = () => {
      const fs =
        document.fullscreenElement ??
        (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
        null;
      setIsFullscreen(!!panel && fs === panel);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    };
  }, []);

  const toggleChatFullscreen = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const fs =
      document.fullscreenElement ??
      (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
      null;
    if (fs === el) {
      const exit = document.exitFullscreen?.bind(document) ?? (document as Document & { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen?.bind(document);
      if (exit) void exit().catch(() => { /* user gesture / policy */ });
      return;
    }
    const req =
      el.requestFullscreen?.bind(el) ??
      (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.bind(el);
    if (req) void req().catch(() => { /* unsupported or denied */ });
  }, []);


  return (
    <div ref={panelRef} className="chat-panel">
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
            type="button"
            className={`chat-history-btn ${isFullscreen ? 'active' : ''}`}
            onClick={() => toggleChatFullscreen()}
            title={isFullscreen ? 'Vollbild verlassen (Esc)' : 'Chat im Vollbild'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
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

      <div className="chat-messages" ref={messagesScrollRef} onMouseUp={handleMessagesMouseUp}>
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
          const isLastUserMsg =
            msg.role === 'user' &&
            !visArr.slice(visIdx + 1).some(({ msg: m }) => m.role === 'user');
          const showCopyForPromptPack =
            msg.role === 'assistant' &&
            msg.content.trim() &&
            prevUser?.role === 'user' &&
            prevUser.mode === PROMPT_PACK_DISPLAY_NAME;

          if (msg.role === 'tool' && msg.content?.startsWith('glossary_add:success:')) {
            const term = msg.content.slice('glossary_add:success:'.length);
            return (
              <div key={originalIdx} className="glossary-indicator">
                <span className="glossary-indicator-icon">📖</span>
                <span className="glossary-indicator-text">Glossar-Eintrag angelegt: <strong>{term}</strong></span>
              </div>
            );
          }

          if (msg.role === 'tool' && msg.content?.startsWith('write_file:success:')) {
            const rest = msg.content.slice('write_file:success:'.length);
            // format: {snapshotId}:{new|modified}:{path}:{description}
            const parts = rest.split(':');
            if (parts.length >= 4) {
              const snapshotId = parts[0];
              const isNew = parts[1] === 'new';
              const path = parts[2];
              const description = parts.slice(3).join(':');
              const cardData: ChangeCardData = { snapshotId, path, isNew, description };
              return (
                <div key={originalIdx} className="change-card-wrapper">
                  <ChangeCard
                    data={cardData}
                    onFileChanged={onFileChanged}
                  />
                </div>
              );
            }
          }

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
                      suppressClarificationWidget={hasClarificationFence(msg.content)}
                    />
                  ) : editingIdx === originalIdx ? (
                    <MessageEditBox
                      initialContent={msg.content}
                      onSave={(text) => commitEdit(originalIdx, text)}
                      onCancel={cancelEdit}
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
                {!streaming && (msg.role === 'user' || visIdx > 0) && editingIdx !== originalIdx && (
                  <div className="chat-fork-actions">
                    {msg.role === 'user' && isLastUserMsg && (
                      <button
                        type="button"
                        className="chat-fork-btn chat-resend-btn"
                        onClick={() => onEditMessage(originalIdx, msg.content)}
                        title="Nachricht erneut senden"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                    {msg.role === 'user' && (
                      <button
                        type="button"
                        className="chat-fork-btn chat-edit-btn"
                        onClick={() => setEditingIdx(originalIdx)}
                        title="Nachricht bearbeiten"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                    {visIdx > 0 && (
                      <>
                        <button
                          type="button"
                          className="chat-fork-btn"
                          onClick={() => onForkFromMessage(originalIdx)}
                          title="Hier abschneiden (in-place)"
                        >
                          <Scissors size={12} />
                        </button>
                        <button
                          type="button"
                          className="chat-fork-btn"
                          onClick={() => onForkToNewConversation(originalIdx)}
                          title="Als neuen Chat forken"
                        >
                          <GitFork size={12} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="chat-fork-btn chat-fork-btn--danger"
                      onClick={() => onDeleteMessage(originalIdx)}
                      title="Nachricht löschen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
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
            <div className="chat-message-content">
              {error === 'NETWORK_ERROR' ? (
                <>
                  <strong>Verbindungsproblem:</strong> Die KI-API ist nicht erreichbar.
                  <br />
                  Bitte VPN-Verbindung prüfen — aktive VPN-Verbindungen können die DNS-Auflösung blockieren.
                </>
              ) : error === 'MODEL_EMPTY_RESPONSE' ? (
                'Das Modell hat keine Antwort geliefert (Kontext zu lang oder Inhaltsfilter).'
              ) : (
                `Error: ${error}`
              )}
            </div>
            {(error === 'MODEL_EMPTY_RESPONSE' || error === 'NETWORK_ERROR') && onRetry && (
              <button className="chat-retry-btn" onClick={onRetry}>
                Erneut versuchen
              </button>
            )}
          </div>
        )}
      </div>

      {pendingClarification && pendingClarification.length > 0 ? (
        <SuggestedActionsCard
          questions={pendingClarification}
          onSubmit={onSend}
          disabled={streaming}
        />
      ) : null}

      <ChatInput
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        referencedFiles={referencedFiles}
        onAddFile={onAddFile}
        onRemoveFile={onRemoveFile}
        fullscreen={isFullscreen}
        structureRoot={structureRoot}
        useReasoning={useReasoning && reasoningAvailable}
        onToggleReasoning={onToggleReasoning}
        disabledToolkits={disabledToolkits}
        onToggleToolkit={onToggleToolkit}
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

      {glossaryPopup && !glossaryForm && (
        <div
          className="glossary-selection-popup"
          style={{ left: glossaryPopup.x, top: glossaryPopup.y }}
        >
          <button
            className="glossary-selection-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              setGlossaryForm({ term: glossaryPopup.selectedText, definition: '' });
            }}
          >
            📖 Als Glossar-Begriff speichern
          </button>
        </div>
      )}

      {glossaryForm && (
        <div className="glossary-save-overlay" onClick={() => { setGlossaryForm(null); setGlossaryPopup(null); }}>
          <div className="glossary-save-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-save-title">Glossar-Eintrag speichern</div>
            <label className="glossary-save-label">
              Begriff
              <input
                className="glossary-save-input"
                value={glossaryForm.term}
                onChange={(e) => setGlossaryForm({ ...glossaryForm, term: e.target.value })}
                autoFocus
              />
            </label>
            <label className="glossary-save-label">
              Definition
              <textarea
                className="glossary-save-textarea"
                value={glossaryForm.definition}
                onChange={(e) => setGlossaryForm({ ...glossaryForm, definition: e.target.value })}
                rows={3}
                placeholder="Kurze Erklärung..."
              />
            </label>
            <div className="glossary-save-actions">
              <button
                className="glossary-save-cancel"
                onClick={() => { setGlossaryForm(null); setGlossaryPopup(null); }}
              >
                Abbrechen
              </button>
              <button
                className="glossary-save-confirm"
                disabled={!glossaryForm.term.trim() || !glossaryForm.definition.trim() || glossarySaving}
                onClick={handleSaveToGlossary}
              >
                {glossarySaving ? 'Speichere…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

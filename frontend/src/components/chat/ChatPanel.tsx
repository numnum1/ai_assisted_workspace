import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, memo } from 'react';
import type { RefObject } from 'react';
import {
  Search,
  Scissors,
  GitFork,
  History,
  Copy,
  Check,
  Wand2,
  Pencil,
  Maximize2,
  Minimize2,
  X,
  Trash2,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  AgentPreset,
  ChatMessage,
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ChatSessionKind,
} from '../../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';
import { ChatHistory } from './ChatHistory.tsx';
import { NewChatButton } from './NewChatButton.tsx';
import { NewChatDialog, type NewChatConfirmPayload } from './NewChatDialog.tsx';
import { ChatMessageMarkdown } from './ChatMessageMarkdown.tsx';
import { ChatComposerCard } from './ChatComposerCard.tsx';
import { SuggestedActionsCard } from './SuggestedActionsCard.tsx';
import { ToolCallDisplay } from './ToolCallDisplay.tsx';
import { parseClarificationQuestions, hasClarificationFence } from './clarificationUtils.ts';
import type { CardState } from './ChangeCard.tsx';
import { ChangeCardGroup } from './ChangeCardGroup.tsx';
import { buildChatRenderUnits } from './chatRenderUnits.ts';
import { WriteFileBatchComposerBar } from './WriteFileBatchComposerBar.tsx';
import {
  collectAllWriteFileItems,
  getTrailingWriteFileBatch,
  isSameWriteFileBatch,
} from './writeFileBatchUtils.ts';
import { parseSteeringPlan, type ParsedSteeringPlan } from './planFenceUtils.ts';
import { SteeringPlanViewer } from './SteeringPlanViewer.tsx';
import {
  buildConversationById,
  listThreadsForRoot,
  resolveThreadBranchRootId,
} from './chatHistoryUtils.ts';

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
  /** Start a new chat with system intro + parent transcript through this message index (inclusive). */
  onStartThreadFromMessage: (messageIndex: number) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessage: (index: number) => void;
  onNewChat: (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => void;
  onDiscardCurrentChat: (kindOrPayload?: ChatSessionKind | NewChatConfirmPayload) => void;
  /** Active conversation session kind (for guided UI). */
  activeSessionKind?: ChatSessionKind;
  /** When true, thread/fork-from-message actions are hidden (not supported inside a thread). */
  activeIsThread?: boolean;
  /** Persisted steering plan markdown (guided sessions). */
  steeringPlan?: string;
  /** Mark the current guided steering plan complete without sending a chat message. */
  onMarkSteeringPlanComplete?: () => void;
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
  /** Project agent templates for optional selection when starting a guided chat. */
  agentPresets?: AgentPreset[];
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

const EMPTY_SNAPSHOT_DISMISS = new Set<string>();
const EMPTY_COMPOSER_BATCH_FORCED: Record<string, CardState> = {};

interface ChatMessagesPaneProps {
  messages: ChatMessage[];
  readOnly: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onMouseUp?: () => void;
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  activeIsThread: boolean;
  editingIdx: number | null;
  setEditingIdx: (idx: number | null) => void;
  copiedIdx: number | null;
  setCopiedIdx: (idx: number | null) => void;
  bulkDismissIds: Set<string>;
  composerBatchForced: Record<string, CardState>;
  onFileChanged?: (path: string) => void;
  onSnapshotSettled?: (snapshotId: string) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessage: (index: number) => void;
  commitEdit: (index: number, text: string) => void;
  cancelEdit: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  onRetry?: () => void;
  onOpenPromptPack?: () => void;
}

function ChatMessagesPane({
  messages,
  readOnly,
  scrollRef,
  onMouseUp,
  streaming,
  error,
  toolActivity,
  activeIsThread,
  editingIdx,
  setEditingIdx,
  copiedIdx,
  setCopiedIdx,
  bulkDismissIds,
  composerBatchForced,
  onFileChanged,
  onSnapshotSettled,
  onForkFromMessage,
  onStartThreadFromMessage,
  onForkToNewConversation,
  onEditMessage,
  onDeleteMessage,
  commitEdit,
  cancelEdit,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  onRetry,
  onOpenPromptPack,
}: ChatMessagesPaneProps) {
  const visibleEntries = useMemo(
    () => messages.map((msg, originalIdx) => ({ msg, originalIdx })).filter(({ msg }) => !msg.hidden),
    [messages],
  );
  const renderUnits = useMemo(() => buildChatRenderUnits(visibleEntries), [visibleEntries]);
  const trailingWriteFileBatch = useMemo(
    () => getTrailingWriteFileBatch(visibleEntries),
    [visibleEntries],
  );

  const dismissIds = readOnly ? EMPTY_SNAPSHOT_DISMISS : bulkDismissIds;
  const batchForced = readOnly ? EMPTY_COMPOSER_BATCH_FORCED : composerBatchForced;
  const fileCb = readOnly ? undefined : onFileChanged;
  const snapshotCb = readOnly ? undefined : onSnapshotSettled;

  return (
    <div
      className={`chat-messages${readOnly ? ' chat-messages--readonly' : ''}`}
      ref={scrollRef}
      onMouseUp={readOnly ? undefined : onMouseUp}
    >
      {messages.filter((m) => !m.hidden).length === 0 && (
        <div className="chat-empty">
          <p>Start a conversation with your AI assistant.</p>
          <p className="chat-empty-hint">
            Drag files from the project tree into the input area to reference them,
            or use @filename syntax in your message.
            {onOpenPromptPack && !readOnly && (
              <>
                {' '}
                Für einen fertigen Export-Prompt nutze das Zauberstab-Symbol oben (Prompt-Paket).
              </>
            )}
          </p>
        </div>
      )}
      {renderUnits.map((unit) => {
        if (unit.type === 'writeFileGroup') {
          const isComposerBatch =
            !readOnly &&
            Boolean(
              trailingWriteFileBatch && isSameWriteFileBatch(unit.items, trailingWriteFileBatch),
            );
          const visibleWriteItems = unit.items.filter((i) => !dismissIds.has(i.data.snapshotId));
          if (visibleWriteItems.length === 0) return null;
          return (
            <ChangeCardGroup
              key={`wf-${unit.items.map((x) => x.originalIdx).join('-')}`}
              items={visibleWriteItems}
              onFileChanged={fileCb}
              externalForced={isComposerBatch ? batchForced : undefined}
              onSnapshotSettled={snapshotCb}
            />
          );
        }

        if (unit.type === 'toolCall') {
          const isStreamingTool = streaming && unit.resultMsg === undefined;
          return (
            <ToolCallDisplay
              key={`tool-${unit.assistantIdx}-${unit.toolCallIdx}`}
              toolCall={unit.toolCall}
              result={unit.resultMsg?.content}
              isStreaming={isStreamingTool}
              isLast={unit.toolCallIdx === unit.toolCallCount - 1}
              onStartThread={
                !readOnly && !activeIsThread && !streaming && unit.toolCallIdx === 0
                  ? () => onStartThreadFromMessage(unit.assistantIdx)
                  : undefined
              }
            />
          );
        }

        const { visIdx, msg, originalIdx } = unit;
        const visArr = visibleEntries;
        const prevUser = visIdx > 0 ? visArr[visIdx - 1]!.msg : null;
        const isLastUserMsg =
          msg.role === 'user' && !visArr.slice(visIdx + 1).some(({ msg: m }) => m.role === 'user');
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
              <span className="glossary-indicator-text">
                Glossar-Eintrag angelegt: <strong>{term}</strong>
              </span>
            </div>
          );
        }

        if (msg.role === 'tool' && msg.toolCallId) {
          const isAttachedToToolCall = renderUnits.some(
            (u) =>
              u.type === 'toolCall' &&
              (u as { resultMsg?: { toolCallId?: string } }).resultMsg?.toolCallId === msg.toolCallId,
          );
          if (isAttachedToToolCall) {
            return null;
          }
        }

        return (
          <div key={originalIdx}>
            <div
              className={`chat-message ${msg.role}`}
              style={
                msg.role === 'user' && msg.modeColor
                  ? {
                      backgroundColor: msg.modeColor,
                      borderLeftColor: msg.modeColor,
                      color: getContrastingTextColor(msg.modeColor),
                    }
                  : undefined
              }
            >
              <div
                className="chat-message-role"
                style={
                  msg.role === 'user' && msg.modeColor
                    ? { color: getContrastingTextColor(msg.modeColor) }
                    : undefined
                }
              >
                {msg.role === 'user' ? (
                  <span>
                    You
                    {msg.mode && (
                      <span
                        className="chat-message-mode"
                        style={{ color: getContrastingTextColor(msg.modeColor) }}
                      >
                        {' · '}
                        {msg.mode}
                      </span>
                    )}
                  </span>
                ) : msg.role === 'system' ? (
                  <span>Thread · Kontext</span>
                ) : (
                  'Assistant'
                )}
              </div>
              <div
                className={
                  msg.role === 'assistant'
                    ? 'chat-message-content chat-message-md'
                    : msg.role === 'system'
                      ? 'chat-message-content chat-message-system-md chat-message-md'
                      : 'chat-message-content'
                }
              >
                {msg.role === 'assistant' ? (
                  <ChatMessageMarkdown
                    content={msg.content}
                    streamingCursor={!readOnly && streaming && originalIdx === messages.length - 1}
                    selectionContext={msg.selectionContext}
                    onReplace={
                      !readOnly && msg.selectionContext && onReplaceSelection
                        ? (text) => onReplaceSelection(text, msg.selectionContext!)
                        : undefined
                    }
                    onApplyFieldUpdate={readOnly ? undefined : onApplyFieldUpdate}
                    fieldLabels={fieldLabels}
                    suppressClarificationWidget={hasClarificationFence(msg.content)}
                  />
                ) : msg.role === 'system' ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                ) : readOnly || editingIdx !== originalIdx ? (
                  msg.content
                ) : (
                  <MessageEditBox
                    initialContent={msg.content}
                    onSave={(text) => commitEdit(originalIdx, text)}
                    onCancel={cancelEdit}
                  />
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
              {!readOnly && !streaming && editingIdx !== originalIdx && (
                <div className="chat-fork-actions">
                  {!activeIsThread && (
                    <button
                      type="button"
                      className="chat-fork-btn"
                      onClick={() => onStartThreadFromMessage(originalIdx)}
                      title="Thread starten (neuer Chat mit bisherigem Verlauf)"
                    >
                      <MessageSquare size={12} />
                    </button>
                  )}
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
                    <button
                      type="button"
                      className="chat-fork-btn"
                      onClick={() => onForkFromMessage(originalIdx)}
                      title="Hier abschneiden (in-place)"
                    >
                      <Scissors size={12} />
                    </button>
                  )}
                  {visIdx > 0 && !activeIsThread && (
                    <button
                      type="button"
                      className="chat-fork-btn"
                      onClick={() => onForkToNewConversation(originalIdx)}
                      title="Als neuen Chat forken"
                    >
                      <GitFork size={12} />
                    </button>
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
      {!readOnly && toolActivity && streaming && (
        <div className="chat-tool-activity">
          <Search size={14} className="chat-tool-activity-icon" />
          <span>{toolActivity}</span>
        </div>
      )}
      {!readOnly && error && (
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
            <button type="button" className="chat-retry-btn" onClick={onRetry}>
              Erneut versuchen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GuidedSteeringPlanSection({
  open,
  onToggleOpen,
  steeringPlan,
  parsedSteeringPlan,
  streaming,
  onMarkSteeringPlanComplete,
}: {
  open: boolean;
  onToggleOpen: () => void;
  steeringPlan: string;
  parsedSteeringPlan: ParsedSteeringPlan;
  streaming: boolean;
  onMarkSteeringPlanComplete?: () => void;
}) {
  const hasPlan = Boolean(steeringPlan?.trim());
  const markDisabled =
    streaming ||
    !hasPlan ||
    parsedSteeringPlan.isComplete ||
    !onMarkSteeringPlanComplete;

  let markTitle: string | undefined;
  if (parsedSteeringPlan.isComplete) {
    markTitle = 'Plan ist bereits als abgeschlossen markiert';
  } else if (streaming) {
    markTitle = 'Während einer Antwort nicht möglich';
  } else if (!hasPlan) {
    markTitle = 'Zuerst einen Plan durch die Assistentin anlegen lassen';
  }

  return (
    <div className="chat-steering-plan-panel">
      <button
        type="button"
        className="chat-steering-plan-toggle"
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        Arbeitsplan
        <span className="chat-steering-plan-chevron">{open ? '▼' : '▶'}</span>
      </button>
      {open && (
        <div className="chat-steering-plan-body">
          {hasPlan ? (
            <>
              <SteeringPlanViewer parsedPlan={parsedSteeringPlan} />
              <div className="chat-steering-plan-actions">
                <button
                  type="button"
                  className="chat-steering-plan-mark-complete-btn"
                  disabled={markDisabled}
                  title={markTitle}
                  onClick={() => onMarkSteeringPlanComplete?.()}
                >
                  Plan als abgeschlossen markieren
                </button>
              </div>
            </>
          ) : (
            <p className="chat-steering-plan-empty">
              Noch kein Plan — die Assistentin legt ihn in der ersten inhaltlichen Antwort als Markdown-Block mit
              Sprache <code>plan</code> an.
            </p>
          )}
        </div>
      )}
    </div>
  );
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
  onStartThreadFromMessage,
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
  agentPresets = [],
  activeSessionKind = 'standard',
  steeringPlan = '',
  onMarkSteeringPlanComplete,
  activeIsThread = false,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const parentMessagesScrollRef = useRef<HTMLDivElement>(null);
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
  const [steeringPlanOpen, setSteeringPlanOpen] = useState(true);

  const parsedSteeringPlan = useMemo((): ParsedSteeringPlan => {
    return parseSteeringPlan(steeringPlan ?? null);
  }, [steeringPlan]);

  const visibleEntries = useMemo(
    () => messages.map((msg, originalIdx) => ({ msg, originalIdx })).filter(({ msg }) => !msg.hidden),
    [messages],
  );

  const trailingWriteFileBatch = useMemo(
    () => getTrailingWriteFileBatch(visibleEntries),
    [visibleEntries],
  );
  const composerBatchKey =
    trailingWriteFileBatch?.map((i) => i.data.snapshotId).join('\0') ?? '';
  const [composerBatchForced, setComposerBatchForced] = useState<Record<string, CardState>>({});
  const [toolbarSettledIds, setToolbarSettledIds] = useState(() => new Set<string>());
  const [bulkDismissIds, setBulkDismissIds] = useState(() => new Set<string>());

  const allWriteFileItems = useMemo(
    () => collectAllWriteFileItems(visibleEntries),
    [visibleEntries],
  );
  const pendingWriteFileItems = useMemo(
    () => allWriteFileItems.filter((i) => !toolbarSettledIds.has(i.data.snapshotId)),
    [allWriteFileItems, toolbarSettledIds],
  );

  useEffect(() => {
    setComposerBatchForced({});
  }, [composerBatchKey]);

  useEffect(() => {
    setToolbarSettledIds(new Set());
    setBulkDismissIds(new Set());
  }, [activeConversationId]);

  const mergeComposerBatchForced = useCallback((patch: Record<string, CardState>) => {
    setComposerBatchForced((p) => ({ ...p, ...patch }));
  }, []);

  const handleSnapshotSettled = useCallback((snapshotId: string) => {
    setToolbarSettledIds((prev) => new Set(prev).add(snapshotId));
  }, []);

  const handleWriteFileBulkComplete = useCallback(
    (patch: Record<string, CardState>) => {
      mergeComposerBatchForced(patch);
      const ids = Object.keys(patch);
      if (ids.length === 0) return;
      setToolbarSettledIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.add(id));
        return n;
      });
      setBulkDismissIds((prev) => {
        const n = new Set(prev);
        ids.forEach((id) => n.add(id));
        return n;
      });
    },
    [mergeComposerBatchForced],
  );

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

  const threadRail = useMemo(() => {
    const byId = buildConversationById(conversations);
    const activeConv = byId.get(activeConversationId);
    const rootId = resolveThreadBranchRootId(activeConv);
    if (!rootId) {
      return { showRail: false, rootConv: null as Conversation | null, threads: [] as Conversation[] };
    }
    const rootConv = byId.get(rootId) ?? null;
    if (!rootConv || rootConv.isThread) {
      return { showRail: false, rootConv, threads: [] as Conversation[] };
    }
    const threads = listThreadsForRoot(conversations, rootId);
    return {
      showRail: threads.length >= 1,
      rootConv,
      threads,
    };
  }, [conversations, activeConversationId]);

  const showThreadSplit = Boolean(isFullscreen && activeIsThread && threadRail.rootConv);
  const splitRoot = showThreadSplit && threadRail.rootConv ? threadRail.rootConv : null;
  const threadsRailRoot = threadRail.showRail && threadRail.rootConv ? threadRail.rootConv : null;

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
      onNewChat('standard');
    }
  };

  const handleNewChatConfirm = (payload: NewChatConfirmPayload) => {
    setNewChatDialogOpen(false);
    if (payload.title.trim() && payload.title.trim() !== activeTitle) {
      onRenameChat(activeConversationId, payload.title.trim());
    }
    onNewChat(payload);
  };

  const handleNewChatDiscard = (payload: NewChatConfirmPayload) => {
    setNewChatDialogOpen(false);
    onDiscardCurrentChat(payload);
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

  useLayoutEffect(() => {
    if (!showThreadSplit) return;
    const el = parentMessagesScrollRef.current;
    if (!el) return;
    const scrollToEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToEnd);
    });
  }, [showThreadSplit, threadRail.rootConv?.id, threadRail.rootConv?.messages.length]);

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
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.chat-expand-overlay')) return;
      if (document.querySelector('.new-chat-dialog-overlay')) return;
      if (document.querySelector('.glossary-save-overlay')) return;
      setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const toggleChatFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  const interactiveMessagesEl = (
    <ChatMessagesPane
      messages={messages}
      readOnly={false}
      scrollRef={messagesScrollRef}
      onMouseUp={handleMessagesMouseUp}
      streaming={streaming}
      error={error}
      toolActivity={toolActivity}
      activeIsThread={activeIsThread}
      editingIdx={editingIdx}
      setEditingIdx={setEditingIdx}
      copiedIdx={copiedIdx}
      setCopiedIdx={setCopiedIdx}
      bulkDismissIds={bulkDismissIds}
      composerBatchForced={composerBatchForced}
      onFileChanged={onFileChanged}
      onSnapshotSettled={handleSnapshotSettled}
      onForkFromMessage={onForkFromMessage}
      onStartThreadFromMessage={onStartThreadFromMessage}
      onForkToNewConversation={onForkToNewConversation}
      onEditMessage={onEditMessage}
      onDeleteMessage={onDeleteMessage}
      commitEdit={commitEdit}
      cancelEdit={cancelEdit}
      onReplaceSelection={onReplaceSelection}
      onApplyFieldUpdate={onApplyFieldUpdate}
      fieldLabels={fieldLabels}
      onRetry={onRetry}
      onOpenPromptPack={onOpenPromptPack}
    />
  );

  const parentReadonlyMessagesEl =
    splitRoot ? (
      <ChatMessagesPane
        messages={splitRoot.messages}
        readOnly
        scrollRef={parentMessagesScrollRef}
        streaming={false}
        error={null}
        toolActivity={null}
        activeIsThread={false}
        editingIdx={null}
        setEditingIdx={() => {}}
        copiedIdx={null}
        setCopiedIdx={() => {}}
        bulkDismissIds={EMPTY_SNAPSHOT_DISMISS}
        composerBatchForced={EMPTY_COMPOSER_BATCH_FORCED}
        onForkFromMessage={() => {}}
        onStartThreadFromMessage={() => {}}
        onForkToNewConversation={() => {}}
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        commitEdit={() => {}}
        cancelEdit={() => {}}
        fieldLabels={fieldLabels}
      />
    ) : null;

  return (
    <div
      ref={panelRef}
      className={`chat-panel${isFullscreen ? ' chat-panel--expanded' : ''}${showThreadSplit ? ' chat-panel--thread-split' : ''}`}
    >
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
            title={isFullscreen ? 'Vergrößerte Ansicht schließen (Esc)' : 'Chat vergrößern'}
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
          onCreate={(sk) => onNewChat(sk ?? 'standard')}
          onDelete={onDeleteChat}
          onRename={onRenameChat}
          onToggleSavedToProject={onToggleSavedToProject}
          onClearAllBrowserChats={onClearAllBrowserChats}
          clearAllBrowserDisabled={clearAllBrowserChatsDisabled}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className={`chat-panel-body${showThreadSplit ? ' chat-panel-body--thread-split' : ''}`}>
        {splitRoot ? (
          <>
            <div className="chat-thread-split-left">
              <div className="chat-thread-split-pane-header">
                <span className="chat-thread-split-pane-label">Haupt-Chat</span>
                <span className="chat-thread-split-pane-title" title={splitRoot.title}>
                  {splitRoot.title}
                </span>
              </div>
              <div className="chat-thread-split-left-scroll">{parentReadonlyMessagesEl}</div>
            </div>
            <div className="chat-thread-split-right">
              <div className="chat-thread-split-switcher" role="tablist" aria-label="Thread wechseln">
                <button
                  type="button"
                  role="tab"
                  className={`chat-thread-split-switcher-btn${splitRoot.id === activeConversationId ? ' active' : ''}`}
                  onClick={() => onSwitchChat(splitRoot.id)}
                  title={splitRoot.title}
                >
                  Haupt-Chat
                </button>
                {threadRail.threads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    className={`chat-thread-split-switcher-btn${t.id === activeConversationId ? ' active' : ''}`}
                    onClick={() => onSwitchChat(t.id)}
                    title={t.title}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
              <div className="chat-panel-body-main">
                {interactiveMessagesEl}
                {activeSessionKind === 'guided' && (
                  <GuidedSteeringPlanSection
                    open={steeringPlanOpen}
                    onToggleOpen={() => setSteeringPlanOpen((o) => !o)}
                    steeringPlan={steeringPlan}
                    parsedSteeringPlan={parsedSteeringPlan}
                    streaming={streaming}
                    onMarkSteeringPlanComplete={onMarkSteeringPlanComplete}
                  />
                )}
                <div className="chat-composer-stack">
                  {pendingClarification && pendingClarification.length > 0 ? (
                    <ChatComposerCard>
                      <SuggestedActionsCard
                        questions={pendingClarification}
                        onSubmit={onSend}
                        disabled={streaming}
                      />
                    </ChatComposerCard>
                  ) : null}
                  {pendingWriteFileItems.length > 0 && !streaming ? (
                    <ChatComposerCard>
                      <WriteFileBatchComposerBar
                        items={pendingWriteFileItems}
                        onBulkComplete={handleWriteFileBulkComplete}
                        onFileChanged={onFileChanged}
                        disabled={streaming}
                      />
                    </ChatComposerCard>
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
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="chat-panel-body-main">
              {interactiveMessagesEl}
              {activeSessionKind === 'guided' && (
                <GuidedSteeringPlanSection
                  open={steeringPlanOpen}
                  onToggleOpen={() => setSteeringPlanOpen((o) => !o)}
                  steeringPlan={steeringPlan}
                  parsedSteeringPlan={parsedSteeringPlan}
                  streaming={streaming}
                  onMarkSteeringPlanComplete={onMarkSteeringPlanComplete}
                />
              )}
              <div className="chat-composer-stack">
                {pendingClarification && pendingClarification.length > 0 ? (
                  <ChatComposerCard>
                    <SuggestedActionsCard
                      questions={pendingClarification}
                      onSubmit={onSend}
                      disabled={streaming}
                    />
                  </ChatComposerCard>
                ) : null}
                {pendingWriteFileItems.length > 0 && !streaming ? (
                  <ChatComposerCard>
                    <WriteFileBatchComposerBar
                      items={pendingWriteFileItems}
                      onBulkComplete={handleWriteFileBulkComplete}
                      onFileChanged={onFileChanged}
                      disabled={streaming}
                    />
                  </ChatComposerCard>
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
              </div>
            </div>
            {threadsRailRoot && (
              <aside className="chat-threads-rail" aria-label="Threads">
                <div className="chat-threads-rail-header">Threads</div>
                <div className="chat-threads-rail-list">
                  <button
                    type="button"
                    className={`chat-threads-rail-item${threadsRailRoot.id === activeConversationId ? ' active' : ''}`}
                    onClick={() => onSwitchChat(threadsRailRoot.id)}
                    title={threadsRailRoot.title}
                  >
                    <span className="chat-threads-rail-item-meta">Haupt-Chat</span>
                    <span className="chat-threads-rail-item-title">{threadsRailRoot.title}</span>
                  </button>
                  {threadRail.threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`chat-threads-rail-item${t.id === activeConversationId ? ' active' : ''}`}
                      onClick={() => onSwitchChat(t.id)}
                      title={t.title}
                    >
                      <span className="chat-threads-rail-item-meta">Thread</span>
                      <span className="chat-threads-rail-item-title">{t.title}</span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </>
        )}
      </div>

      {newChatDialogOpen && (
        <NewChatDialog
          currentTitle={activeTitle}
          agentPresets={agentPresets}
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

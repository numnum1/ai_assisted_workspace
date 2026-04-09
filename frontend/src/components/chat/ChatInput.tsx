import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { Send, Square, BookOpen, Zap, X, Maximize2, Wrench, Globe, FolderOpen, Sparkles } from 'lucide-react';
import { FileChip } from '../common/FileChip.tsx';
import { wikiApi } from '../../api.ts';
import type { SelectionContext } from '../../types.ts';
import { CHAT_TOOLKIT_IDS } from '../../types.ts';

const EMPTY_DISABLED_TOOLKITS = new Set<string>();

const TOOLKIT_ROWS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'web', label: 'Web-Suche', icon: Globe },
  { id: 'wiki', label: 'Wiki', icon: BookOpen },
  { id: 'dateisystem', label: 'Dateisystem', icon: FolderOpen },
  { id: 'assistant', label: 'Assistent', icon: Sparkles },
];

function ToolkitMenuButton({
  disabledToolkits,
  onToggleToolkit,
  streaming,
}: {
  disabledToolkits: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  if (!onToggleToolkit) return null;

  const n = disabledToolkits.size;
  const total = CHAT_TOOLKIT_IDS.length;
  let wrenchClass = 'chat-tools-toggle-btn';
  if (n === total) wrenchClass += ' chat-tools-toggle-btn--off';
  else if (n > 0) wrenchClass += ' chat-tools-toggle-btn--partial';
  else wrenchClass += ' active';

  const title =
    n === 0
      ? 'Toolkits — alle aktiv (klicken für Einstellungen)'
      : n === total
        ? 'Toolkits — alle aus (klicken für Einstellungen)'
        : `Toolkits — ${total - n} von ${total} aktiv (klicken für Einstellungen)`;

  return (
    <div ref={wrapRef} className="chat-toolkit-wrap">
      <button
        type="button"
        className={wrenchClass}
        onClick={() => setOpen((o) => !o)}
        title={title}
        disabled={streaming}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Wrench size={15} />
      </button>
      {open && (
        <div
          className="chat-toolkit-popover"
          role="menu"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="chat-toolkit-popover-title">KI-Toolkits</div>
          {TOOLKIT_ROWS.map(({ id, label, icon: Icon }) => {
            const enabled = !disabledToolkits.has(id);
            return (
              <div key={id} className="chat-toolkit-row" role="none">
                <Icon size={14} aria-hidden />
                <span>{label}</span>
                <button
                  type="button"
                  className={`chat-toolkit-row-toggle${enabled ? ' chat-toolkit-row-toggle--on' : ''}`}
                  role="menuitem"
                  onClick={() => onToggleToolkit(id)}
                >
                  {enabled ? 'An' : 'Aus'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type AutocompleteItem = {
  type: 'wiki';
  title: string;
  path: string;
  breadcrumb: string;
};

function filterItems(items: AutocompleteItem[], query: string): AutocompleteItem[] {
  const limit = 20;
  if (!query) return items.slice(0, limit);
  const q = query.toLowerCase();
  return items.filter(item =>
    item.title.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
  ).slice(0, limit);
}

/** ~12 lines at 13px / 1.4 line-height + vertical padding; must match fullscreen .chat-textarea min-height */
const CHAT_TEXTAREA_FULLSCREEN_MIN_PX = Math.round(16 + 12 * 1.4 * 13);

function chatTextareaMaxHeightPx(fullscreen: boolean): number {
  if (!fullscreen) return 200;
  if (typeof window === 'undefined') return 480;
  return Math.min(Math.round(window.innerHeight * 0.5), 480);
}

const WIKI_PREFIX = 'wiki/';

function wikiDisplayTitle(relativePath: string): string {
  const parts = relativePath.split('/');
  const filename = parts[parts.length - 1] ?? relativePath;
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

function wikiBreadcrumb(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts.length > 1 ? parts[parts.length - 2]! : 'wiki';
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  /** When true, file chips are not shown (e.g. Prompt-Paket panel already lists them). */
  hideFileChips?: boolean;
  placeholder?: string;
  /** Active subproject root path — clears @-mention cache when it changes */
  structureRoot?: string | null;
  /** Whether the reasoning model should be used for this message */
  useReasoning?: boolean;
  onToggleReasoning?: () => void;
  /** Toolkit ids whose tools are omitted for requests (see CHAT_TOOLKIT_IDS). */
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  /** False when the currently selected LLM has no reasoning configuration */
  reasoningAvailable?: boolean;
  /** False when the currently selected LLM has no fast configuration (reasoning-only) */
  fastAvailable?: boolean;
  /** Active editor selection captured via Ctrl+L */
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  /** Ref that, when set, allows App to focus the textarea (e.g. on Ctrl+L) */
  focusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  /** Wider, taller input area (e.g. chat fullscreen) */
  fullscreen?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  streaming,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  hideFileChips = false,
  placeholder: placeholderProp,
  structureRoot = null,
  useReasoning = false,
  onToggleReasoning,
  disabledToolkits = EMPTY_DISABLED_TOOLKITS,
  onToggleToolkit,
  reasoningAvailable = true,
  fastAvailable = true,
  activeSelection = null,
  onDismissSelection,
  focusTriggerRef,
  fullscreen = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [expandOpen, setExpandOpen] = useState(false);
  const [ac, setAc] = useState<{
    query: string;
    atIndex: number;
    items: AutocompleteItem[];
    selectedIdx: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemsCacheRef = useRef<AutocompleteItem[] | null>(null);
  const loadingRef = useRef(false);

  // Register focus trigger so App can focus the textarea on Ctrl+L
  useEffect(() => {
    if (!focusTriggerRef) return;
    focusTriggerRef.current = () => textareaRef.current?.focus();
    return () => { if (focusTriggerRef) focusTriggerRef.current = null; };
  }, [focusTriggerRef]);

  const syncTextareaHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const minH = fullscreen ? CHAT_TEXTAREA_FULLSCREEN_MIN_PX : 38;
    const maxH = chatTextareaMaxHeightPx(fullscreen);
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, minH), maxH)}px`;
  }, [fullscreen]);

  useEffect(() => {
    syncTextareaHeight();
  }, [fullscreen, syncTextareaHeight]);

  useEffect(() => {
    if (text !== '') return;
    syncTextareaHeight();
  }, [text, syncTextareaHeight]);

  // Close on outside click
  useEffect(() => {
    if (!ac) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current !== e.target
      ) {
        setAc(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [!!ac]);

  // Scroll selected item into view
  useEffect(() => {
    if (!ac || !dropdownRef.current) return;
    const els = dropdownRef.current.querySelectorAll<HTMLElement>('.ac-item');
    const filtered = filterItems(ac.items, ac.query);
    const idx = Math.min(ac.selectedIdx, filtered.length - 1);
    if (idx >= 0 && els[idx]) {
      els[idx].scrollIntoView({ block: 'nearest' });
    }
  }, [ac?.selectedIdx]);

  // Focus expand textarea when modal opens
  useEffect(() => {
    if (expandOpen) {
      requestAnimationFrame(() => expandTextareaRef.current?.focus());
    }
  }, [expandOpen]);

  // Close expand modal on Escape
  useEffect(() => {
    if (!expandOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [expandOpen]);

  // Invalidate cache when structure root changes (different subproject)
  useEffect(() => {
    itemsCacheRef.current = null;
    loadingRef.current = false;
  }, [structureRoot]);

  const loadItems = useCallback(async (): Promise<AutocompleteItem[]> => {
    if (itemsCacheRef.current) return itemsCacheRef.current;

    let relativePaths: string[] = [];
    try {
      relativePaths = await wikiApi.listFiles();
    } catch {
      relativePaths = [];
    }

    const items: AutocompleteItem[] = relativePaths.map((rel) => ({
      type: 'wiki',
      title: wikiDisplayTitle(rel),
      path: `${WIKI_PREFIX}${rel}`,
      breadcrumb: wikiBreadcrumb(rel),
    }));

    itemsCacheRef.current = items;
    return items;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    let finalMessage = trimmed;
    if (activeSelection) {
      finalMessage = `[REFERENCED SELECTION]\n${activeSelection.text}\n[END SELECTION]\n\n${trimmed}`;
    }
    onSend(finalMessage);
    setText('');
    setAc(null);
    setExpandOpen(false);
  }, [text, streaming, onSend, activeSelection]);

  const selectItem = useCallback(
    (item: AutocompleteItem) => {
      if (!ac) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const queryEnd = ac.atIndex + 1 + ac.query.length;
      const newText = text.slice(0, ac.atIndex) + '@' + item.path + ' ' + text.slice(queryEnd);
      setText(newText);
      setAc(null);

      const newCursor = ac.atIndex + 1 + item.path.length + 1;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
        syncTextareaHeight();
      });
    },
    [ac, text, syncTextareaHeight]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursor = e.target.selectionStart ?? newText.length;
    setText(newText);

    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    const minH = fullscreen ? CHAT_TEXTAREA_FULLSCREEN_MIN_PX : 38;
    const maxH = chatTextareaMaxHeightPx(fullscreen);
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, minH), maxH)}px`;

    // Detect @ pattern — stop at whitespace; ignore already-inserted paths (contain / or start with .)
    const textBefore = newText.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);

    if (atMatch) {
      const query = atMatch[1];
      if (query.includes('/') || query.startsWith('.')) {
        setAc(null);
        return;
      }
      const atIndex = cursor - atMatch[0].length;

      const cached = itemsCacheRef.current;
      if (cached) {
        setAc({ query, atIndex, items: cached, selectedIdx: 0 });
      } else {
        setAc(prev =>
          prev
            ? { ...prev, query, atIndex, selectedIdx: 0 }
            : { query, atIndex, items: [], selectedIdx: 0 }
        );
        if (!loadingRef.current) {
          loadingRef.current = true;
          loadItems()
            .then(items => {
              loadingRef.current = false;
              setAc(prev => (prev ? { ...prev, items } : null));
            })
            .catch(() => {
              loadingRef.current = false;
            });
        }
      }
    } else {
      setAc(null);
    }
  };

  const handleExpandChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (ac) {
      const filtered = filterItems(ac.items, ac.query);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAc(prev =>
          prev ? { ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, filtered.length - 1) } : null
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAc(prev =>
          prev ? { ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, 0) } : null
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) {
        e.preventDefault();
        selectItem(filtered[Math.min(ac.selectedIdx, filtered.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAc(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath) onAddFile(filePath);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const filteredItems = ac ? filterItems(ac.items, ac.query) : [];

  return (
    <div className="chat-input-container" onDrop={handleDrop} onDragOver={handleDragOver}>
      {ac && filteredItems.length > 0 && (
        <div ref={dropdownRef} className="ac-dropdown">
          {filteredItems.map((item, idx) => (
            <div
              key={item.path}
              className={`ac-item${idx === ac.selectedIdx ? ' ac-item-active' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                selectItem(item);
              }}
              onMouseEnter={() =>
                setAc(prev => (prev ? { ...prev, selectedIdx: idx } : null))
              }
            >
              <span className="ac-item-icon">
                <BookOpen size={13} />
              </span>
              <span className="ac-item-title">{item.title}</span>
              {item.breadcrumb && (
                <span className="ac-item-breadcrumb">{item.breadcrumb}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {activeSelection && (
        <div className="chat-selection-chip">
          <span className="chat-selection-chip-text">
            &ldquo;{activeSelection.text.length > 80 ? activeSelection.text.slice(0, 80) + '…' : activeSelection.text}&rdquo;
          </span>
          <button
            type="button"
            className="chat-selection-chip-dismiss"
            onClick={onDismissSelection}
            title="Auswahl entfernen"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {!hideFileChips && referencedFiles.length > 0 && (
        <div className="chat-input-files">
          {referencedFiles.map(f => (
            <FileChip key={f} path={f} onRemove={onRemoveFile} />
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          placeholder={
            streaming
              ? 'AI antwortet… (du kannst bereits tippen)'
              : (placeholderProp ??
                'Nachricht...')
          }
          rows={fullscreen ? 12 : 1}
        />
        <button
          type="button"
          className="chat-expand-btn"
          onClick={() => setExpandOpen(true)}
          title="Prompt-Fenster öffnen (großes Eingabefeld)"
          disabled={streaming}
        >
          <Maximize2 size={14} />
        </button>
        {onToggleReasoning && reasoningAvailable && fastAvailable && (
          <button
            type="button"
            className={`chat-reasoning-btn${useReasoning ? ' active' : ''}`}
            onClick={onToggleReasoning}
            title={useReasoning ? 'Reasoning-Modell aktiv — klicken zum Deaktivieren' : 'Reasoning-Modell aktivieren'}
            disabled={streaming}
          >
            <Zap size={15} />
          </button>
        )}
        <ToolkitMenuButton
          disabledToolkits={disabledToolkits}
          onToggleToolkit={onToggleToolkit}
          streaming={streaming}
        />
        {streaming ? (
          <button className="chat-send-btn stop" onClick={onStop} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!text.trim()}
            title="Send (Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {expandOpen && createPortal(
        <div className="chat-expand-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setExpandOpen(false); }}>
          <div className="chat-expand-modal">
            <div className="chat-expand-modal-header">
              <span className="chat-expand-modal-title">Prompt bearbeiten</span>
              <button
                type="button"
                className="chat-expand-modal-close"
                onClick={() => setExpandOpen(false)}
                title="Schließen (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {activeSelection && (
              <div className="chat-selection-chip chat-expand-selection-chip">
                <span className="chat-selection-chip-text">
                  &ldquo;{activeSelection.text.length > 120 ? activeSelection.text.slice(0, 120) + '…' : activeSelection.text}&rdquo;
                </span>
                <button
                  type="button"
                  className="chat-selection-chip-dismiss"
                  onClick={onDismissSelection}
                  title="Auswahl entfernen"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {!hideFileChips && referencedFiles.length > 0 && (
              <div className="chat-input-files chat-expand-files">
                {referencedFiles.map(f => (
                  <FileChip key={f} path={f} onRemove={onRemoveFile} />
                ))}
              </div>
            )}

            <textarea
              ref={expandTextareaRef}
              className="chat-expand-textarea"
              value={text}
              onChange={handleExpandChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholderProp ?? 'Nachricht...'}
            />

            <div className="chat-expand-modal-footer">
              <span className="chat-expand-hint">Strg+Enter zum Senden · Esc zum Schließen</span>
              <div className="chat-expand-footer-actions">
                {onToggleReasoning && reasoningAvailable && fastAvailable && (
                  <button
                    type="button"
                    className={`chat-reasoning-btn${useReasoning ? ' active' : ''}`}
                    onClick={onToggleReasoning}
                    title={useReasoning ? 'Reasoning-Modell aktiv — klicken zum Deaktivieren' : 'Reasoning-Modell aktivieren'}
                  >
                    <Zap size={15} />
                  </button>
                )}
                <ToolkitMenuButton
                  disabledToolkits={disabledToolkits}
                  onToggleToolkit={onToggleToolkit}
                  streaming={streaming}
                />
                <button
                  type="button"
                  className="chat-send-btn"
                  onClick={handleSend}
                  disabled={!text.trim()}
                  title="Senden (Strg+Enter)"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

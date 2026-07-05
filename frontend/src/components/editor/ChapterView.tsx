import { useEffect, useRef, useState, useCallback } from 'react';
import { Save, Moon, Sun, Palette, MoveHorizontal, MoveVertical, X, ChevronDown, ChevronRight, History, MessageSquareText, Sparkles, Loader2 } from 'lucide-react';
import { ActionEditor } from './ActionEditor';
import type { MarkdownEditorHandle } from './UnifiedMarkdownEditor';
import { ChapterHistoryModal } from '../git/ChapterHistoryModal.tsx';
import { CommentSidebar, type PositionedComment } from './CommentSidebar.tsx';
import { DEFAULT_COMMENT_CATEGORIES } from './commentCategories.ts';
import type { ChapterNode, ScrollTarget, SelectionContext, AltVersionSession, ChapterComment, CommentCategory, CommentCategoryDef } from '../../types.ts';
import type { ActionEditorColors } from './ActionEditor';
import { chapterApi, projectConfigApi } from '../../api.ts';
import { useReadingPaddingMax, READING_PADDING_SLIDER_STEP } from '../../hooks/useReadingPaddingMax.ts';

const FONT_SIZE_KEY = 'reading-font-size';
const PADDING_KEY = 'reading-padding';
const LINE_HEIGHT_KEY = 'reading-line-height';
const NIGHT_MODE_KEY = 'reading-night-mode';
const NIGHT_VARIANT_KEY = 'reading-night-variant';
const COLLAPSED_SCENES_KEY = 'chapter-collapsed-scenes';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 64;
const DEFAULT_LINE_HEIGHT = 1.5;
const LINE_HEIGHT_MIN = 1.1;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_STEP = 0.1;
const COMMENT_SIDEBAR_WIDTH_KEY = 'comment-sidebar-width';
const DEFAULT_COMMENT_SIDEBAR_WIDTH = 280;
const COMMENT_SIDEBAR_MIN_WIDTH = 180;
const COMMENT_SIDEBAR_MAX_WIDTH = 560;

/** Minimum vertical span reserved per unmatched comment card. */
const UNMATCHED_CARD_STEP = 72;

/** Normalize text for fuzzy quote matching (case/whitespace-insensitive). */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find the rendered CodeMirror line (`.cm-line`) inside an action's DOM block
 * whose text contains the start of the quote, for a finer-grained anchor than
 * the action block itself. CodeMirror only renders lines near the viewport
 * (layout="auto" still virtualizes against the page's scroll ancestor), so a
 * quote referring to an off-screen paragraph won't have a `.cm-line` yet —
 * callers should fall back to the action block's own position in that case.
 */
/** True if `needle` occurs exactly once in `haystack` (so a replace is unambiguous). */
function occursExactlyOnce(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const first = haystack.indexOf(needle);
  if (first === -1) return false;
  return haystack.indexOf(needle, first + needle.length) === -1;
}

function findMatchingLine(actionEl: HTMLElement, normalizedQuote: string): HTMLElement | null {
  const needle = normalizedQuote.slice(0, 40);
  if (!needle) return null;
  const lines = actionEl.querySelectorAll<HTMLElement>('.cm-line');
  for (const line of lines) {
    if (normalizeForMatch(line.textContent ?? '').includes(needle)) {
      return line;
    }
  }
  return null;
}

const DAY_COLORS: ActionEditorColors = {
  bg:             '#f5f0e8',
  text:           '#2c2a25',
  caretColor:     '#555555',
  selectionColor: '#c8d8ec',
};

const NIGHT_COLORS: ActionEditorColors = {
  bg:             '#1a0f07',
  text:           '#dfc99c',
  caretColor:     '#c8a870',
  selectionColor: 'rgba(200,155,70,0.35)',
};

/** Alternative night palette: cool slate/blue instead of the warm amber default. */
const NIGHT_COLORS_ALT: ActionEditorColors = {
  bg:             '#0d1117',
  text:           '#c9d1d9',
  caretColor:     '#58a6ff',
  selectionColor: 'rgba(56,139,253,0.35)',
};

const NIGHT_PALETTES = [NIGHT_COLORS, NIGHT_COLORS_ALT];

interface ChapterViewProps {
  /** Reading view: one prose block per scene (e.g. Musik-Strophen). */
  proseLeafAtScene?: boolean;
  chapter: ChapterNode;
  /** Subproject/workspace root the chapter lives under (null = project root). Used to resolve git history paths. */
  structureRoot?: string | null;
  actionContents: Map<string, { content: string; dirty: boolean }>;
  scrollTarget: ScrollTarget | null;
  hasDirtyActions: boolean;
  onActionChange: (chapterId: string, sceneId: string, actionId: string, content: string) => void;
  onActionSave: (chapterId: string, sceneId: string, actionId: string) => void;
  onSaveAll: () => void;
  onClose: () => void;
  onScrollTargetConsumed: () => void;
  onEditorFocus?: (sceneId: string, actionId: string) => void;
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
  onAltVersion?: (session: AltVersionSession) => void;
}

function actionKey(chapterId: string, sceneId: string, actionId: string): string {
  return `${chapterId}/${sceneId}/${actionId}`;
}

export function ChapterView({
  proseLeafAtScene = false,
  chapter,
  structureRoot = null,
  actionContents,
  scrollTarget,
  hasDirtyActions,
  onActionChange,
  onActionSave,
  onSaveAll,
  onClose,
  onScrollTargetConsumed,
  onEditorFocus,
  onCtrlL,
  onAltVersion,
}: ChapterViewProps) {
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    return stored ? Number(stored) : DEFAULT_FONT_SIZE;
  });
  const [padding, setPadding] = useState<number>(() => {
    const stored = localStorage.getItem(PADDING_KEY);
    return stored ? Number(stored) : DEFAULT_PADDING;
  });
  const [lineHeight, setLineHeight] = useState<number>(() => {
    const stored = localStorage.getItem(LINE_HEIGHT_KEY);
    return stored ? Number(stored) : DEFAULT_LINE_HEIGHT;
  });
  const [nightMode, setNightMode] = useState<boolean>(() =>
    localStorage.getItem(NIGHT_MODE_KEY) === 'true'
  );
  const [nightVariant, setNightVariant] = useState<number>(() => {
    const stored = Number(localStorage.getItem(NIGHT_VARIANT_KEY));
    return NIGHT_PALETTES[stored] ? stored : 0;
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chapterDiff, setChapterDiff] = useState<{ label: string; contents: Map<string, string> } | null>(null);

  // --- AI chapter comments ---
  const [comments, setComments] = useState<ChapterComment[]>([]);
  const [positioned, setPositioned] = useState<PositionedComment[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [commentSidebarWidth, setCommentSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(COMMENT_SIDEBAR_WIDTH_KEY));
    return stored >= COMMENT_SIDEBAR_MIN_WIDTH && stored <= COMMENT_SIDEBAR_MAX_WIDTH
      ? stored
      : DEFAULT_COMMENT_SIDEBAR_WIDTH;
  });
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const [categoryDefs, setCategoryDefs] = useState<CommentCategoryDef[]>(DEFAULT_COMMENT_CATEGORIES);
  const [activeCategories, setActiveCategories] = useState<Set<CommentCategory>>(
    () => new Set(DEFAULT_COMMENT_CATEGORIES.map(c => c.id)),
  );
  const [commentFreeText, setCommentFreeText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const contentColRef = useRef<HTMLDivElement>(null);
  const commentSidebarRef = useRef<HTMLDivElement>(null);
  // Imperative handles into each action's editor, keyed by action id — used to
  // apply an accepted suggestion directly to the live CodeMirror document.
  const actionHandles = useRef<Map<string, MarkdownEditorHandle>>(new Map());
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`${COLLAPSED_SCENES_KEY}-${chapter.id}`);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed);
      }
    } catch {
      /* ignore */
    }
    return new Set();
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  const paddingSliderMax = useReadingPaddingMax(scrollContainerRef);

  const colors = nightMode ? NIGHT_PALETTES[nightVariant] : DAY_COLORS;

  const toggleSceneCollapsed = useCallback((sceneId: string) => {
    setCollapsedScenes(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(`${COLLAPSED_SCENES_KEY}-${chapter.id}`, JSON.stringify([...collapsedScenes]));
  }, [chapter.id, collapsedScenes]);

  useEffect(() => {
    setChapterDiff(null);
  }, [chapter.id]);

  // Load the project's configured comment categories once (not per-chapter —
  // they live in project settings, see ProjectSettingsModal's
  // "Kommentar-Kategorien" tab). Falls back to the built-in defaults on error.
  useEffect(() => {
    let cancelled = false;
    projectConfigApi
      .getCommentCategories()
      .then(defs => {
        if (cancelled || defs.length === 0) return;
        setCategoryDefs(defs);
        setActiveCategories(new Set(defs.map(c => c.id)));
      })
      .catch(() => {
        /* keep built-in defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load persisted comments when the chapter changes.
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setCommentsError(null);
    chapterApi
      .getComments(chapter.id, structureRoot ?? undefined)
      .then(list => {
        if (cancelled) return;
        setComments(list);
        setSidebarVisible(list.length > 0);
      })
      .catch(() => {
        /* no comments yet is fine */
      });
    return () => {
      cancelled = true;
    };
  }, [chapter.id, structureRoot]);

  // Assemble the full chapter text (scene headings + action content) for the LLM.
  const buildChapterText = useCallback(() => {
    const parts: string[] = [];
    for (const scene of chapter.scenes) {
      parts.push(`## ${scene.meta.title || scene.id}`);
      for (const action of scene.actions) {
        const entry = actionContents.get(actionKey(chapter.id, scene.id, action.id));
        if (entry?.content?.trim()) parts.push(entry.content);
      }
    }
    return parts.join('\n\n');
  }, [chapter, actionContents]);

  const toggleCategory = useCallback((id: CommentCategory) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGenerateComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const activeDefs = categoryDefs
        .filter(c => activeCategories.has(c.id))
        .map(c => ({ id: c.id, promptFragment: c.promptFragment }));
      const text = buildChapterText();
      const result = await chapterApi.generateComments(
        chapter.id,
        text,
        activeDefs,
        commentFreeText.trim(),
        null,
        structureRoot ?? undefined,
      );
      setComments(result);
      setSidebarVisible(true);
      setCommentPanelOpen(false);
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : String(e));
    } finally {
      setCommentsLoading(false);
    }
  }, [activeCategories, categoryDefs, commentFreeText, buildChapterText, chapter.id, structureRoot]);

  const handleDismissComment = useCallback(
    (id: string) => {
      setComments(prev => {
        const next = prev.filter(c => c.id !== id);
        void chapterApi
          .saveComments(chapter.id, next, structureRoot ?? undefined)
          .catch(() => {});
        return next;
      });
    },
    [chapter.id, structureRoot],
  );

  // Apply a comment's suggestion: replace the quoted text in its action's live
  // editor, then mark the comment accepted (it stays visible, struck through).
  const handleAcceptSuggestion = useCallback(
    (id: string) => {
      const comment = comments.find(c => c.id === id);
      if (!comment?.suggestion) return;

      // Locate the action containing the quote and apply via its editor handle,
      // so the change flows through onChange (dirty state) and undo history.
      let applied = false;
      for (const scene of chapter.scenes) {
        for (const action of scene.actions) {
          const entry = actionContents.get(actionKey(chapter.id, scene.id, action.id));
          if (!entry || !occursExactlyOnce(entry.content, comment.quote)) continue;
          const handle = actionHandles.current.get(action.id);
          if (handle?.replaceExact(comment.quote, comment.suggestion)) {
            onActionSave(chapter.id, scene.id, action.id);
            applied = true;
          }
          break;
        }
        if (applied) break;
      }
      if (!applied) {
        setCommentsError('Textstelle konnte nicht eindeutig ersetzt werden.');
        return;
      }

      setComments(prev => {
        const next = prev.map(c => (c.id === id ? { ...c, accepted: true } : c));
        void chapterApi
          .saveComments(chapter.id, next, structureRoot ?? undefined)
          .catch(() => {});
        return next;
      });
    },
    [comments, chapter, actionContents, onActionSave, structureRoot],
  );

  // Compute the vertical offset for each comment card by locating the action
  // whose content contains the quote, then aligning to that action's DOM block.
  const computeCommentPositions = useCallback(() => {
    const layout = layoutRef.current;
    const contentCol = contentColRef.current;
    if (!layout || !contentCol) return;
    const layoutTop = layout.getBoundingClientRect().top;
    setContentHeight(contentCol.scrollHeight);

    let unmatchedCursor = 0;
    const result: PositionedComment[] = comments.map(comment => {
      // After acceptance the quote is gone (replaced by the suggestion), so
      // anchor accepted cards to the suggestion text that now lives in the doc.
      const anchorText =
        comment.accepted && comment.suggestion ? comment.suggestion : comment.quote;
      const q = normalizeForMatch(anchorText);
      if (q) {
        for (const scene of chapter.scenes) {
          for (const action of scene.actions) {
            const entry = actionContents.get(actionKey(chapter.id, scene.id, action.id));
            if (entry && normalizeForMatch(entry.content).includes(q)) {
              const el = nodeRefs.current.get(`action-${action.id}`);
              if (el) {
                const anchorEl = findMatchingLine(el, q) ?? el;
                const top = anchorEl.getBoundingClientRect().top - layoutTop;
                // A suggestion can be applied only if the exact quote occurs
                // once in this action (unambiguous replace target).
                const canApply =
                  !!comment.suggestion &&
                  occursExactlyOnce(entry.content, comment.quote);
                return { comment, top: Math.max(0, top), matched: true, canApply };
              }
            }
          }
        }
      }
      const top = unmatchedCursor;
      unmatchedCursor += UNMATCHED_CARD_STEP;
      return { comment, top, matched: false, canApply: false };
    });
    setPositioned(result);
  }, [comments, chapter, actionContents]);

  // Recompute positions on comment/geometry changes and when the editor resizes.
  useEffect(() => {
    if (comments.length === 0) {
      setPositioned([]);
      return;
    }
    let raf = requestAnimationFrame(computeCommentPositions);
    const contentCol = contentColRef.current;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeCommentPositions);
    });
    if (contentCol) observer.observe(contentCol);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [computeCommentPositions, comments.length, fontSize, padding, lineHeight, collapsedScenes]);

  const registerRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) {
      nodeRefs.current.set(key, el);
    } else {
      nodeRefs.current.delete(key);
    }
  }, []);

  // Persist settings
  useEffect(() => { localStorage.setItem(FONT_SIZE_KEY, String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem(PADDING_KEY, String(padding)); }, [padding]);
  useEffect(() => { localStorage.setItem(LINE_HEIGHT_KEY, String(lineHeight)); }, [lineHeight]);
  useEffect(() => { localStorage.setItem(NIGHT_MODE_KEY, String(nightMode)); }, [nightMode]);
  useEffect(() => { localStorage.setItem(NIGHT_VARIANT_KEY, String(nightVariant)); }, [nightVariant]);
  useEffect(() => { localStorage.setItem(COMMENT_SIDEBAR_WIDTH_KEY, String(commentSidebarWidth)); }, [commentSidebarWidth]);

  // Drag-resize the comment sidebar (mirrors the app-level resizable panels'
  // drag behaviour, scoped to this local flex layout).
  const handleSidebarResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = commentSidebarWidth;
    setResizingSidebar(true);
    const handleMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const next = Math.min(
        COMMENT_SIDEBAR_MAX_WIDTH,
        Math.max(COMMENT_SIDEBAR_MIN_WIDTH, startWidth + delta),
      );
      setCommentSidebarWidth(next);
    };
    const handleUp = () => {
      setResizingSidebar(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [commentSidebarWidth]);

  useEffect(() => {
    setPadding(p => (p > paddingSliderMax ? paddingSliderMax : p));
  }, [paddingSliderMax]);

  // Ctrl+S saves all dirty
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        onSaveAll();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSaveAll]);

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = delta > 0 ? Math.min(prev + 1, 30) : Math.max(prev - 1, 10);
      if (fontSizeTimerRef.current) clearTimeout(fontSizeTimerRef.current);
      setFontSizeIndicator(next);
      fontSizeTimerRef.current = setTimeout(() => setFontSizeIndicator(null), 1000);
      return next;
    });
  }, []);

  // Ctrl+Scroll for font size
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      adjustFontSize(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [adjustFontSize]);

  // Numpad +/- for font size
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'NumpadAdd') {
        e.preventDefault();
        adjustFontSize(1);
      } else if (e.code === 'NumpadSubtract') {
        e.preventDefault();
        adjustFontSize(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [adjustFontSize]);

  // Scroll to target when it changes
  useEffect(() => {
    if (!scrollTarget) return;
    const key = scrollTarget.actionId
      ? `action-${scrollTarget.actionId}`
      : scrollTarget.sceneId
        ? `scene-${scrollTarget.sceneId}`
        : null;
    if (!key) return;
    const el = nodeRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    onScrollTargetConsumed();
  }, [scrollTarget, onScrollTargetConsumed]);

  const nightAlt = nightMode && nightVariant === 1;
  const headerBg = nightAlt ? '#0a0e14' : nightMode ? '#120a04' : '#ebe5db';
  const borderColor = nightAlt ? 'rgba(201,209,217,0.2)' : nightMode ? 'rgba(223,201,156,0.2)' : 'rgba(44,42,37,0.18)';
  const mutedText = nightAlt ? '#7d8590' : nightMode ? '#9a7d50' : '#6b6560';

  return (
    <div
      className={`chapter-view${nightMode ? ' chapter-view-night' : ''}${nightAlt ? ' chapter-view-night-alt' : ''}`}
      style={{ backgroundColor: colors.bg, color: colors.text } as React.CSSProperties}
    >
      {/* Toolbar */}
      <div className="chapter-view-toolbar" style={{ backgroundColor: headerBg, borderBottomColor: borderColor }}>
        <span className="chapter-view-title-label" style={{ color: mutedText }}>
          {chapter.meta.title || chapter.id}
          {hasDirtyActions && <span className="editor-dirty"> *</span>}
        </span>
        <div className="chapter-view-toolbar-actions">
          <div className="reading-padding-control" title="Seitenabstand">
            <MoveHorizontal size={12} />
            <input
              type="range"
              className="reading-padding-slider"
              min={0}
              max={paddingSliderMax}
              step={READING_PADDING_SLIDER_STEP}
              value={padding}
              onChange={e => setPadding(Number(e.target.value))}
            />
          </div>
          <div className="reading-padding-control" title="Zeilenabstand">
            <MoveVertical size={12} />
            <input
              type="range"
              className="reading-padding-slider"
              min={LINE_HEIGHT_MIN}
              max={LINE_HEIGHT_MAX}
              step={LINE_HEIGHT_STEP}
              value={lineHeight}
              onChange={e => setLineHeight(Number(e.target.value))}
            />
          </div>
          <button
            className={`editor-mode-btn${nightMode ? ' active' : ''}`}
            onClick={() => setNightMode(prev => !prev)}
            title={nightMode ? 'Tagmodus' : 'Nachtmodus'}
          >
            {nightMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {nightMode && (
            <button
              className="editor-mode-btn"
              onClick={() => setNightVariant(prev => (prev + 1) % NIGHT_PALETTES.length)}
              title="Nachtmodus-Palette wechseln"
            >
              <Palette size={14} />
            </button>
          )}
          <button
            className="editor-save-btn"
            onClick={onSaveAll}
            disabled={!hasDirtyActions}
            title="Alles speichern (Ctrl+S)"
          >
            <Save size={14} />
          </button>
          <div className="comment-menu-anchor">
            <button
              className={`editor-mode-btn${commentPanelOpen ? ' active' : ''}`}
              onClick={() => setCommentPanelOpen(o => !o)}
              title="KI-Kommentare"
            >
              <Sparkles size={14} />
            </button>
            {commentPanelOpen && (
              <div className="comment-menu">
                <div className="comment-menu-title">KI-Kommentare</div>
                <div className="comment-menu-chips">
                  {categoryDefs.map(cat => {
                    const active = activeCategories.has(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`comment-chip${active ? ' active' : ''}`}
                        style={active ? { borderColor: cat.color, color: cat.color } : undefined}
                        onClick={() => toggleCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  className="comment-menu-freetext"
                  placeholder="Zusätzliche Anweisung (optional)…"
                  value={commentFreeText}
                  onChange={e => setCommentFreeText(e.target.value)}
                  rows={2}
                />
                {commentsError && (
                  <div className="comment-menu-error">{commentsError}</div>
                )}
                <div className="comment-menu-actions">
                  <button
                    type="button"
                    className="comment-menu-run"
                    onClick={handleGenerateComments}
                    disabled={
                      commentsLoading ||
                      (activeCategories.size === 0 && commentFreeText.trim().length === 0)
                    }
                  >
                    {commentsLoading ? (
                      <>
                        <Loader2 size={13} className="comment-spin" /> Analysiere…
                      </>
                    ) : (
                      <>
                        <MessageSquareText size={13} /> Kommentieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
          {comments.length > 0 && (
            <button
              className={`editor-mode-btn${sidebarVisible ? ' active' : ''}`}
              onClick={() => setSidebarVisible(v => !v)}
              title={sidebarVisible ? 'Kommentarspalte ausblenden' : 'Kommentarspalte einblenden'}
            >
              <MessageSquareText size={14} />
            </button>
          )}
          <button
            className="editor-mode-btn"
            onClick={() => setHistoryOpen(true)}
            title="Git-Verlauf des Kapitels"
          >
            <History size={14} />
          </button>
          <button
            className="editor-close-btn"
            onClick={onClose}
            title="Datei schließen"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {chapterDiff && (
        <div className="chapter-view-diff-banner">
          <span>Vergleich mit {chapterDiff.label}</span>
          <button type="button" className="chapter-view-diff-exit" onClick={() => setChapterDiff(null)}>
            Vergleich beenden
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="chapter-view-scroll" ref={scrollContainerRef}>
       <div className="chapter-view-layout" ref={layoutRef}>
        <div className="chapter-view-content-col" ref={contentColRef}>
        <div
          className="section-separator chapter-heading"
          style={{ paddingLeft: `${padding}px`, paddingRight: `${padding}px`, borderColor: mutedText }}
        >
          <span className="section-separator-line" style={{ borderColor: mutedText }} />
          <span className="section-separator-title" style={{ color: colors.text }}>
            {chapter.meta.title || chapter.id}
          </span>
          <span className="section-separator-line" style={{ borderColor: mutedText }} />
        </div>

        {chapter.scenes.map(scene => {
          const isCollapsed = collapsedScenes.has(scene.id);
          return (
            <div key={scene.id} className="scene-block">
              <div
                ref={el => registerRef(`scene-${scene.id}`, el)}
                className="section-separator scene-heading scene-heading-clickable"
                style={{ paddingLeft: `${padding}px`, paddingRight: `${padding}px`, borderColor: mutedText }}
                role="button"
                tabIndex={0}
                onClick={() => toggleSceneCollapsed(scene.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSceneCollapsed(scene.id); } }}
                title={
                  isCollapsed
                    ? proseLeafAtScene
                      ? 'Strophe einblenden'
                      : 'Szene einblenden'
                    : proseLeafAtScene
                      ? 'Strophe ausblenden'
                      : 'Szene ausblenden'
                }
              >
                <span className="scene-heading-chevron" style={{ color: mutedText }}>
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </span>
                <span className="section-separator-line" style={{ borderColor: mutedText }} />
                <span className="section-separator-title" style={{ color: colors.text }}>
                  {scene.meta.title || scene.id}
                </span>
                <span className="section-separator-line" style={{ borderColor: mutedText }} />
              </div>

              {!isCollapsed && scene.actions.map(action => {
                const key = actionKey(chapter.id, scene.id, action.id);
                const entry = actionContents.get(key);
                const content = entry?.content ?? '';
                return (
                  <div
                    key={action.id}
                    ref={el => registerRef(`action-${action.id}`, el)}
                    className="action-block"
                    onFocus={() => onEditorFocus?.(scene.id, action.id)}
                  >
                    <ActionEditor
                      ref={el => {
                        if (el) actionHandles.current.set(action.id, el);
                        else actionHandles.current.delete(action.id);
                      }}
                      actionId={`${chapter.id}-${scene.id}-${action.id}`}
                      content={content}
                      colors={colors}
                      fontSize={fontSize}
                      padding={padding}
                      lineHeight={lineHeight}
                      onChange={c => onActionChange(chapter.id, scene.id, action.id, c)}
                      onSave={() => onActionSave(chapter.id, scene.id, action.id)}
                      onCtrlL={onCtrlL}
                      onAltVersion={onAltVersion}
                      diffOriginal={chapterDiff?.contents.get(`${scene.id}/${action.id}`) ?? null}
                    />
                  </div>
                )
              })}
            </div>
          );
        })}
        <div className="chapter-view-scroll-end" aria-hidden="true" />
        </div>
        {sidebarVisible && (
          <>
            <div
              className={`comment-sidebar-resize-handle${resizingSidebar ? ' active' : ''}`}
              onPointerDown={handleSidebarResizeStart}
              title="Kommentarspalte-Breite ziehen"
            />
            <CommentSidebar
              comments={positioned}
              categories={categoryDefs}
              contentHeight={contentHeight}
              sidebarRef={commentSidebarRef}
              width={commentSidebarWidth}
              onDismiss={handleDismissComment}
              onAccept={handleAcceptSuggestion}
            />
          </>
        )}
       </div>
      </div>

      {fontSizeIndicator !== null && (
        <div className="reading-font-indicator">
          {fontSizeIndicator}px
        </div>
      )}

      {historyOpen && (
        <ChapterHistoryModal
          chapter={chapter}
          structureRoot={structureRoot}
          onClose={() => setHistoryOpen(false)}
          onOpenDiff={(contents, label) => setChapterDiff({ contents, label })}
        />
      )}
    </div>
  );
}

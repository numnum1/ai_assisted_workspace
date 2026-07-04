import { useEffect, useRef, useState, useCallback } from 'react';
import { Save, Moon, Sun, Palette, MoveHorizontal, MoveVertical, X, ChevronDown, ChevronRight, History } from 'lucide-react';
import { ActionEditor } from './ActionEditor';
import { ChapterHistoryModal } from '../git/ChapterHistoryModal.tsx';
import type { ChapterNode, ScrollTarget, SelectionContext, AltVersionSession } from '../../types.ts';
import type { ActionEditorColors } from './ActionEditor';
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

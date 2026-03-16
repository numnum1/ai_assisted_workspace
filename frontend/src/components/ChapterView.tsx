import { useEffect, useRef, useState, useCallback } from 'react';
import { Save, Moon, Sun, MoveHorizontal, X, ChevronDown, ChevronRight } from 'lucide-react';
import { ActionEditor } from './ActionEditor';
import type { ChapterNode, ScrollTarget } from '../types.ts';
import type { ActionEditorColors } from './ActionEditor';

const FONT_SIZE_KEY = 'reading-font-size';
const PADDING_KEY = 'reading-padding';
const NIGHT_MODE_KEY = 'reading-night-mode';
const COLLAPSED_SCENES_KEY = 'chapter-collapsed-scenes';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 64;

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

interface ChapterViewProps {
  chapter: ChapterNode;
  actionContents: Map<string, { content: string; dirty: boolean }>;
  scrollTarget: ScrollTarget | null;
  hasDirtyActions: boolean;
  onActionChange: (chapterId: string, sceneId: string, actionId: string, content: string) => void;
  onActionSave: (chapterId: string, sceneId: string, actionId: string) => void;
  onSaveAll: () => void;
  onClose: () => void;
  onScrollTargetConsumed: () => void;
}

function actionKey(chapterId: string, sceneId: string, actionId: string): string {
  return `${chapterId}/${sceneId}/${actionId}`;
}

export function ChapterView({
  chapter,
  actionContents,
  scrollTarget,
  hasDirtyActions,
  onActionChange,
  onActionSave,
  onSaveAll,
  onClose,
  onScrollTargetConsumed,
}: ChapterViewProps) {
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    return stored ? Number(stored) : DEFAULT_FONT_SIZE;
  });
  const [padding, setPadding] = useState<number>(() => {
    const stored = localStorage.getItem(PADDING_KEY);
    return stored ? Number(stored) : DEFAULT_PADDING;
  });
  const [nightMode, setNightMode] = useState<boolean>(() =>
    localStorage.getItem(NIGHT_MODE_KEY) === 'true'
  );
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

  const colors = nightMode ? NIGHT_COLORS : DAY_COLORS;

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
  useEffect(() => { localStorage.setItem(NIGHT_MODE_KEY, String(nightMode)); }, [nightMode]);

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

  // Ctrl+Scroll for font size
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setFontSize(prev => {
        const next = e.deltaY < 0 ? Math.min(prev + 1, 30) : Math.max(prev - 1, 10);
        if (fontSizeTimerRef.current) clearTimeout(fontSizeTimerRef.current);
        setFontSizeIndicator(next);
        fontSizeTimerRef.current = setTimeout(() => setFontSizeIndicator(null), 1000);
        return next;
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

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

  const headerBg = nightMode ? '#120a04' : '#ebe5db';
  const borderColor = nightMode ? 'rgba(223,201,156,0.2)' : 'rgba(44,42,37,0.18)';
  const mutedText = nightMode ? '#9a7d50' : '#6b6560';

  return (
    <div
      className={`chapter-view${nightMode ? ' chapter-view-night' : ''}`}
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
              max={200}
              step={4}
              value={padding}
              onChange={e => setPadding(Number(e.target.value))}
            />
          </div>
          <button
            className={`editor-mode-btn${nightMode ? ' active' : ''}`}
            onClick={() => setNightMode(prev => !prev)}
            title={nightMode ? 'Tagmodus' : 'Nachtmodus'}
          >
            {nightMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="editor-save-btn"
            onClick={onSaveAll}
            disabled={!hasDirtyActions}
            title="Alles speichern (Ctrl+S)"
          >
            <Save size={14} />
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
                title={isCollapsed ? 'Szene einblenden' : 'Szene ausblenden'}
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
                  >
                    <ActionEditor
                      actionId={`${chapter.id}-${scene.id}-${action.id}`}
                      content={content}
                      colors={colors}
                      fontSize={fontSize}
                      padding={padding}
                      onChange={c => onActionChange(chapter.id, scene.id, action.id, c)}
                      onSave={() => onActionSave(chapter.id, scene.id, action.id)}
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
    </div>
  );
}

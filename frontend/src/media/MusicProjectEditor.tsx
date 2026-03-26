import { useEffect, useRef, useState, useCallback } from 'react';
import { Save, Moon, Sun, MoveHorizontal, X, Music, Eye, EyeOff } from 'lucide-react';
import { ActionEditor } from '../components/ActionEditor.tsx';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';
import type { ActionEditorColors } from '../components/ActionEditor.tsx';

const FONT_SIZE_KEY = 'music-font-size';
const PADDING_KEY = 'music-padding';
const NIGHT_MODE_KEY = 'music-night-mode';
const HIDE_METATAGS_KEY = 'music-hide-metatags';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 48;

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

function actionKey(chapterId: string, sceneId: string, actionId: string): string {
  return `${chapterId}/${sceneId}/${actionId}`;
}

export function MusicProjectEditor({
  editorMode,
  chapter,
  actionContents,
  scrollTarget,
  hasDirtyActions,
  onActionChange,
  onActionSave,
  onSaveAll,
  onClose,
  onScrollTargetConsumed,
  onEditorFocus,
}: MediaProjectEditorProps) {
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
  const [hideMetatags, setHideMetatags] = useState<boolean>(() =>
    localStorage.getItem(HIDE_METATAGS_KEY) === 'true'
  );
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  const colors = nightMode ? NIGHT_COLORS : DAY_COLORS;

  const registerRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  useEffect(() => { localStorage.setItem(FONT_SIZE_KEY, String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem(PADDING_KEY, String(padding)); }, [padding]);
  useEffect(() => { localStorage.setItem(NIGHT_MODE_KEY, String(nightMode)); }, [nightMode]);
  useEffect(() => { localStorage.setItem(HIDE_METATAGS_KEY, String(hideMetatags)); }, [hideMetatags]);

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

  useEffect(() => {
    if (!scrollTarget) return;
    const key = scrollTarget.actionId
      ? `action-${scrollTarget.actionId}`
      : scrollTarget.sceneId
        ? `verse-${scrollTarget.sceneId}`
        : null;
    if (!key) return;
    const el = nodeRefs.current.get(key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onScrollTargetConsumed();
  }, [scrollTarget, onScrollTargetConsumed]);

  if (editorMode !== 'prose') {
    return (
      <div className="editor-mode-placeholder editor-empty">
        <p>Kein Editor für diesen Modus</p>
      </div>
    );
  }

  const toolbarBg = nightMode ? '#120a04' : '#ebe5db';
  const toolbarBorder = nightMode ? 'rgba(223,201,156,0.2)' : 'rgba(44,42,37,0.18)';
  const accentColor = nightMode ? '#c8a870' : '#2c2a25';
  const mutedColor = nightMode ? '#9a7d50' : '#6b6560';
  const metatagColor = nightMode ? '#c89846' : '#8b7355';

  return (
    <div
      className={`song-view${nightMode ? ' song-view-night' : ''}`}
      style={{ backgroundColor: colors.bg, color: colors.text } as React.CSSProperties}
    >
      {/* Toolbar */}
      <div
        className="song-view-toolbar"
        style={{ backgroundColor: toolbarBg, borderBottomColor: toolbarBorder }}
      >
        <span className="song-view-title-label" style={{ color: accentColor }}>
          <Music size={13} />
          {chapter.meta.title || chapter.id}
          {hasDirtyActions && <span className="editor-dirty"> *</span>}
        </span>
        <div className="chapter-view-toolbar-actions">
          <div className="reading-padding-control" title="Seitenabstand" style={{ color: mutedColor }}>
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
            className={`song-view-btn${hideMetatags ? ' active' : ''}`}
            onClick={() => setHideMetatags(prev => !prev)}
            title={hideMetatags ? 'Metatags anzeigen' : 'Metatags verstecken'}
            style={{ color: mutedColor, borderColor: toolbarBorder }}
          >
            {hideMetatags ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            className={`song-view-btn${nightMode ? ' active' : ''}`}
            onClick={() => setNightMode(prev => !prev)}
            title={nightMode ? 'Studio-Modus' : 'Tagmodus'}
            style={{ color: mutedColor, borderColor: toolbarBorder }}
          >
            {nightMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="song-view-btn"
            onClick={onSaveAll}
            disabled={!hasDirtyActions}
            title="Alles speichern (Ctrl+S)"
            style={{ color: mutedColor, borderColor: toolbarBorder }}
          >
            <Save size={14} />
          </button>
          <button
            className="song-view-btn song-view-close-btn"
            onClick={onClose}
            title="Datei schließen"
            style={{ color: mutedColor, borderColor: toolbarBorder }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable song content */}
      <div className="song-view-scroll" ref={scrollContainerRef}>
        {/* Song header */}
        <div
          className="song-view-song-header"
          style={{ paddingLeft: `${padding}px`, paddingRight: `${padding}px` }}
        >
          <div className="song-view-song-icon" style={{ color: accentColor }}>
            <Music size={32} />
          </div>
          <div className="song-view-song-title" style={{ color: colors.text }}>
            {chapter.meta.title || chapter.id}
          </div>
        </div>

        {/* Verses (Strophen) */}
        {chapter.scenes.map((scene, index) => {
          const metatags = scene.meta.extras?.metatags?.trim();

          return (
            <div
              key={scene.id}
              ref={el => registerRef(`verse-${scene.id}`, el)}
              className="song-verse-block"
            >
              {/* Metatags line — only shown if set and not hidden */}
              {metatags && !hideMetatags && (
                <div
                  className="song-verse-metatags"
                  style={{
                    paddingLeft: `${padding}px`,
                    paddingRight: `${padding}px`,
                    color: metatagColor,
                  }}
                >
                  [{metatags}]
                </div>
              )}

              {/* Action editors (lyric text) */}
              {scene.actions.map(action => {
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
                      onChange={c => onActionChange(chapter.id, scene.id, action.id, c)}
                      onSave={() => onActionSave(chapter.id, scene.id, action.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}

        <div className="song-view-scroll-end" aria-hidden="true" />
      </div>

      {fontSizeIndicator !== null && (
        <div className="reading-font-indicator">
          {fontSizeIndicator}px
        </div>
      )}
    </div>
  );
}

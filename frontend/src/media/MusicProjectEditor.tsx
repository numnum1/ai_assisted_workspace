import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Music } from 'lucide-react';
import { ActionEditor } from '../components/editor/ActionEditor.tsx';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';
import type { ActionEditorColors } from '../components/editor/ActionEditor.tsx';
import { useReadingPaddingMax } from '../hooks/useReadingPaddingMax.ts';
import { useTopBarContent } from '../components/app/TopBarContext.ts';
import { MusicProjectToolbar } from './MusicProjectToolbar.tsx';

const FONT_SIZE_KEY = 'music-font-size';
const PADDING_KEY = 'music-padding';
const LINE_HEIGHT_KEY = 'music-line-height';
const NIGHT_MODE_KEY = 'music-night-mode';
const NIGHT_VARIANT_KEY = 'music-night-variant';
const HIDE_METATAGS_KEY = 'music-hide-metatags';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 48;
const DEFAULT_LINE_HEIGHT = 1.5;

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
  onCtrlL,
}: MediaProjectEditorProps) {
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
  const [hideMetatags, setHideMetatags] = useState<boolean>(() =>
    localStorage.getItem(HIDE_METATAGS_KEY) === 'true'
  );
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());

  const paddingSliderMax = useReadingPaddingMax(scrollContainerRef, {
    enabled: editorMode === 'prose',
  });

  const colors = nightMode ? NIGHT_PALETTES[nightVariant] : DAY_COLORS;

  const registerRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(key, el);
    else nodeRefs.current.delete(key);
  }, []);

  useEffect(() => { localStorage.setItem(FONT_SIZE_KEY, String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem(PADDING_KEY, String(padding)); }, [padding]);
  useEffect(() => { localStorage.setItem(LINE_HEIGHT_KEY, String(lineHeight)); }, [lineHeight]);
  useEffect(() => { localStorage.setItem(NIGHT_MODE_KEY, String(nightMode)); }, [nightMode]);
  useEffect(() => { localStorage.setItem(NIGHT_VARIANT_KEY, String(nightVariant)); }, [nightVariant]);
  useEffect(() => { localStorage.setItem(HIDE_METATAGS_KEY, String(hideMetatags)); }, [hideMetatags]);

  // See ChapterView.tsx: don't clamp/overwrite the persisted preference here,
  // only the display value, so a temporarily narrow container doesn't
  // permanently shrink the stored setting.
  const effectivePadding = Math.min(padding, paddingSliderMax);

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

  const nightAlt = nightMode && nightVariant === 1;
  const toolbarBg = nightAlt ? '#0a0e14' : nightMode ? '#120a04' : '#ebe5db';
  const toolbarBorder = nightAlt ? 'rgba(201,209,217,0.2)' : nightMode ? 'rgba(223,201,156,0.2)' : 'rgba(44,42,37,0.18)';
  const accentColor = nightAlt ? '#58a6ff' : nightMode ? '#c8a870' : '#2c2a25';
  const mutedColor = nightAlt ? '#7d8590' : nightMode ? '#9a7d50' : '#6b6560';
  const metatagColor = nightAlt ? '#58a6ff' : nightMode ? '#c89846' : '#8b7355';
  const title = chapter.meta.title || chapter.id;

  // Register this editor's tools into the app-wide TopBar (only in prose mode).
  const topBarContent = useMemo(
    () =>
      editorMode !== 'prose' ? null : (
        <MusicProjectToolbar
          toolbarBg={toolbarBg}
          toolbarBorder={toolbarBorder}
          accentColor={accentColor}
          mutedColor={mutedColor}
          title={title}
          hasDirtyActions={hasDirtyActions}
          paddingSliderMax={paddingSliderMax}
          effectivePadding={effectivePadding}
          setPadding={setPadding}
          lineHeight={lineHeight}
          setLineHeight={setLineHeight}
          hideMetatags={hideMetatags}
          setHideMetatags={setHideMetatags}
          nightMode={nightMode}
          setNightMode={setNightMode}
          setNightVariant={setNightVariant}
          nightPalettesLength={NIGHT_PALETTES.length}
          onSaveAll={onSaveAll}
          onClose={onClose}
        />
      ),
    [
      editorMode, toolbarBg, toolbarBorder, accentColor, mutedColor, title,
      hasDirtyActions, paddingSliderMax, effectivePadding, setPadding,
      lineHeight, setLineHeight, hideMetatags, setHideMetatags,
      nightMode, setNightMode, setNightVariant, onSaveAll, onClose,
    ],
  );
  useTopBarContent(topBarContent);

  if (editorMode !== 'prose') {
    return (
      <div className="editor-mode-placeholder editor-empty">
        <p>Kein Editor für diesen Modus</p>
      </div>
    );
  }

  return (
    <div
      className={`song-view${nightMode ? ' song-view-night' : ''}${nightAlt ? ' song-view-night-alt' : ''}`}
      style={{ backgroundColor: colors.bg, color: colors.text } as React.CSSProperties}
    >
      {/* Scrollable song content */}
      <div className="song-view-scroll" ref={scrollContainerRef}>
        {/* Song header */}
        <div
          className="song-view-song-header"
          style={{ paddingLeft: `${effectivePadding}px`, paddingRight: `${effectivePadding}px` }}
        >
          <div className="song-view-song-icon" style={{ color: accentColor }}>
            <Music size={32} />
          </div>
          <div className="song-view-song-title" style={{ color: colors.text }}>
            {chapter.meta.title || chapter.id}
          </div>
        </div>

        {/* Verses (Strophen) */}
        {chapter.scenes.map((scene) => {
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
                    paddingLeft: `${effectivePadding}px`,
                    paddingRight: `${effectivePadding}px`,
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
                      padding={effectivePadding}
                      lineHeight={lineHeight}
                      onChange={c => onActionChange(chapter.id, scene.id, action.id, c)}
                      onSave={() => onActionSave(chapter.id, scene.id, action.id)}
                      onCtrlL={onCtrlL}
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

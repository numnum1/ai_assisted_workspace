import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Save, MessageSquareText, MoveHorizontal, Moon, Sun, Bookmark } from 'lucide-react';
import { createReadingTheme } from './readingTheme';
import { createCommentExtension } from './commentExtension';
import { hideMarksExtension } from './hideMarksExtension';
import {
  createBookmarkExtension,
  getBookmark,
  getBookmarkLine,
  setBookmark,
  removeBookmark,
} from './bookmarkExtension';
import { createSceneMarkerExtension } from './sceneMarkerExtension';
import { CommentSidebar } from './CommentSidebar';
import type { CommentPosition } from './commentExtension';

const FONT_SIZE_KEY = 'reading-font-size';
const PADDING_KEY = 'reading-padding';
const NIGHT_MODE_KEY = 'reading-night-mode';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 64;

const DAY_COLORS = {
  bg:             '#f5f0e8',
  text:           '#2c2a25',
  headerBg:       '#ebe5db',
  sidebarBg:      '#ede8de',
  hoverBg:        '#e8e3da',
  mutedText:      '#6b6560',
  caretColor:     '#555555',
  border:         'rgba(44,42,37,0.18)',
  selectionColor: '#c8d8ec',
};

const NIGHT_COLORS = {
  bg:             '#1a0f07',
  text:           '#dfc99c',
  headerBg:       '#120a04',
  sidebarBg:      '#160d05',
  hoverBg:        '#231508',
  mutedText:      '#9a7d50',
  caretColor:     '#c8a870',
  border:         'rgba(223,201,156,0.2)',
  selectionColor: 'rgba(200,155,70,0.35)',
};

interface WritingEditorProps {
  content: string;
  filePath: string | null;
  projectPath: string;
  bookmarkJumpTarget: { filePath: string; line: number } | null;
  onBookmarkJumpDone: () => void;
  onBookmarkChange?: () => void;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onActiveSceneChange?: (sceneId: string | null) => void;
}

export function WritingEditor({
  content,
  filePath,
  projectPath,
  bookmarkJumpTarget,
  onBookmarkJumpDone,
  onBookmarkChange,
  isDirty,
  onChange,
  onSave,
  onActiveSceneChange,
}: WritingEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onActiveSceneRef = useRef(onActiveSceneChange);
  const themeCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onActiveSceneRef.current = onActiveSceneChange;

  const [showComments, setShowComments] = useState(false);
  const [commentPositions, setCommentPositions] = useState<CommentPosition[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [nightMode, setNightMode] = useState<boolean>(() =>
    localStorage.getItem(NIGHT_MODE_KEY) === 'true'
  );
  const [fontSize, setFontSize] = useState<number>(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    return stored ? Number(stored) : DEFAULT_FONT_SIZE;
  });
  const [padding, setPadding] = useState<number>(() => {
    const stored = localStorage.getItem(PADDING_KEY);
    return stored ? Number(stored) : DEFAULT_PADDING;
  });
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookmarkLine, setBookmarkLine] = useState<number | null>(() =>
    filePath && projectPath ? getBookmarkLine(projectPath, filePath) : null
  );
  const [bookmarkMenu, setBookmarkMenu] = useState<{ x: number; y: number; line: number } | null>(null);

  const handleCommentPositions = useCallback((positions: CommentPosition[], height: number) => {
    setCommentPositions(positions);
    setContentHeight(height);
  }, []);

  const saveKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-s',
      run: () => { onSaveRef.current(); return true; },
    }]);
  }, []);

  const getThemeExtensions = useCallback((bLine: number | null) => {
    const colors = nightMode ? NIGHT_COLORS : DAY_COLORS;
    return [
      createReadingTheme({
        fontSize: `${fontSize}px`,
        padding: `48px ${padding}px`,
        backgroundColor:  colors.bg,
        textColor:        colors.text,
        caretColor:       colors.caretColor,
        selectionColor:   colors.selectionColor,
      }),
      createCommentExtension(handleCommentPositions),
      hideMarksExtension(),
      createBookmarkExtension(bLine),
    ];
  }, [fontSize, padding, nightMode, handleCommentPositions]);

  // Re-initialize the editor when the file changes
  useEffect(() => {
    if (!editorRef.current) return;

    const initialBookmark = filePath && projectPath
      ? getBookmarkLine(projectPath, filePath)
      : null;

    const state = EditorState.create({
      doc: content,
      extensions: [
        drawSelection(),
        history(),
        markdown(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        saveKeymap(),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        createSceneMarkerExtension((sceneId) => {
          onActiveSceneRef.current?.(sceneId);
        }),
        themeCompartmentRef.current.of(getThemeExtensions(initialBookmark)),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  // Reconfigure theme when appearance settings change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(getThemeExtensions(bookmarkLine)),
    });
  }, [nightMode, fontSize, padding, bookmarkLine, getThemeExtensions]);

  // Sync bookmark line when file changes
  useEffect(() => {
    setBookmarkLine(filePath && projectPath ? getBookmarkLine(projectPath, filePath) : null);
  }, [filePath, projectPath]);

  // Scroll to bookmark jump target
  useEffect(() => {
    if (!bookmarkJumpTarget || !filePath || filePath !== bookmarkJumpTarget.filePath) return;
    const view = viewRef.current;
    if (!view) return;
    const doScroll = () => {
      try {
        const pos = view.state.doc.line(bookmarkJumpTarget.line).from;
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
        onBookmarkJumpDone();
      } catch {
        onBookmarkJumpDone();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }, [bookmarkJumpTarget, filePath, onBookmarkJumpDone]);

  // Sync comment sidebar scroll with editor scroll
  useEffect(() => {
    const scroller = editorRef.current?.querySelector('.cm-scroller');
    if (!scroller) return;
    const handler = () => {
      if (sidebarRef.current) sidebarRef.current.scrollTop = scroller.scrollTop;
    };
    scroller.addEventListener('scroll', handler);
    return () => scroller.removeEventListener('scroll', handler);
  }, [filePath]);

  // Ctrl+scroll font size zoom
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
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
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Persist appearance settings
  useEffect(() => { localStorage.setItem(FONT_SIZE_KEY, String(fontSize)); }, [fontSize]);
  useEffect(() => { localStorage.setItem(PADDING_KEY, String(padding)); }, [padding]);
  useEffect(() => { localStorage.setItem(NIGHT_MODE_KEY, String(nightMode)); }, [nightMode]);

  // Close bookmark menu on outside click
  useEffect(() => {
    if (!bookmarkMenu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.writing-bookmark-menu')) {
        setBookmarkMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bookmarkMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!filePath || !projectPath) return;
    const view = viewRef.current;
    if (!view) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return;
    const line = view.state.doc.lineAt(pos);
    setBookmarkMenu({ x: e.clientX, y: e.clientY, line: line.number });
  }, [filePath, projectPath]);

  const handleSetBookmark = useCallback(() => {
    if (!bookmarkMenu || !filePath || !projectPath) return;
    setBookmark(projectPath, filePath, bookmarkMenu.line);
    setBookmarkLine(bookmarkMenu.line);
    setBookmarkMenu(null);
    onBookmarkChange?.();
  }, [bookmarkMenu, filePath, projectPath, onBookmarkChange]);

  const handleRemoveBookmark = useCallback(() => {
    if (!projectPath) return;
    removeBookmark(projectPath);
    setBookmarkLine(null);
    setBookmarkMenu(null);
    onBookmarkChange?.();
  }, [projectPath, onBookmarkChange]);

  if (!filePath) {
    return (
      <div className="editor-empty writing-editor-empty">
        <p>Wähle ein Kapitel aus der Planungsansicht</p>
      </div>
    );
  }

  const colors = nightMode ? NIGHT_COLORS : DAY_COLORS;
  const sidebarVisible = showComments && commentPositions.length > 0;
  const readingVars = {
    '--rm-bg':          colors.bg,
    '--rm-header-bg':   colors.headerBg,
    '--rm-sidebar-bg':  colors.sidebarBg,
    '--rm-hover':       colors.hoverBg,
    '--rm-text':        colors.text,
    '--rm-text-muted':  colors.mutedText,
    '--rm-border':      colors.border,
  } as React.CSSProperties;

  return (
    <div
      className={`editor-container editor-reading-mode${nightMode ? ' editor-reading-night' : ''}`}
      style={readingVars}
    >
      <div className="editor-header">
        <span className="editor-filename">
          {isDirty && <span className="editor-dirty">*</span>}
        </span>
        <div className="editor-header-actions">
          <div className="reading-padding-control" title="Seitenabstand (links/rechts)">
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
            className={`editor-mode-btn ${nightMode ? 'active' : ''}`}
            onClick={() => setNightMode(p => !p)}
            title={nightMode ? 'Tagmodus' : 'Nachtmodus'}
          >
            {nightMode ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {commentPositions.length > 0 && (
            <button
              className={`editor-mode-btn ${showComments ? 'active' : ''}`}
              onClick={() => setShowComments(p => !p)}
              title={showComments ? 'Kommentare ausblenden' : 'Kommentare einblenden'}
            >
              <MessageSquareText size={14} />
              <span>{commentPositions.length}</span>
            </button>
          )}
          <button
            className="editor-save-btn"
            onClick={onSave}
            disabled={!isDirty}
            title="Speichern (Ctrl+S)"
          >
            <Save size={14} />
          </button>
        </div>
      </div>

      <div className={`editor-content ${sidebarVisible ? 'editor-content-with-sidebar' : ''}`}>
        <div
          ref={editorRef}
          className="editor-cm-wrap"
          onContextMenu={handleContextMenu}
        />
        {sidebarVisible && (
          <CommentSidebar
            comments={commentPositions}
            contentHeight={contentHeight}
            sidebarRef={sidebarRef}
          />
        )}
        {fontSizeIndicator !== null && (
          <div className="reading-font-indicator">{fontSizeIndicator}px</div>
        )}
        {bookmarkMenu && (
          <div
            className="writing-bookmark-menu tree-context-menu"
            style={{ left: bookmarkMenu.x, top: bookmarkMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="tree-context-menu-item" onClick={handleSetBookmark}>
              <Bookmark size={14} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Lesezeichen in Zeile {bookmarkMenu.line} setzen
            </div>
            {projectPath && getBookmark(projectPath) != null && (
              <div
                className="tree-context-menu-item tree-context-menu-item-danger"
                onClick={handleRemoveBookmark}
              >
                Lesezeichen entfernen
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

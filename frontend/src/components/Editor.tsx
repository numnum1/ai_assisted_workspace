import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { Save, BookOpen, Code, MessageSquareText, MoveHorizontal, Moon, Sun, Bookmark, FileCode, X } from 'lucide-react';
import { createReadingTheme } from './readingTheme';
import { createCommentExtension } from './commentExtension';
import { hideMarksExtension } from './hideMarksExtension';
import { createBookmarkExtension, getBookmark, getBookmarkLine, setBookmark, removeBookmark } from './bookmarkExtension';
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

// Warm amber palette — minimal blue channel = natural blue light filter
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

interface EditorProps {
  content: string;
  filePath: string | null;
  projectPath: string;
  bookmarkJumpTarget: { filePath: string; line: number } | null;
  onBookmarkJumpDone: () => void;
  onBookmarkChange?: () => void;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
  onClose?: () => void;
  hasPlanning?: boolean;
  onOpenMetafile?: () => void;
}

type EditorMode = 'editor' | 'reading';

export function Editor({ content, filePath, projectPath, bookmarkJumpTarget, onBookmarkJumpDone, onBookmarkChange, isDirty, onChange, onSave, onClose, hasPlanning, onOpenMetafile }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const modeCompartmentRef = useRef(new Compartment());
  const [mode, setMode] = useState<EditorMode>('editor');
  const [showComments, setShowComments] = useState(false);
  const [commentPositions, setCommentPositions] = useState<CommentPosition[]>([]);
  const [contentHeight, setContentHeight] = useState(0);
  const [readingFontSize, setReadingFontSize] = useState<number>(() => {
    const stored = localStorage.getItem(FONT_SIZE_KEY);
    return stored ? Number(stored) : DEFAULT_FONT_SIZE;
  });
  const [readingPadding, setReadingPadding] = useState<number>(() => {
    const stored = localStorage.getItem(PADDING_KEY);
    return stored ? Number(stored) : DEFAULT_PADDING;
  });
  const [readingNightMode, setReadingNightMode] = useState<boolean>(() =>
    localStorage.getItem(NIGHT_MODE_KEY) === 'true'
  );
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookmarkLine, setBookmarkLine] = useState<number | null>(() =>
    filePath && projectPath ? getBookmarkLine(projectPath, filePath) : null
  );
  const [bookmarkMenu, setBookmarkMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'editor' ? 'reading' : 'editor');
  }, []);

  const saveKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-s',
      run: () => {
        onSaveRef.current();
        return true;
      },
    }]);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        toggleMode();
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
        if (hasPlanning && filePath && onOpenMetafile) {
          e.preventDefault();
          onOpenMetafile();
        }
      }
      if (e.ctrlKey && !e.altKey && !e.shiftKey && mode === 'reading' &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const scroller = editorRef.current?.querySelector('.cm-scroller');
        if (scroller) {
          const lineHeight = readingFontSize * 1.5;
          scroller.scrollBy({ top: e.key === 'ArrowDown' ? lineHeight : -lineHeight, behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMode, mode, readingFontSize, hasPlanning, filePath, onOpenMetafile]);

  const handleCommentPositions = useCallback((positions: CommentPosition[], height: number) => {
    setCommentPositions(positions);
    setContentHeight(height);
  }, []);

  const getModeExtensions = useCallback((m: EditorMode, bookmark: number | null) => {
    if (m === 'editor') {
      return [
        lineNumbers(),
        highlightActiveLine(),
        oneDark,
      ];
    }
    const colors = readingNightMode ? NIGHT_COLORS : DAY_COLORS;
    return [
      createReadingTheme({
        fontSize: `${readingFontSize}px`,
        padding: `48px ${readingPadding}px`,
        backgroundColor:  colors.bg,
        textColor:        colors.text,
        caretColor:       colors.caretColor,
        selectionColor:   colors.selectionColor,
      }),
      createCommentExtension(handleCommentPositions),
      hideMarksExtension(),
      createBookmarkExtension(bookmark),
    ];
  }, [handleCommentPositions, readingFontSize, readingPadding, readingNightMode]);

  useEffect(() => {
    if (!editorRef.current) return;

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
        modeCompartmentRef.current.of(getModeExtensions(mode, mode === 'reading' && filePath && projectPath ? getBookmarkLine(projectPath, filePath) : null)),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    if (mode === 'reading') {
      view.contentDOM.blur();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    view.dispatch({
      effects: modeCompartmentRef.current.reconfigure(getModeExtensions(mode, mode === 'reading' ? bookmarkLine : null)),
    });

    if (mode === 'reading') {
      view.contentDOM.blur();
      const scroller = editorRef.current?.querySelector('.cm-scroller');
      if (scroller) {
        const scrollHandler = () => {
          if (sidebarRef.current) {
            sidebarRef.current.scrollTop = scroller.scrollTop;
          }
        };
        scroller.addEventListener('scroll', scrollHandler);
        const lineToScroll = (bookmarkJumpTarget && filePath === bookmarkJumpTarget.filePath)
          ? bookmarkJumpTarget.line
          : bookmarkLine;
        if (lineToScroll != null) {
          const doScroll = () => {
            try {
              const pos = view.state.doc.line(lineToScroll).from;
              view.dispatch({
                effects: EditorView.scrollIntoView(pos, { y: 'center' }),
              });
              if (bookmarkJumpTarget && filePath === bookmarkJumpTarget.filePath) {
                onBookmarkJumpDone();
              }
            } catch {
              if (bookmarkJumpTarget && filePath === bookmarkJumpTarget.filePath) {
                onBookmarkJumpDone();
              }
            }
          };
          if (bookmarkJumpTarget && filePath === bookmarkJumpTarget.filePath) {
            requestAnimationFrame(() => requestAnimationFrame(doScroll));
          } else {
            doScroll();
          }
        }
        return () => { scroller.removeEventListener('scroll', scrollHandler); };
      }
    }
  }, [mode, bookmarkLine, getModeExtensions, bookmarkJumpTarget, filePath, onBookmarkJumpDone]);

  useEffect(() => {
    if (mode === 'editor') {
      setCommentPositions([]);
      setContentHeight(0);
    }
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(readingFontSize));
  }, [readingFontSize]);

  useEffect(() => {
    localStorage.setItem(PADDING_KEY, String(readingPadding));
  }, [readingPadding]);

  useEffect(() => {
    localStorage.setItem(NIGHT_MODE_KEY, String(readingNightMode));
  }, [readingNightMode]);

  useEffect(() => {
    setBookmarkLine(filePath && projectPath ? getBookmarkLine(projectPath, filePath) : null);
  }, [filePath, projectPath]);

  useEffect(() => {
    if (bookmarkJumpTarget && filePath === bookmarkJumpTarget.filePath) {
      setMode('reading');
    }
  }, [bookmarkJumpTarget, filePath]);

  useEffect(() => {
    if (!bookmarkMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target && !(target as Element).closest?.('.reading-bookmark-menu')) {
        setBookmarkMenu(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bookmarkMenu]);

  const handleReadingContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== 'reading' || !filePath || !projectPath) return;
      const view = viewRef.current;
      if (!view) return;
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return;
      const line = view.state.doc.lineAt(pos);
      setBookmarkMenu({ x: e.clientX, y: e.clientY, line: line.number });
    },
    [mode, filePath, projectPath]
  );

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

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || mode !== 'reading') return;
      e.preventDefault();
      setReadingFontSize(prev => {
        const next = e.deltaY < 0 ? Math.min(prev + 1, 30) : Math.max(prev - 1, 10);
        if (fontSizeTimerRef.current) clearTimeout(fontSizeTimerRef.current);
        setFontSizeIndicator(next);
        fontSizeTimerRef.current = setTimeout(() => setFontSizeIndicator(null), 1000);
        return next;
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [mode]);

  if (!filePath) {
    return (
      <div className="editor-empty">
        <FileTextPlaceholder />
        <p>Select a file from the project tree to start editing</p>
      </div>
    );
  }

  const isReading = mode === 'reading';
  const sidebarVisible = isReading && showComments && commentPositions.length > 0;
  const colors = readingNightMode ? NIGHT_COLORS : DAY_COLORS;
  const readingVars = isReading ? {
    '--rm-bg':          colors.bg,
    '--rm-header-bg':   colors.headerBg,
    '--rm-sidebar-bg':  colors.sidebarBg,
    '--rm-hover':       colors.hoverBg,
    '--rm-text':        colors.text,
    '--rm-text-muted':  colors.mutedText,
    '--rm-border':      colors.border,
  } as React.CSSProperties : {};

  return (
    <div
      className={`editor-container ${isReading ? 'editor-reading-mode' : ''} ${isReading && readingNightMode ? 'editor-reading-night' : ''}`}
      style={readingVars}
    >
      <div className="editor-header">
        <span className="editor-filename">
          {filePath}
          {isDirty && <span className="editor-dirty"> *</span>}
        </span>
        <div className="editor-header-actions">
          {isReading && (
            <div className="reading-padding-control" title="Seitenabstand (links/rechts)">
              <MoveHorizontal size={12} />
              <input
                type="range"
                className="reading-padding-slider"
                min={0}
                max={200}
                step={4}
                value={readingPadding}
                onChange={e => setReadingPadding(Number(e.target.value))}
              />
            </div>
          )}
          {isReading && (
            <button
              className={`editor-mode-btn ${readingNightMode ? 'active' : ''}`}
              onClick={() => setReadingNightMode(prev => !prev)}
              title={readingNightMode ? 'Tagmodus' : 'Nachtmodus'}
            >
              {readingNightMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
          {isReading && commentPositions.length > 0 && (
            <button
              className={`editor-mode-btn ${showComments ? 'active' : ''}`}
              onClick={() => setShowComments(prev => !prev)}
              title={showComments ? 'Kommentare ausblenden' : 'Kommentare einblenden'}
            >
              <MessageSquareText size={14} />
              <span>{commentPositions.length}</span>
            </button>
          )}
          <button
            className={`editor-mode-btn ${isReading ? 'active' : ''}`}
            onClick={toggleMode}
            title={mode === 'editor' ? 'Lesemodus (Alt+R)' : 'Editor (Alt+R)'}
          >
            {mode === 'editor' ? <BookOpen size={14} /> : <Code size={14} />}
            <span>{mode === 'editor' ? 'Lesen' : 'Editor'}</span>
          </button>
          {hasPlanning && filePath && (
            <button
              className="editor-mode-btn"
              onClick={onOpenMetafile}
              title="Metafile öffnen (Alt+E)"
            >
              <FileCode size={14} />
              <span>Metafile</span>
            </button>
          )}
          <button
            className="editor-save-btn"
            onClick={onSave}
            disabled={!isDirty}
            title="Save (Ctrl+S)"
          >
            <Save size={14} />
          </button>
          {onClose && (
            <button
              className="editor-close-btn"
              onClick={onClose}
              title="Schließen"
              aria-label="Schließen"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className={`editor-content ${sidebarVisible ? 'editor-content-with-sidebar' : ''}`}>
        <div
          ref={editorRef}
          className="editor-cm-wrap"
          onContextMenu={isReading ? handleReadingContextMenu : undefined}
        />
        {sidebarVisible && (
          <CommentSidebar
            comments={commentPositions}
            contentHeight={contentHeight}
            sidebarRef={sidebarRef}
          />
        )}
        {fontSizeIndicator !== null && (
          <div className="reading-font-indicator">
            {fontSizeIndicator}px
          </div>
        )}
        {bookmarkMenu && (
          <div
            className="reading-bookmark-menu tree-context-menu"
            style={{ left: bookmarkMenu.x, top: bookmarkMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="tree-context-menu-item"
              onClick={handleSetBookmark}
            >
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

function FileTextPlaceholder() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  );
}

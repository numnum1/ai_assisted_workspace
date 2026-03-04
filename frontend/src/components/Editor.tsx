import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { Save, BookOpen, Code, MessageSquareText, MoveHorizontal } from 'lucide-react';
import { createReadingTheme } from './readingTheme';
import { createCommentExtension } from './commentExtension';
import { hideMarksExtension } from './hideMarksExtension';
import { CommentSidebar } from './CommentSidebar';
import type { CommentPosition } from './commentExtension';

const FONT_SIZE_KEY = 'reading-font-size';
const PADDING_KEY = 'reading-padding';
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_PADDING = 64;

interface EditorProps {
  content: string;
  filePath: string | null;
  isDirty: boolean;
  onChange: (content: string) => void;
  onSave: () => void;
}

type EditorMode = 'editor' | 'reading';

export function Editor({ content, filePath, isDirty, onChange, onSave }: EditorProps) {
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
  const [fontSizeIndicator, setFontSizeIndicator] = useState<number | null>(null);
  const fontSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMode]);

  const handleCommentPositions = useCallback((positions: CommentPosition[], height: number) => {
    setCommentPositions(positions);
    setContentHeight(height);
  }, []);

  const getModeExtensions = useCallback((m: EditorMode) => {
    if (m === 'editor') {
      return [
        lineNumbers(),
        highlightActiveLine(),
        oneDark,
      ];
    }
    return [
      createReadingTheme({
        fontSize: `${readingFontSize}px`,
        padding: `48px ${readingPadding}px`,
      }),
      createCommentExtension(handleCommentPositions),
      hideMarksExtension(),
    ];
  }, [handleCommentPositions, readingFontSize, readingPadding]);

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
        modeCompartmentRef.current.of(getModeExtensions(mode)),
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
      effects: modeCompartmentRef.current.reconfigure(getModeExtensions(mode)),
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
        return () => { scroller.removeEventListener('scroll', scrollHandler); };
      }
    }
  }, [mode, getModeExtensions]);

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

  return (
    <div className={`editor-container ${isReading ? 'editor-reading-mode' : ''}`}>
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
          <button
            className="editor-save-btn"
            onClick={onSave}
            disabled={!isDirty}
            title="Save (Ctrl+S)"
          >
            <Save size={14} />
          </button>
        </div>
      </div>
      <div className={`editor-content ${sidebarVisible ? 'editor-content-with-sidebar' : ''}`}>
        <div ref={editorRef} className="editor-cm-wrap" />
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

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { Save, BookOpen, Code } from 'lucide-react';
import { createReadingTheme } from './readingTheme';

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
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const [mode, setMode] = useState<EditorMode>('editor');
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const saveKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-s',
      run: () => {
        onSaveRef.current();
        return true;
      },
    }]);
  }, []);

  const toggleKeymap = useCallback(() => {
    return keymap.of([{
      key: 'Mod-Shift-r',
      run: () => {
        setMode(prev => prev === 'editor' ? 'reading' : 'editor');
        return true;
      },
    }]);
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    const cursorPos = viewRef.current
      ? viewRef.current.state.selection.main.head
      : 0;

    const sharedExtensions = [
      drawSelection(),
      history(),
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      saveKeymap(),
      toggleKeymap(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];

    const editorExtensions = [
      lineNumbers(),
      highlightActiveLine(),
      oneDark,
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
      }),
    ];

    const readingExtensions = [
      createReadingTheme(),
    ];

    const extensions = [
      ...sharedExtensions,
      ...(mode === 'editor' ? editorExtensions : readingExtensions),
    ];

    const state = EditorState.create({
      doc: content,
      extensions,
      selection: { anchor: Math.min(cursorPos, content.length) },
    });

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, mode]);

  if (!filePath) {
    return (
      <div className="editor-empty">
        <FileTextPlaceholder />
        <p>Select a file from the project tree to start editing</p>
      </div>
    );
  }

  return (
    <div className={`editor-container ${mode === 'reading' ? 'editor-reading-mode' : ''}`}>
      <div className="editor-header">
        <span className="editor-filename">
          {filePath}
          {isDirty && <span className="editor-dirty"> *</span>}
        </span>
        <div className="editor-header-actions">
          <button
            className={`editor-mode-btn ${mode === 'reading' ? 'active' : ''}`}
            onClick={() => setMode(prev => prev === 'editor' ? 'reading' : 'editor')}
            title={mode === 'editor' ? 'Lesemodus (Ctrl+Shift+R)' : 'Editor (Ctrl+Shift+R)'}
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
      <div className="editor-content" ref={editorRef} />
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

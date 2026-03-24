import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Save, FileText } from 'lucide-react';

interface MarkdownFileEditorProps {
  path: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onClearError?: () => void;
}

export function MarkdownFileEditor({
  path,
  content,
  dirty,
  loading,
  error,
  onChange,
  onSave,
  onClearError,
}: MarkdownFileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const buildTheme = useCallback(
    () =>
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
          backgroundColor: 'var(--bg-secondary, #1e1e2e)',
          color: 'var(--text-primary, #cdd6f4)',
        },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, monospace' },
        '.cm-content': { minHeight: '200px', padding: '12px 16px' },
        '.cm-gutters': {
          backgroundColor: 'var(--bg-tertiary, #181825)',
          color: 'var(--text-muted, #6c7086)',
          borderRight: '1px solid var(--border, #313244)',
        },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(137, 180, 250, 0.12)' },
      }),
    [],
  );

  useEffect(() => {
    if (!path || !editorRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        drawSelection(),
        history(),
        markdown(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        themeCompartment.current.of(buildTheme()),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(buildTheme()),
    });
  }, [buildTheme]);

  if (!path) {
    return (
      <div className="markdown-file-editor markdown-file-editor--empty editor-empty">
        <FileText size={40} strokeWidth={1} />
        <p>Datei im Baum auswählen</p>
      </div>
    );
  }

  const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;

  return (
    <div className="markdown-file-editor">
      <div className="markdown-file-editor-toolbar">
        <span className="markdown-file-editor-title" title={path}>
          {fileName}
          {dirty ? ' •' : ''}
        </span>
        {error && (
          <span className="markdown-file-editor-error" role="alert">
            {error}
            {onClearError && (
              <button type="button" className="markdown-file-editor-error-dismiss" onClick={onClearError}>
                ×
              </button>
            )}
          </span>
        )}
        <button
          type="button"
          className="markdown-file-editor-save"
          onClick={() => onSave()}
          disabled={loading || !dirty}
          title="Speichern (Strg+S)"
        >
          <Save size={16} />
          Speichern
        </button>
      </div>
      <div ref={editorRef} className="markdown-file-editor-cm" />
    </div>
  );
}

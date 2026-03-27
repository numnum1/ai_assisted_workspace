import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Save, FileText, NotebookPen, Trash2 } from 'lucide-react';
import { ShadowTextarea } from './ShadowTextarea.tsx';
import { scrollLineWithoutCursorKeymap } from './codemirrorScrollLineKeymap.ts';
import type { SelectionContext } from '../types.ts';

interface MarkdownFileEditorProps {
  path: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onClearError?: () => void;
  // Shadow (meta-note) props
  shadowContent: string;
  shadowDirty: boolean;
  shadowExists: boolean;
  shadowLoading: boolean;
  shadowError: string | null;
  shadowPanelOpen: boolean;
  onShadowChange: (value: string) => void;
  onShadowSave: () => void;
  onShadowDelete: () => void;
  onOpenShadowPanel: () => void;
  onCloseShadowPanel: () => void;
  onClearShadowError?: () => void;
  /** Called on Ctrl+L with the selected text and a function to apply a replacement */
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
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
  shadowContent,
  shadowDirty,
  shadowExists,
  shadowLoading,
  shadowError,
  shadowPanelOpen,
  onShadowChange,
  onShadowSave,
  onShadowDelete,
  onOpenShadowPanel,
  onCloseShadowPanel,
  onClearShadowError,
  onCtrlL,
}: MarkdownFileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCtrlLRef = useRef(onCtrlL);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onCtrlLRef.current = onCtrlL;

  // ── CodeMirror setup ───────────────────────────────────────────────────────

  const buildTheme = useCallback(
    () =>
      EditorView.theme(
        {
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
          '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            background: 'rgba(137, 180, 250, 0.35)',
          },
          '.cm-selectionMatch': { backgroundColor: 'rgba(137, 180, 250, 0.15)' },
        },
        { dark: true },
      ),
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
        scrollLineWithoutCursorKeymap,
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
          {
            key: 'Mod-l',
            run: (view) => {
              const sel = view.state.selection.main;
              if (!sel.empty && onCtrlLRef.current) {
                const text = view.state.doc.sliceString(sel.from, sel.to);
                onCtrlLRef.current(
                  { text, from: sel.from, to: sel.to, editorId: 'file' },
                  (from, to, insert) => view.dispatch({ changes: { from, to, insert } }),
                );
              }
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

  // ── Render ─────────────────────────────────────────────────────────────────

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
          className={`markdown-file-editor-shadow-btn${shadowPanelOpen ? ' active' : ''}${shadowExists ? ' has-shadow' : ''}`}
          onClick={shadowPanelOpen ? onCloseShadowPanel : onOpenShadowPanel}
          title={shadowPanelOpen ? 'Meta-Notiz schließen' : (shadowExists ? 'Meta-Notiz bearbeiten' : 'Meta-Notiz anlegen')}
        >
          <NotebookPen size={14} />
          {shadowExists && !shadowPanelOpen && <span className="markdown-file-editor-shadow-dot" />}
        </button>
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

      <div className={`markdown-file-editor-body${shadowPanelOpen ? ' with-shadow' : ''}`}>
        <div ref={editorRef} className="markdown-file-editor-cm" />

        {shadowPanelOpen && (
          <div className="shadow-panel">
            <div className="shadow-panel-toolbar">
              <span className="shadow-panel-title">
                <NotebookPen size={13} />
                Meta-Notiz
                {shadowDirty ? ' •' : ''}
              </span>
              {shadowError && (
                <span className="shadow-panel-error" role="alert">
                  {shadowError}
                  {onClearShadowError && (
                    <button type="button" className="markdown-file-editor-error-dismiss" onClick={onClearShadowError}>
                      ×
                    </button>
                  )}
                </span>
              )}
              {shadowExists && (
                <button
                  type="button"
                  className="shadow-panel-delete-btn"
                  onClick={onShadowDelete}
                  title="Meta-Notiz löschen"
                  disabled={shadowLoading}
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                type="button"
                className="markdown-file-editor-save"
                onClick={onShadowSave}
                disabled={shadowLoading || !shadowDirty}
                title="Meta-Notiz speichern (Strg+S im Textfeld)"
              >
                <Save size={14} />
                Speichern
              </button>
            </div>
            <ShadowTextarea
              value={shadowContent}
              onChange={onShadowChange}
              onSave={onShadowSave}
              placeholder="Notizen, Status, Querverweise (@ für Wiki & Meta-Notizen)…"
              disabled={shadowLoading}
              excludeShadowPath={path}
            />
          </div>
        )}
      </div>
    </div>
  );
}

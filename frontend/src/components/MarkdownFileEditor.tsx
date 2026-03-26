import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorView, keymap, drawSelection, ViewPlugin, Decoration } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { EditorState, Compartment, RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Save, FileText, NotebookPen, Trash2, Eye, EyeOff } from 'lucide-react';
import { ShadowTextarea } from './ShadowTextarea.tsx';

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
}

// ── Frontmatter-hiding CodeMirror plugin ─────────────────────────────────────

const hiddenLineDeco = Decoration.line({ class: 'cm-frontmatter-hidden' });

function buildFrontmatterDecos(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const builder = new RangeSetBuilder<Decoration>();
  if (doc.lines < 2) return builder.finish();
  const firstLine = doc.line(1);
  if (firstLine.text.trim() !== '---') return builder.finish();
  let closingLine = -1;
  for (let i = 2; i <= doc.lines; i++) {
    if (doc.line(i).text.trim() === '---') {
      closingLine = i;
      break;
    }
  }
  if (closingLine === -1) return builder.finish();
  for (let i = 1; i <= closingLine; i++) {
    const line = doc.line(i);
    builder.add(line.from, line.from, hiddenLineDeco);
  }
  return builder.finish();
}

const frontmatterPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildFrontmatterDecos(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildFrontmatterDecos(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ── localStorage key ─────────────────────────────────────────────────────────

const HIDE_META_KEY = (path: string) => `editor-hide-meta:${path}`;

// ─────────────────────────────────────────────────────────────────────────────

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
}: MarkdownFileEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const hideMetaCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  // ── Hide-meta state (per file, persisted in localStorage) ──────────────────
  const [hideMeta, setHideMeta] = useState(false);

  useEffect(() => {
    if (!path) { setHideMeta(false); return; }
    setHideMeta(localStorage.getItem(HIDE_META_KEY(path)) === 'true');
  }, [path]);

  const toggleHideMeta = useCallback(() => {
    if (!path) return;
    setHideMeta((prev) => {
      const next = !prev;
      localStorage.setItem(HIDE_META_KEY(path), String(next));
      return next;
    });
  }, [path]);

  // ── CodeMirror setup ───────────────────────────────────────────────────────

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
        '.cm-frontmatter-hidden': { display: 'none' },
      }),
    [],
  );

  useEffect(() => {
    if (!path || !editorRef.current) return;

    const initialHide = localStorage.getItem(HIDE_META_KEY(path)) === 'true';

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
        hideMetaCompartment.current.of(initialHide ? frontmatterPlugin : []),
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

  // Reconfigure hide-meta extension when state changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: hideMetaCompartment.current.reconfigure(hideMeta ? frontmatterPlugin : []),
    });
  }, [hideMeta]);

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
          className={`markdown-file-editor-shadow-btn${hideMeta ? ' active' : ''}`}
          onClick={toggleHideMeta}
          title={hideMeta ? 'Metatags anzeigen' : 'Metatags verstecken'}
        >
          {hideMeta ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
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

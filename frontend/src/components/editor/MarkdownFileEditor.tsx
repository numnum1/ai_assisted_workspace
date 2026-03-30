import { Save, FileText, NotebookPen, Trash2, X } from 'lucide-react';
import { ShadowTextarea } from './ShadowTextarea.tsx';
import { UnifiedMarkdownEditor } from './UnifiedMarkdownEditor';
import type { SelectionContext } from '../../types.ts';

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
  onCloseFile: () => void;
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
  onCloseFile,
  onClearShadowError,
  onCtrlL,
}: MarkdownFileEditorProps) {
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
        <button
          type="button"
          className="markdown-file-editor-close-btn"
          onClick={onCloseFile}
          title="Datei schließen"
        >
          <X size={14} />
        </button>
      </div>

      <div className={`markdown-file-editor-body${shadowPanelOpen ? ' with-shadow' : ''}`}>
        <UnifiedMarkdownEditor
          instanceKey={path}
          content={content}
          onChange={onChange}
          onSave={onSave}
          onCtrlL={onCtrlL}
          theme="file"
          layout="fixed"
          editorId="file"
          alwaysShowMarkdownStylingCharacters
          alwaysShowHtmlComments
          showReferencesAsLinks
          className="markdown-file-editor-cm"
        />

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

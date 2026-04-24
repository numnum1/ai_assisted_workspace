import { Save, FileText, X } from 'lucide-react';
import { UnifiedMarkdownEditor } from './UnifiedMarkdownEditor';
import type { SelectionContext, AltVersionSession } from '../../types.ts';

interface MarkdownFileEditorProps {
  path: string | null;
  content: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onClearError?: () => void;
  onCloseFile: () => void;
  /** Called on Ctrl+L with the selected text and a function to apply a replacement */
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
  /** Called on Ctrl+Alt+A to open the alternative version panel */
  onAltVersion?: (session: AltVersionSession) => void;
  /** 1-based line to scroll to after open (paired with scrollNonce). */
  scrollToLine?: number;
  scrollNonce?: number;
  onScrollHandled?: () => void;
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
  onCloseFile,
  onCtrlL,
  onAltVersion,
  scrollToLine,
  scrollNonce,
  onScrollHandled,
}: MarkdownFileEditorProps) {
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
        <button
          type="button"
          className="markdown-file-editor-close-btn"
          onClick={onCloseFile}
          title="Datei schließen"
        >
          <X size={14} />
        </button>
      </div>

      <div className="markdown-file-editor-body">
        <UnifiedMarkdownEditor
          instanceKey={path}
          content={content}
          onChange={onChange}
          onSave={onSave}
          onCtrlL={onCtrlL}
          onAltVersion={onAltVersion}
          theme="file"
          layout="fixed"
          editorId="file"
          alwaysShowMarkdownStylingCharacters
          alwaysShowHtmlComments
          showReferencesAsLinks
          scrollToLine={scrollToLine}
          scrollNonce={scrollNonce}
          onScrollHandled={onScrollHandled}
          className="markdown-file-editor-cm"
        />
      </div>
    </div>
  );
}

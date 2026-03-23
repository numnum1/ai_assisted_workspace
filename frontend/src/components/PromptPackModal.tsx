import { useState, useEffect, useCallback } from 'react';
import { X, Wand2 } from 'lucide-react';
import { PromptPackPanel } from './PromptPackPanel.tsx';

interface PromptPackModalProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (message: string, referencedFiles: string[]) => void;
  streaming: boolean;
  /** If false, backend may fall back to default mode (show warning). */
  hasPromptPackMode: boolean;
}

export function PromptPackModal({
  open,
  onClose,
  onGenerate,
  streaming,
  hasPromptPackMode,
}: PromptPackModalProps) {
  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);
  const [panelKey, setPanelKey] = useState(0);

  const addFile = useCallback((path: string) => {
    if (!path) return;
    setReferencedFiles(prev => (prev.includes(path) ? prev : [...prev, path]));
  }, []);

  const removeFile = useCallback((path: string) => {
    setReferencedFiles(prev => prev.filter(p => p !== path));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !streaming) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, streaming, onClose]);

  useEffect(() => {
    if (open) {
      setReferencedFiles([]);
      setPanelKey(k => k + 1);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="prompt-pack-modal-overlay" onClick={streaming ? undefined : onClose}>
      <div
        className="prompt-pack-modal-dialog"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="prompt-pack-modal-title"
        aria-modal="true"
      >
        <div className="prompt-pack-modal-header">
          <div className="prompt-pack-modal-header-left">
            <Wand2 size={18} className="prompt-pack-modal-icon" aria-hidden />
            <h2 id="prompt-pack-modal-title" className="prompt-pack-modal-title">
              Prompt-Paket
            </h2>
          </div>
          <button
            type="button"
            className="prompt-pack-modal-close"
            onClick={onClose}
            disabled={streaming}
            title="Schließen (Esc)"
          >
            <X size={18} />
          </button>
        </div>
        <p className="prompt-pack-modal-intro">
          Quellen anhängen, Anweisung schreiben – die KI baut einen fertigen Text zum Einfügen in ChatGPT oder
          Grok.
        </p>
        {!hasPromptPackMode && (
          <p className="prompt-pack-modal-warning">
            Hinweis: Der Modus „prompt-pack“ fehlt im Projekt. Die Anfrage nutzt ggf. den Standard-Chat-Modus –
            kopiere <code>prompt-pack.yaml</code> nach <code>.assistant/modes/</code> oder initialisiere das
            Projekt neu.
          </p>
        )}
        <div className="prompt-pack-modal-body">
          <PromptPackPanel
            key={panelKey}
            referencedFiles={referencedFiles}
            onAddFile={addFile}
            onRemoveFile={removeFile}
            onSubmit={onGenerate}
            streaming={streaming}
            embeddedInModal
          />
        </div>
      </div>
    </div>
  );
}

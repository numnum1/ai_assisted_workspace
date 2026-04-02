import { useState, useEffect } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import { glossaryApi } from '../../api.ts';

interface GlossaryChatDialogProps {
  open: boolean;
  /** Increment when opening so the same term can trigger a fresh generate. */
  dialogVersion: number;
  initialTerm: string;
  chatContext: string;
  onClose: () => void;
}

export function GlossaryChatDialog({
  open,
  dialogVersion,
  initialTerm,
  chatContext,
  onClose,
}: GlossaryChatDialogProps) {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = initialTerm.trim();
    setTerm(t);
    setDefinition('');
    setError(null);
    if (!t) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    glossaryApi
      .generate({ term: t, chatContext })
      .then((r) => {
        if (cancelled) return;
        setTerm(r.term);
        setDefinition(r.definition);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Generierung fehlgeschlagen');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, dialogVersion, initialTerm, chatContext]);

  const handleRegenerate = () => {
    const t = term.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    glossaryApi
      .generate({ term: t, chatContext })
      .then((r) => {
        setTerm(r.term);
        setDefinition(r.definition);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Generierung fehlgeschlagen'))
      .finally(() => setLoading(false));
  };

  const handleSave = async () => {
    const tr = term.trim();
    const def = definition.trim();
    if (!tr || !def) return;
    setSaving(true);
    setError(null);
    try {
      await glossaryApi.create({ term: tr, definition: def });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="glossary-chat-dialog-overlay" onClick={onClose} role="presentation">
      <div className="glossary-chat-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="glossary-dialog-title">
        <div className="glossary-chat-dialog-header">
          <h3 id="glossary-dialog-title">Zum Glossar hinzufügen</h3>
          <button type="button" className="glossary-chat-dialog-close" onClick={onClose} title="Schließen">
            <X size={16} />
          </button>
        </div>
        <div className="glossary-chat-dialog-body">
          {error && <div className="glossary-chat-dialog-error">{error}</div>}
          <label className="glossary-chat-dialog-label">Begriff</label>
          <input
            className="glossary-chat-dialog-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            disabled={loading}
          />
          <label className="glossary-chat-dialog-label">Beschreibung</label>
          <textarea
            className="glossary-chat-dialog-textarea"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            disabled={loading}
            rows={6}
          />
          {loading && (
            <div className="glossary-chat-dialog-loading">
              <Loader2 size={18} className="glossary-chat-dialog-spinner" />
              <span>KI erstellt den Eintrag…</span>
            </div>
          )}
        </div>
        <div className="glossary-chat-dialog-footer">
          <button
            type="button"
            className="glossary-chat-dialog-secondary"
            onClick={handleRegenerate}
            disabled={loading || saving || !term.trim()}
            title="Erneut mit KI generieren"
          >
            <RefreshCw size={14} />
            Neu generieren
          </button>
          <button type="button" className="glossary-chat-dialog-secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button
            type="button"
            className="glossary-chat-dialog-primary"
            onClick={() => void handleSave()}
            disabled={loading || saving || !term.trim() || !definition.trim()}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

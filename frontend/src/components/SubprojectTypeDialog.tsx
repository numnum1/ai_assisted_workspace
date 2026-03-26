import { useState, useEffect } from 'react';
import { projectConfigApi, subprojectApi } from '../api.ts';
import type { WorkspaceModeInfo } from '../types.ts';

interface SubprojectTypeDialogProps {
  folderPath: string;
  /** When set, dialog title reflects "change type" and this type is preselected */
  initialTypeId?: string | null;
  initialName?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SubprojectTypeDialog({
  folderPath,
  initialTypeId,
  initialName = '',
  onClose,
  onSaved,
}: SubprojectTypeDialogProps) {
  const [modes, setModes] = useState<WorkspaceModeInfo[]>([]);
  const [typeId, setTypeId] = useState(initialTypeId?.trim() || '');
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTypeId(initialTypeId?.trim() || '');
  }, [initialTypeId, folderPath]);

  useEffect(() => {
    let cancelled = false;
    projectConfigApi
      .listWorkspaceModes()
      .then((list) => {
        if (!cancelled) {
          const usable = list.filter((m) => m.mediaType === true);
          setModes(usable);
          if (!initialTypeId && usable.length > 0) {
            setTypeId((t) => (t ? t : usable[0].id));
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Modi konnten nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialTypeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeId) {
      setError('Bitte einen Typ wählen.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await subprojectApi.init(folderPath, typeId, name);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const isChange = Boolean(initialTypeId);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal subproject-type-dialog" onMouseDown={(ev) => ev.stopPropagation()}>
        <div className="modal-header">
          <h2>{isChange ? 'Medien-Projekt-Typ ändern' : 'Als Medien-Projekt einrichten'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <p className="subproject-dialog-path">
            <strong>Ordner:</strong> <code>{folderPath}</code>
          </p>
          {loading ? (
            <p>Laden…</p>
          ) : (
            <>
              <label className="subproject-dialog-label">
                Typ
                <select
                  className="subproject-dialog-select"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                  required
                >
                  {modes.length === 0 ? (
                    <option value="">Keine Modi verfügbar</option>
                  ) : (
                    modes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.id})
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="subproject-dialog-label">
                Anzeigename (optional)
                <input
                  type="text"
                  className="subproject-dialog-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z. B. Arbeitsname"
                />
              </label>
            </>
          )}
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Abbrechen
            </button>
            <button type="submit" className="btn-primary" disabled={saving || loading || !typeId}>
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

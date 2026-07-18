import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Save, Loader, RefreshCw, ChevronLeft } from 'lucide-react';
import { projectConfigApi } from '../../../../shared/api.ts';
import type { CommentCategoryDef } from '../../../../shared/types.ts';

interface CategoryForm {
  editingId: string | null;
  id: string;
  label: string;
  color: string;
  promptFragment: string;
}

const EMPTY_FORM: CategoryForm = {
  editingId: null,
  id: '',
  label: '',
  color: '#89b4fa',
  promptFragment: '',
};

/**
 * Settings tab for the AI chapter-comment categories (the chips shown in the
 * ChapterView "KI-Kommentare" popover). Mirrors the Modes tab's storage
 * pattern (list + inline edit + reset), backed by
 * `.assistant/comment-categories.json` via projectConfigApi.
 */
export function CommentCategoriesTab() {
  const [categories, setCategories] = useState<CommentCategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await projectConfigApi.getCommentCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kategorien konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => setForm({ ...EMPTY_FORM });
  const openEdit = (cat: CommentCategoryDef) =>
    setForm({
      editingId: cat.id,
      id: cat.id,
      label: cat.label,
      color: cat.color,
      promptFragment: cat.promptFragment,
    });

  const handleSave = async () => {
    if (!form || !form.id.trim() || !form.label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const id = form.id.trim().replace(/\s+/g, '-').toLowerCase();
      const saved = await projectConfigApi.saveCommentCategory(id, {
        id,
        label: form.label.trim(),
        color: form.color,
        promptFragment: form.promptFragment.trim(),
      });
      setCategories(prev => [...prev.filter(c => c.id !== saved.id), saved]);
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kategorie konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await projectConfigApi.deleteCommentCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
      if (form?.editingId === id) setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kategorie konnte nicht gelöscht werden');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      setCategories(await projectConfigApi.resetCommentCategories());
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zurücksetzen fehlgeschlagen');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="ps-loading">
        <Loader size={18} className="ps-spinner" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="ps-error">{error}</div>}

      {form ? (
        <div className="ps-mode-form">
          <div className="ps-form-nav">
            <button className="ps-back-btn" onClick={() => setForm(null)}>
              <ChevronLeft size={14} />
              Back
            </button>
            <span className="ps-form-title">
              {form.editingId ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
            </span>
          </div>

          <label className="ps-label">
            ID <span className="ps-label-hint">(keine Leerzeichen)</span>
          </label>
          <input
            className="ps-input"
            value={form.id}
            onChange={e => setForm(p => p && { ...p, id: e.target.value })}
            placeholder="z.B. zeitform"
            disabled={form.editingId !== null}
          />

          <label className="ps-label">Label</label>
          <input
            className="ps-input"
            value={form.label}
            onChange={e => setForm(p => p && { ...p, label: e.target.value })}
            placeholder="z.B. Zeitform"
          />

          <label className="ps-label">Farbe</label>
          <div className="ps-color-row">
            <input
              type="color"
              className="ps-color-picker"
              value={form.color}
              onChange={e => setForm(p => p && { ...p, color: e.target.value })}
            />
            <input
              className="ps-input ps-color-input"
              value={form.color}
              onChange={e => setForm(p => p && { ...p, color: e.target.value })}
              placeholder="#89b4fa"
            />
          </div>

          <label className="ps-label">
            Prompt-Baustein{' '}
            <span className="ps-label-hint">(Anweisung ans LLM, wenn diese Kategorie aktiv ist)</span>
          </label>
          <textarea
            className="ps-textarea ps-textarea-tall"
            value={form.promptFragment}
            onChange={e => setForm(p => p && { ...p, promptFragment: e.target.value })}
            placeholder="Worauf soll die KI bei dieser Kategorie achten?"
          />

          <div className="ps-actions">
            <button
              className="ps-save-btn"
              onClick={() => void handleSave()}
              disabled={saving || !form.id.trim() || !form.label.trim()}
            >
              {saving ? (
                <>
                  <Loader size={13} className="ps-spinner" /> Speichere...
                </>
              ) : (
                <>
                  <Save size={13} /> Kategorie speichern
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ps-list">
            {categories.length === 0 && (
              <div className="ps-empty">Keine Kategorien definiert.</div>
            )}
            {categories.map(cat => (
              <div key={cat.id} className="ps-list-item" onClick={() => openEdit(cat)}>
                <span className="ps-mode-dot" style={{ background: cat.color }} />
                <span className="ps-list-item-name">{cat.label}</span>
                <span className="ps-list-item-id">{cat.id}</span>
                <button
                  type="button"
                  className="ps-list-item-delete"
                  title="Kategorie löschen"
                  onClick={e => {
                    e.stopPropagation();
                    void handleDelete(cat.id);
                  }}
                  disabled={deletingId === cat.id}
                >
                  {deletingId === cat.id ? (
                    <Loader size={12} className="ps-spinner" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="ps-actions" style={{ gap: 8 }}>
            <button className="ps-add-btn" onClick={openNew}>
              <Plus size={13} /> Neue Kategorie
            </button>
            <button
              type="button"
              className="ps-secondary-btn"
              onClick={() => void handleReset()}
              disabled={resetting}
              title="Auf die eingebauten Standard-Kategorien zurücksetzen"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {resetting ? (
                <Loader size={13} className="ps-spinner" />
              ) : (
                <RefreshCw size={13} />
              )}
              Auf Standard zurücksetzen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

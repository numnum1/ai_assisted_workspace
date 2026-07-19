import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { eventsApi, projectApi, windowApi } from "../../shared/api.ts";
import type { EventRecord, EventStatus } from "../../shared/types.ts";
import "./EventsApp.css";

const STATUS_LABEL: Record<EventStatus, string> = {
  idee: "Idee",
  kanon: "Kanon",
};

interface FormState {
  id: string | null;
  title: string;
  summary: string;
  status: EventStatus;
}

const EMPTY_FORM: FormState = { id: null, title: "", summary: "", status: "idee" };

/**
 * The Ereignisse window — the only place an event's canonical file may be
 * created, edited or deleted. Every other workspace (Storyboard, Timeline,
 * Buch, Wiki) may only reference an event's id; none of them may create,
 * rename, or destroy the record itself.
 */
export function EventsApp() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await eventsApi.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = () => {
      projectApi
        .current()
        .then((p) => setProjectPath(p.hasProject ? p.path : null))
        .catch(() => setProjectPath(null));
    };
    load();
    return windowApi.onWorkspaceChanged(load);
  }, []);

  useEffect(() => {
    if (projectPath) loadEvents();
    else setEvents([]);
  }, [projectPath, loadEvents]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [events],
  );

  const isEditing = form.id !== null;

  const handleSelect = useCallback((record: EventRecord) => {
    setForm({
      id: record.id,
      title: record.title,
      summary: record.summary,
      status: record.status,
    });
  }, []);

  const handleNew = useCallback(() => setForm(EMPTY_FORM), []);

  const handleSave = useCallback(() => {
    const title = form.title.trim();
    if (!title) return;
    setSaving(true);
    setError(null);
    const request = isEditing
      ? eventsApi.update(form.id!, {
          title,
          summary: form.summary,
          status: form.status,
        })
      : eventsApi.create(title, form.summary);
    request
      .then((record) => {
        setForm({
          id: record.id,
          title: record.title,
          summary: record.summary,
          status: record.status,
        });
        loadEvents();
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }, [form, isEditing, loadEvents]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!window.confirm("Dieses Ereignis endgültig löschen?")) return;
      setError(null);
      eventsApi
        .delete(id)
        .then(() => {
          if (form.id === id) setForm(EMPTY_FORM);
          loadEvents();
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    },
    [form.id, loadEvents],
  );

  if (!projectPath) {
    return (
      <div className="events-app events-app--empty">
        <p>Kein Projekt geöffnet.</p>
      </div>
    );
  }

  return (
    <div className="events-app">
      <div className="events-header">
        <h1 className="events-title">Ereignisse</h1>
        <div className="events-header-actions">
          <button
            type="button"
            className="events-icon-btn"
            onClick={loadEvents}
            title="Aktualisieren"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="events-icon-btn"
            onClick={handleNew}
            title="Neues Ereignis"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {error && <div className="events-error">{error}</div>}

      <div className="events-list">
        {loading && events.length === 0 && (
          <div className="events-list-hint">Lädt…</div>
        )}
        {!loading && sortedEvents.length === 0 && (
          <div className="events-list-hint">Noch keine Ereignisse angelegt.</div>
        )}
        {sortedEvents.map((record) => (
          <div
            key={record.id}
            className={
              "events-list-item" +
              (form.id === record.id ? " events-list-item--active" : "")
            }
            onClick={() => handleSelect(record)}
          >
            <div className="events-list-item-main">
              <span className="events-list-item-title">{record.title}</span>
              <span
                className={`events-status-badge events-status-badge--${record.status}`}
              >
                {STATUS_LABEL[record.status]}
              </span>
            </div>
            <button
              type="button"
              className="events-icon-btn events-icon-btn--danger"
              title="Löschen"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(record.id);
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="events-form">
        <input
          className="events-input"
          placeholder="Titel"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <textarea
          className="events-textarea"
          placeholder="Was passiert?"
          rows={5}
          value={form.summary}
          onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
        />
        <div className="events-form-row">
          <select
            className="events-select"
            value={form.status}
            onChange={(e) =>
              setForm((f) => ({ ...f, status: e.target.value as EventStatus }))
            }
          >
            <option value="idee">Idee</option>
            <option value="kanon">Kanon</option>
          </select>
          <div className="events-form-actions">
            {isEditing && (
              <button type="button" className="events-btn" onClick={handleNew}>
                Abbrechen
              </button>
            )}
            <button
              type="button"
              className="events-btn events-btn--primary"
              disabled={!form.title.trim() || saving}
              onClick={handleSave}
            >
              {isEditing ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

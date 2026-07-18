import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StickyNote,
  RefreshCw,
  X,
  Plus,
  Square,
  Trash2,
  Undo2,
  Eraser,
} from "lucide-react";
import { storyboardApi } from "../../api.ts";
import { useBookProjects } from "../../hooks/useBookProjects.ts";
import type {
  StoryboardCard,
  StoryboardCardStatus,
  StoryboardData,
  StoryboardFrame,
} from "./types.ts";
import "./StoryboardCanvas.css";

interface StoryboardCanvasProps {
  open: boolean;
  onClose: () => void;
  projectPath: string | null;
  /**
   * "overlay" = centered dialog over the app with a dark backdrop;
   * "window" = fills a dedicated OS window (no backdrop, no click-outside-close).
   */
  variant?: "overlay" | "window";
}

const CARD_W = 200;
const CARD_H = 120;
const DRAG_THRESHOLD = 4;
const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;

/** Swatches for cards and frames — muted tones that sit calmly on parchment. */
const SWATCHES = [
  "#C9A227",
  "#1D9E75",
  "#D85A30",
  "#4C7BB5",
  "#8B5C9E",
  "#6B7280",
];

const STATUS_LABEL: Record<StoryboardCardStatus, string> = {
  idea: "Idee",
  active: "In Arbeit",
  graduated: "Graduiert",
  discarded: "Verworfen",
};

const STATUS_ORDER: StoryboardCardStatus[] = [
  "idea",
  "active",
  "graduated",
  "discarded",
];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

function frameContains(frame: StoryboardFrame, cx: number, cy: number): boolean {
  return (
    cx >= frame.x &&
    cx <= frame.x + frame.w &&
    cy >= frame.y &&
    cy <= frame.y + frame.h
  );
}

type Viewport = { tx: number; ty: number; scale: number };
type Selection =
  | { type: "card"; id: string }
  | { type: "frame"; id: string }
  | null;

type BookFilter = "all" | "unassigned" | string;

/**
 * Pinboard workspace: free-floating story-idea cards on a pan/zoom canvas — the
 * pre-canon place for material that belongs to no chapter, book or arc yet.
 * Purely manual (no AI). Series-wide: each card may be assigned to one or more
 * books. Editing writes through to .assistant/storyboard/ (debounced autosave).
 */
export function StoryboardCanvas({
  open,
  onClose,
  projectPath,
  variant = "overlay",
}: StoryboardCanvasProps) {
  const [data, setData] = useState<StoryboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection>(null);
  const [bookFilter, setBookFilter] = useState<BookFilter>("all");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ tx: 40, ty: 40, scale: 1 });

  const books = useBookProjects(projectPath).filter((b) => b.subprojectType);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await storyboardApi.read());
      setSelection(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Pinnwand konnte nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const scheduleSave = useCallback((next: StoryboardData) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaving(true);
      storyboardApi
        .write(next)
        .then(() => setSaveError(null))
        .catch((e) =>
          setSaveError(
            e instanceof Error ? e.message : "Speichern fehlgeschlagen.",
          ),
        )
        .finally(() => setSaving(false));
    }, 400);
  }, []);

  /** Apply a pure transform to the current data and persist (debounced). */
  const apply = useCallback(
    (fn: (d: StoryboardData) => StoryboardData) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // ── Mutations ──────────────────────────────────────────────────────
  const addCardAt = useCallback(
    (x: number, y: number) => {
      const id = `card_${newId()}`;
      apply((d) => ({
        ...d,
        cards: [
          ...d.cards,
          { id, title: "", note: "", x, y, status: "idea" },
        ],
      }));
      setSelection({ type: "card", id });
    },
    [apply],
  );

  const updateCard = useCallback(
    (id: string, patch: Partial<StoryboardCard>) =>
      apply((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    [apply],
  );

  const deleteCard = useCallback(
    (id: string) =>
      apply((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) })),
    [apply],
  );

  const addFrame = useCallback(() => {
    const id = `frame_${newId()}`;
    const { tx, ty, scale } = viewportRef.current;
    // Drop the frame near the current viewport origin, in world coordinates.
    const x = (60 - tx) / scale;
    const y = (60 - ty) / scale;
    apply((d) => ({
      ...d,
      frames: [
        ...d.frames,
        { id, title: "Gruppe", x, y, w: 320, h: 260 },
      ],
    }));
    setSelection({ type: "frame", id });
  }, [apply]);

  const updateFrame = useCallback(
    (id: string, patch: Partial<StoryboardFrame>) =>
      apply((d) => ({
        ...d,
        frames: d.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      })),
    [apply],
  );

  const deleteFrame = useCallback(
    (id: string) =>
      apply((d) => ({
        ...d,
        frames: d.frames.filter((f) => f.id !== id),
        cards: d.cards.map((c) =>
          c.frameId === id ? { ...c, frameId: null } : c,
        ),
      })),
    [apply],
  );

  const clearAll = useCallback(() => {
    apply(() => ({ cards: [], frames: [] }));
    setSelection(null);
    setConfirmClearOpen(false);
  }, [apply]);

  // ── Pan / zoom ─────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);
    setViewport((v) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      // Keep the point under the cursor stationary while zooming.
      const wx = (sx - v.tx) / v.scale;
      const wy = (sy - v.ty) / v.scale;
      return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
    });
  }, []);

  /** Pan when dragging empty canvas; deselect on a plain click. */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...viewportRef.current };
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        setViewport({ ...origin, tx: origin.tx + dx, ty: origin.ty + dy });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) setSelection(null);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [],
  );


  // ── Card / frame dragging ──────────────────────────────────────────
  const startCardDrag = useCallback(
    (e: React.PointerEvent, card: StoryboardCard) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setSelection({ type: "card", id: card.id });
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { x: card.x, y: card.y };
      const scale = viewportRef.current.scale;
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        moved = true;
        updateCard(card.id, {
          x: origin.x + dx / scale,
          y: origin.y + dy / scale,
        });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) return;
        // Re-home the card into whichever frame now contains its center.
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const cx = origin.x + dx / scale + CARD_W / 2;
        const cy = origin.y + dy / scale + CARD_H / 2;
        setData((prev) => {
          if (!prev) return prev;
          const hit = prev.frames.find((f) => frameContains(f, cx, cy));
          const frameId = hit ? hit.id : null;
          const target = prev.cards.find((c) => c.id === card.id);
          if ((target?.frameId ?? null) === frameId) return prev;
          const next = {
            ...prev,
            cards: prev.cards.map((c) =>
              c.id === card.id ? { ...c, frameId } : c,
            ),
          };
          scheduleSave(next);
          return next;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [updateCard, scheduleSave],
  );

  const startFrameDrag = useCallback(
    (e: React.PointerEvent, frame: StoryboardFrame) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setSelection({ type: "frame", id: frame.id });
      const startX = e.clientX;
      const startY = e.clientY;
      const scale = viewportRef.current.scale;
      const frameOrigin = { x: frame.x, y: frame.y };
      let moved = false;
      let memberOrigins: Array<{ id: string; x: number; y: number }> = [];
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          setData((prev) => {
            memberOrigins = (prev?.cards ?? [])
              .filter((c) => c.frameId === frame.id)
              .map((c) => ({ id: c.id, x: c.x, y: c.y }));
            return prev;
          });
        }
        const wdx = dx / scale;
        const wdy = dy / scale;
        setData((prev) => {
          if (!prev) return prev;
          const moves = new Map(memberOrigins.map((m) => [m.id, m]));
          const next = {
            ...prev,
            frames: prev.frames.map((f) =>
              f.id === frame.id
                ? { ...f, x: frameOrigin.x + wdx, y: frameOrigin.y + wdy }
                : f,
            ),
            cards: prev.cards.map((c) => {
              const m = moves.get(c.id);
              return m ? { ...c, x: m.x + wdx, y: m.y + wdy } : c;
            }),
          };
          return next;
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (moved) setData((prev) => (prev ? (scheduleSave(prev), prev) : prev));
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [scheduleSave],
  );

  const startFrameResize = useCallback(
    (e: React.PointerEvent, frame: StoryboardFrame) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const scale = viewportRef.current.scale;
      const origin = { w: frame.w, h: frame.h };
      const onMove = (ev: PointerEvent) => {
        const wdx = (ev.clientX - startX) / scale;
        const wdy = (ev.clientY - startY) / scale;
        updateFrame(frame.id, {
          w: Math.max(160, origin.w + wdx),
          h: Math.max(140, origin.h + wdy),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [updateFrame],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "F2" && selection?.type === "card") {
        e.preventDefault();
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, selection]);

  const cardVisible = useCallback(
    (card: StoryboardCard): boolean => {
      const status = card.status ?? "idea";
      if (status === "discarded" && !showDiscarded) return false;
      if (bookFilter === "all") return true;
      const assigned = card.bookPaths ?? [];
      if (bookFilter === "unassigned") return assigned.length === 0;
      return assigned.includes(bookFilter);
    },
    [bookFilter, showDiscarded],
  );

  const visibleCards = useMemo(
    () => (data?.cards ?? []).filter(cardVisible),
    [data, cardVisible],
  );
  const discardedCount = useMemo(
    () => (data?.cards ?? []).filter((c) => (c.status ?? "idea") === "discarded")
      .length,
    [data],
  );

  const selectedCard =
    selection?.type === "card"
      ? data?.cards.find((c) => c.id === selection.id)
      : undefined;
  const selectedFrame =
    selection?.type === "frame"
      ? data?.frames.find((f) => f.id === selection.id)
      : undefined;

  if (!open) return null;

  const isEmpty =
    !loading && !error && data !== null && data.cards.length === 0;

  const isWindow = variant === "window";

  return (
    <div
      className={isWindow ? "storyboard-window" : "storyboard-overlay"}
      onClick={isWindow ? undefined : onClose}
    >
      <div
        className={`storyboard-dialog ${isWindow ? "storyboard-dialog--full" : ""}`}
        role="dialog"
        aria-labelledby="storyboard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="storyboard-header">
          <div className="storyboard-header-left">
            <StickyNote size={18} className="storyboard-header-icon" aria-hidden />
            <h2 id="storyboard-title" className="storyboard-title">
              Pinnwand
            </h2>
            {saving && <span className="storyboard-save-state">speichert…</span>}
            {saveError && (
              <span className="storyboard-save-state storyboard-save-state--err">
                {saveError}
              </span>
            )}
          </div>
          <div className="storyboard-header-actions">
            <button
              type="button"
              className="storyboard-icon-btn"
              onClick={load}
              disabled={loading}
              title="Neu laden"
            >
              <RefreshCw size={15} className={loading ? "storyboard-spin" : ""} />
            </button>
            <button
              type="button"
              className="storyboard-icon-btn"
              onClick={onClose}
              title="Schließen"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="storyboard-toolbar">
          <button
            type="button"
            className="storyboard-btn"
            onClick={() => {
              const { tx, ty, scale } = viewportRef.current;
              addCardAt((80 - tx) / scale, (80 - ty) / scale);
            }}
          >
            <Plus size={14} /> Karte
          </button>
          <button type="button" className="storyboard-btn" onClick={addFrame}>
            <Square size={14} /> Gruppe
          </button>

          <div className="storyboard-filterbar">
            <button
              type="button"
              className={`storyboard-chip ${bookFilter === "all" ? "storyboard-chip--active" : ""}`}
              onClick={() => setBookFilter("all")}
            >
              Alle
            </button>
            {books.map((b) => (
              <button
                key={b.path}
                type="button"
                className={`storyboard-chip ${bookFilter === b.path ? "storyboard-chip--active" : ""}`}
                onClick={() => setBookFilter(b.path)}
              >
                {b.name}
              </button>
            ))}
            <button
              type="button"
              className={`storyboard-chip ${bookFilter === "unassigned" ? "storyboard-chip--active" : ""}`}
              onClick={() => setBookFilter("unassigned")}
            >
              Ohne Zuordnung
            </button>
          </div>

          {discardedCount > 0 && (
            <button
              type="button"
              className={`storyboard-btn ${showDiscarded ? "storyboard-btn--active" : ""}`}
              onClick={() => setShowDiscarded((v) => !v)}
              title="Verworfene Karten ein-/ausblenden"
            >
              <Undo2 size={14} /> Verworfen ({discardedCount})
            </button>
          )}
          <button
            type="button"
            className="storyboard-btn storyboard-btn--danger-outline"
            onClick={() => setConfirmClearOpen(true)}
            disabled={!data || (data.cards.length === 0 && data.frames.length === 0)}
            title="Alle Karten und Gruppen entfernen"
          >
            <Eraser size={14} /> Alles löschen
          </button>
          <span className="storyboard-hint">
            Ziehen = verschieben · Rad = Zoom
          </span>
        </div>

        <div className="storyboard-body">
          <div
            className="storyboard-canvas"
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onWheel={onWheel}
          >
            {loading && <div className="storyboard-status">Lädt…</div>}
            {error && <div className="storyboard-status storyboard-status--err">{error}</div>}
            {isEmpty && (
              <div className="storyboard-empty">
                Noch keine Karten. Button „Karte" oben legt die erste an.
              </div>
            )}
            <div
              className="storyboard-world"
              style={{
                transform: `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`,
              }}
            >
              {data?.frames.map((f) => (
                <div
                  key={f.id}
                  className={`storyboard-frame ${selection?.type === "frame" && selection.id === f.id ? "storyboard-frame--sel" : ""}`}
                  style={{
                    left: f.x,
                    top: f.y,
                    width: f.w,
                    height: f.h,
                    borderColor: f.color,
                  }}
                  onPointerDown={(e) => startFrameDrag(e, f)}
                >
                  <span className="storyboard-frame-title">{f.title}</span>
                  <span
                    className="storyboard-frame-resize"
                    onPointerDown={(e) => startFrameResize(e, f)}
                  />
                </div>
              ))}
              {visibleCards.map((c) => {
                const status = c.status ?? "idea";
                const sel =
                  selection?.type === "card" && selection.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={`storyboard-card storyboard-card--${status} ${sel ? "storyboard-card--sel" : ""}`}
                    style={{
                      left: c.x,
                      top: c.y,
                      width: CARD_W,
                      minHeight: CARD_H,
                      borderTopColor: c.color ?? "var(--accent)",
                    }}
                    onPointerDown={(e) => startCardDrag(e, c)}
                  >
                    <div className="storyboard-card-title">
                      {c.title || <span className="storyboard-card-placeholder">Ohne Titel</span>}
                    </div>
                    {c.note && <div className="storyboard-card-note">{c.note}</div>}
                    {(c.tags?.length || (c.bookPaths?.length ?? 0) > 0) && (
                      <div className="storyboard-card-tags">
                        {c.tags?.map((t) => (
                          <span key={t} className="storyboard-tag">
                            {t}
                          </span>
                        ))}
                        {(c.bookPaths ?? []).map((bp) => (
                          <span key={bp} className="storyboard-tag storyboard-tag--book">
                            {books.find((b) => b.path === bp)?.name ?? bp}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(selectedCard || selectedFrame) && (
            <div className="storyboard-sidebar">
              {selectedCard && (
                <CardEditor
                  key={selectedCard.id}
                  card={selectedCard}
                  books={books}
                  titleRef={titleInputRef}
                  onChange={(patch) => updateCard(selectedCard.id, patch)}
                  onDelete={() => {
                    deleteCard(selectedCard.id);
                    setSelection(null);
                  }}
                />
              )}
              {selectedFrame && (
                <FrameEditor
                  key={selectedFrame.id}
                  frame={selectedFrame}
                  onChange={(patch) => updateFrame(selectedFrame.id, patch)}
                  onDelete={() => {
                    deleteFrame(selectedFrame.id);
                    setSelection(null);
                  }}
                />
              )}
            </div>
          )}
        </div>

        {confirmClearOpen && (
          <div
            className="storyboard-confirm-overlay"
            onClick={() => setConfirmClearOpen(false)}
          >
            <div
              className="storyboard-confirm-dialog"
              role="alertdialog"
              aria-labelledby="storyboard-confirm-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="storyboard-confirm-title" className="storyboard-confirm-title">
                Wirklich alles löschen?
              </h3>
              <p className="storyboard-confirm-text">
                Entfernt alle {data?.cards.length ?? 0} Karten und {data?.frames.length ?? 0}{" "}
                Gruppen von der Pinnwand. Das kann nicht rückgängig gemacht werden.
              </p>
              <div className="storyboard-confirm-actions">
                <button
                  type="button"
                  className="storyboard-btn"
                  onClick={() => setConfirmClearOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="storyboard-btn storyboard-btn--danger-solid"
                  onClick={clearAll}
                >
                  <Eraser size={14} /> Alles löschen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SwatchRow({
  value,
  onPick,
}: {
  value?: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className="storyboard-swatches">
      {SWATCHES.map((s) => (
        <button
          key={s}
          type="button"
          className={`storyboard-swatch ${value === s ? "storyboard-swatch--active" : ""}`}
          style={{ background: s }}
          onClick={() => onPick(s)}
          aria-label={`Farbe ${s}`}
        />
      ))}
    </div>
  );
}

interface BookRef {
  path: string;
  name: string;
}

function CardEditor({
  card,
  books,
  titleRef,
  onChange,
  onDelete,
}: {
  card: StoryboardCard;
  books: BookRef[];
  titleRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<StoryboardCard>) => void;
  onDelete: () => void;
}) {
  const tagsText = (card.tags ?? []).join(", ");
  const assigned = new Set(card.bookPaths ?? []);

  const toggleBook = (path: string) => {
    const next = new Set(assigned);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange({ bookPaths: [...next] });
  };

  return (
    <div className="storyboard-editor">
      <label className="storyboard-field">
        <span className="storyboard-label">Titel</span>
        <input
          ref={titleRef}
          type="text"
          className="storyboard-input"
          value={card.title}
          placeholder="Idee benennen…"
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <label className="storyboard-field">
        <span className="storyboard-label">Notiz</span>
        <textarea
          className="storyboard-input storyboard-textarea"
          value={card.note ?? ""}
          rows={5}
          placeholder="Was ist die Idee?"
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </label>
      <label className="storyboard-field">
        <span className="storyboard-label">Status</span>
        <select
          className="storyboard-input"
          value={card.status ?? "idea"}
          onChange={(e) =>
            onChange({ status: e.target.value as StoryboardCardStatus })
          }
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="storyboard-field">
        <span className="storyboard-label">Tags (kommagetrennt)</span>
        <input
          type="text"
          className="storyboard-input"
          value={tagsText}
          placeholder="z.B. Wendepunkt, offene Frage"
          onChange={(e) =>
            onChange({
              tags: e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div className="storyboard-field">
        <span className="storyboard-label">Farbe</span>
        <SwatchRow value={card.color} onPick={(color) => onChange({ color })} />
      </div>
      {books.length > 0 && (
        <div className="storyboard-field">
          <span className="storyboard-label">Bücher</span>
          <div className="storyboard-book-list">
            {books.map((b) => (
              <label key={b.path} className="storyboard-check">
                <input
                  type="checkbox"
                  checked={assigned.has(b.path)}
                  onChange={() => toggleBook(b.path)}
                />
                {b.name}
              </label>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="storyboard-btn storyboard-btn--danger"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Karte löschen
      </button>
    </div>
  );
}

function FrameEditor({
  frame,
  onChange,
  onDelete,
}: {
  frame: StoryboardFrame;
  onChange: (patch: Partial<StoryboardFrame>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="storyboard-editor">
      <label className="storyboard-field">
        <span className="storyboard-label">Gruppenname</span>
        <input
          type="text"
          className="storyboard-input"
          value={frame.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </label>
      <div className="storyboard-field">
        <span className="storyboard-label">Farbe</span>
        <SwatchRow value={frame.color} onPick={(color) => onChange({ color })} />
      </div>
      <button
        type="button"
        className="storyboard-btn storyboard-btn--danger"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Gruppe löschen
      </button>
    </div>
  );
}

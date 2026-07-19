import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StickyNote,
  RefreshCw,
  X,
  Plus,
  Square,
  Trash2,
  Undo2,
  Redo2,
  Eraser,
  Copy,
  Search,
  Maximize2,
} from "lucide-react";
import { storyboardApi } from "../../shared/api.ts";
import { useBookProjects } from "../../shared/hooks/useBookProjects.ts";
import type {
  StoryboardCard,
  StoryboardCardStatus,
  StoryboardData,
  StoryboardEdge,
  StoryboardFrame,
} from "../../shared/types.ts";
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
const HISTORY_LIMIT = 80;

/** Swatches for cards, frames and edges — muted tones that sit calmly on parchment. */
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

type Rect = { x: number; y: number; w: number; h: number };

function cardRect(c: StoryboardCard): Rect {
  return { x: c.x, y: c.y, w: c.w ?? CARD_W, h: c.h ?? CARD_H };
}

function rectContains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Point where the line from a rect's center toward (tx,ty) exits the rect. */
function edgeAnchor(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (r.w / 2), Math.abs(dy) / (r.h / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

type Viewport = { tx: number; ty: number; scale: number };
type SelKind = "card" | "frame" | "edge";
type SelItem = { type: SelKind; id: string };
type BookFilter = "all" | "unassigned" | string;
type Marquee = { x0: number; y0: number; x1: number; y1: number } | null;
type Linking = { fromId: string; x: number; y: number } | null;

/**
 * Pinboard workspace: free-floating story-idea cards on a pan/zoom canvas — the
 * space for developing a book/series and collecting ideas, decoupled from the
 * manuscript and wiki. Cards can be connected with undirected links, grouped in
 * frames, multi-selected, resized, duplicated, searched and undone/redone.
 * Editing writes through to .assistant/storyboard/ (debounced autosave).
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

  const [selection, setSelection] = useState<SelItem[]>([]);
  const [bookFilter, setBookFilter] = useState<BookFilter>("all");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [marquee, setMarquee] = useState<Marquee>(null);
  const [linking, setLinking] = useState<Linking>(null);
  const [viewport, setViewport] = useState<Viewport>({ tx: 40, ty: 40, scale: 1 });

  const books = useBookProjects(projectPath).filter((b) => b.subprojectType);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<number | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const dataRef = useRef<StoryboardData | null>(data);
  dataRef.current = data;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Undo/redo history holds full board snapshots at gesture boundaries. Text
  // edits inside the sidebar are intentionally not tracked per keystroke.
  const past = useRef<StoryboardData[]>([]);
  const future = useRef<StoryboardData[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await storyboardApi.read());
      setSelection([]);
      past.current = [];
      future.current = [];
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

  /** Snapshot the current board into the undo stack (call before a mutation). */
  const pushHistory = useCallback(() => {
    if (!dataRef.current) return;
    past.current.push(dataRef.current);
    if (past.current.length > HISTORY_LIMIT) past.current.shift();
    future.current = [];
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

  /** History-tracked mutation for discrete actions (add/delete/duplicate/…). */
  const commit = useCallback(
    (fn: (d: StoryboardData) => StoryboardData) => {
      pushHistory();
      apply(fn);
    },
    [pushHistory, apply],
  );

  const undo = useCallback(() => {
    if (!past.current.length || !dataRef.current) return;
    const prev = past.current.pop() as StoryboardData;
    future.current.push(dataRef.current);
    setData(prev);
    scheduleSave(prev);
    setSelection([]);
  }, [scheduleSave]);

  const redo = useCallback(() => {
    if (!future.current.length || !dataRef.current) return;
    const next = future.current.pop() as StoryboardData;
    past.current.push(dataRef.current);
    setData(next);
    scheduleSave(next);
    setSelection([]);
  }, [scheduleSave]);

  // ── Coordinate helpers ─────────────────────────────────────────────
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const v = viewportRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.tx) / v.scale,
      y: (clientY - (rect?.top ?? 0) - v.ty) / v.scale,
    };
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────
  const addCardAt = useCallback(
    (x: number, y: number) => {
      const id = `card_${newId()}`;
      commit((d) => ({
        ...d,
        cards: [...d.cards, { id, title: "", note: "", x, y, status: "idea" }],
      }));
      setSelection([{ type: "card", id }]);
    },
    [commit],
  );

  const updateCard = useCallback(
    (id: string, patch: Partial<StoryboardCard>) =>
      apply((d) => ({
        ...d,
        cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    [apply],
  );

  const addFrame = useCallback(() => {
    const id = `frame_${newId()}`;
    const { tx, ty, scale } = viewportRef.current;
    const x = (60 - tx) / scale;
    const y = (60 - ty) / scale;
    commit((d) => ({
      ...d,
      frames: [...d.frames, { id, title: "Gruppe", x, y, w: 320, h: 260 }],
    }));
    setSelection([{ type: "frame", id }]);
  }, [commit]);

  const updateFrame = useCallback(
    (id: string, patch: Partial<StoryboardFrame>) =>
      apply((d) => ({
        ...d,
        frames: d.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      })),
    [apply],
  );

  const updateEdge = useCallback(
    (id: string, patch: Partial<StoryboardEdge>) =>
      apply((d) => ({
        ...d,
        edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),
    [apply],
  );

  const addEdge = useCallback(
    (a: string, b: string) => {
      if (a === b) return;
      commit((d) => {
        const exists = d.edges.some(
          (e) => (e.a === a && e.b === b) || (e.a === b && e.b === a),
        );
        if (exists) return d;
        return { ...d, edges: [...d.edges, { id: `edge_${newId()}`, a, b }] };
      });
    },
    [commit],
  );

  const duplicateSelection = useCallback(() => {
    const ids = selectionRef.current
      .filter((s) => s.type === "card")
      .map((s) => s.id);
    if (!ids.length) return;
    const created: SelItem[] = [];
    commit((d) => {
      const set = new Set(ids);
      const clones = d.cards
        .filter((c) => set.has(c.id))
        .map((c) => {
          const id = `card_${newId()}`;
          created.push({ type: "card", id });
          return { ...c, id, x: c.x + 24, y: c.y + 24, frameId: null };
        });
      return { ...d, cards: [...d.cards, ...clones] };
    });
    if (created.length) setSelection(created);
  }, [commit]);

  const deleteSelection = useCallback(() => {
    const cur = selectionRef.current;
    if (!cur.length) return;
    const cardIds = new Set(
      cur.filter((s) => s.type === "card").map((s) => s.id),
    );
    const frameIds = new Set(
      cur.filter((s) => s.type === "frame").map((s) => s.id),
    );
    const edgeIds = new Set(
      cur.filter((s) => s.type === "edge").map((s) => s.id),
    );
    commit((d) => ({
      cards: d.cards
        .filter((c) => !cardIds.has(c.id))
        .map((c) =>
          c.frameId && frameIds.has(c.frameId) ? { ...c, frameId: null } : c,
        ),
      frames: d.frames.filter((f) => !frameIds.has(f.id)),
      edges: d.edges.filter(
        (e) =>
          !edgeIds.has(e.id) && !cardIds.has(e.a) && !cardIds.has(e.b),
      ),
    }));
    setSelection([]);
  }, [commit]);

  const applyColorToSelection = useCallback(
    (color: string) => {
      const cardIds = new Set(
        selectionRef.current
          .filter((s) => s.type === "card")
          .map((s) => s.id),
      );
      if (!cardIds.size) return;
      commit((d) => ({
        ...d,
        cards: d.cards.map((c) => (cardIds.has(c.id) ? { ...c, color } : c)),
      }));
    },
    [commit],
  );

  const clearAll = useCallback(() => {
    commit(() => ({ cards: [], frames: [], edges: [] }));
    setSelection([]);
    setConfirmClearOpen(false);
  }, [commit]);

  // ── View controls ──────────────────────────────────────────────────
  const resetView = useCallback(
    () => setViewport({ tx: 40, ty: 40, scale: 1 }),
    [],
  );

  const fitView = useCallback(() => {
    const d = dataRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const rects: Rect[] = [
      ...d.cards.map(cardRect),
      ...d.frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
    ];
    if (!rects.length) return resetView();
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    const pad = 60;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const scale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min((rect.width - pad * 2) / bw, (rect.height - pad * 2) / bh),
      ),
    );
    setViewport({
      scale,
      tx: (rect.width - bw * scale) / 2 - minX * scale,
      ty: (rect.height - bh * scale) / 2 - minY * scale,
    });
  }, [resetView]);

  const centerOn = useCallback((c: StoryboardCard) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const r = cardRect(c);
    setViewport((v) => ({
      ...v,
      tx: rect.width / 2 - (r.x + r.w / 2) * v.scale,
      ty: rect.height / 2 - (r.y + r.h / 2) * v.scale,
    }));
  }, []);

  // ── Pan / zoom ─────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = e.clientX - (rect?.left ?? 0);
    const sy = e.clientY - (rect?.top ?? 0);
    setViewport((v) => {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const wx = (sx - v.tx) / v.scale;
      const wy = (sy - v.ty) / v.scale;
      return { scale, tx: sx - wx * scale, ty: sy - wy * scale };
    });
  }, []);

  /** Shift+drag on empty canvas = marquee select; plain drag = pan. */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;

      if (e.shiftKey) {
        const start = toWorld(startX, startY);
        let moved = false;
        const onMove = (ev: PointerEvent) => {
          const cur = toWorld(ev.clientX, ev.clientY);
          if (
            !moved &&
            Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD
          )
            return;
          moved = true;
          setMarquee({ x0: start.x, y0: start.y, x1: cur.x, y1: cur.y });
        };
        const onUp = (ev: PointerEvent) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          setMarquee(null);
          if (!moved) return;
          const end = toWorld(ev.clientX, ev.clientY);
          const box: Rect = {
            x: Math.min(start.x, end.x),
            y: Math.min(start.y, end.y),
            w: Math.abs(end.x - start.x),
            h: Math.abs(end.y - start.y),
          };
          const hits = (dataRef.current?.cards ?? [])
            .filter((c) => rectsOverlap(cardRect(c), box))
            .map((c) => ({ type: "card" as const, id: c.id }));
          setSelection(hits);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return;
      }

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
        if (!moved) setSelection([]);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toWorld],
  );

  // ── Card / frame dragging ──────────────────────────────────────────
  const startCardDrag = useCallback(
    (e: React.PointerEvent, card: StoryboardCard) => {
      e.stopPropagation();
      if (e.button !== 0) return;

      if (e.shiftKey) {
        setSelection((prev) => {
          const has = prev.some((s) => s.type === "card" && s.id === card.id);
          return has
            ? prev.filter((s) => !(s.type === "card" && s.id === card.id))
            : [...prev, { type: "card", id: card.id }];
        });
        return;
      }

      const cur = selectionRef.current;
      const selectedCardIds = cur
        .filter((s) => s.type === "card")
        .map((s) => s.id);
      const inMulti =
        selectedCardIds.length > 1 && selectedCardIds.includes(card.id);
      const dragIds = inMulti ? selectedCardIds : [card.id];
      if (!inMulti) setSelection([{ type: "card", id: card.id }]);

      const startX = e.clientX;
      const startY = e.clientY;
      const scale = viewportRef.current.scale;
      const dragSet = new Set(dragIds);
      const origins = new Map(
        (dataRef.current?.cards ?? [])
          .filter((c) => dragSet.has(c.id))
          .map((c) => [c.id, { x: c.x, y: c.y }]),
      );
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          pushHistory();
        }
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cards: prev.cards.map((c) => {
              const o = origins.get(c.id);
              return o
                ? { ...c, x: o.x + dx / scale, y: o.y + dy / scale }
                : c;
            }),
          };
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!moved) return;
        // Re-home each dragged card into whichever frame now holds its center.
        setData((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            cards: prev.cards.map((c) => {
              if (!dragSet.has(c.id)) return c;
              const r = cardRect(c);
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              const hit = prev.frames.find((f) =>
                rectContains({ x: f.x, y: f.y, w: f.w, h: f.h }, cx, cy),
              );
              const frameId = hit ? hit.id : null;
              return (c.frameId ?? null) === frameId ? c : { ...c, frameId };
            }),
          };
          scheduleSave(next);
          return next;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pushHistory, scheduleSave],
  );

  const startCardResize = useCallback(
    (e: React.PointerEvent, card: StoryboardCard) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const scale = viewportRef.current.scale;
      const origin = { w: card.w ?? CARD_W, h: card.h ?? CARD_H };
      let started = false;
      const onMove = (ev: PointerEvent) => {
        if (!started) {
          started = true;
          pushHistory();
        }
        updateCard(card.id, {
          w: Math.max(140, origin.w + (ev.clientX - startX) / scale),
          h: Math.max(90, origin.h + (ev.clientY - startY) / scale),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pushHistory, updateCard],
  );

  const startLink = useCallback(
    (e: React.PointerEvent, card: StoryboardCard) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const start = toWorld(e.clientX, e.clientY);
      setLinking({ fromId: card.id, x: start.x, y: start.y });
      const onMove = (ev: PointerEvent) => {
        const p = toWorld(ev.clientX, ev.clientY);
        setLinking({ fromId: card.id, x: p.x, y: p.y });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setLinking(null);
        const p = toWorld(ev.clientX, ev.clientY);
        const target = (dataRef.current?.cards ?? []).find(
          (c) => c.id !== card.id && rectContains(cardRect(c), p.x, p.y),
        );
        if (target) addEdge(card.id, target.id);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [toWorld, addEdge],
  );

  const startFrameDrag = useCallback(
    (e: React.PointerEvent, frame: StoryboardFrame) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setSelection([{ type: "frame", id: frame.id }]);
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
          pushHistory();
          memberOrigins = (dataRef.current?.cards ?? [])
            .filter((c) => c.frameId === frame.id)
            .map((c) => ({ id: c.id, x: c.x, y: c.y }));
        }
        const wdx = dx / scale;
        const wdy = dy / scale;
        const moves = new Map(memberOrigins.map((m) => [m.id, m]));
        setData((prev) => {
          if (!prev) return prev;
          return {
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
    [pushHistory, scheduleSave],
  );

  const startFrameResize = useCallback(
    (e: React.PointerEvent, frame: StoryboardFrame) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const scale = viewportRef.current.scale;
      const origin = { w: frame.w, h: frame.h };
      let started = false;
      const onMove = (ev: PointerEvent) => {
        if (!started) {
          started = true;
          pushHistory();
        }
        updateFrame(frame.id, {
          w: Math.max(160, origin.w + (ev.clientX - startX) / scale),
          h: Math.max(140, origin.h + (ev.clientY - startY) / scale),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pushHistory, updateFrame],
  );

  // ── Keyboard ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectionRef.current.length) {
          e.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (
        e.key === "F2" &&
        selectionRef.current.length === 1 &&
        selectionRef.current[0].type === "card"
      ) {
        e.preventDefault();
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, undo, redo, duplicateSelection, deleteSelection]);

  // ── Derived ────────────────────────────────────────────────────────
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
  const visibleCardMap = useMemo(
    () => new Map(visibleCards.map((c) => [c.id, c])),
    [visibleCards],
  );
  const visibleEdges = useMemo(
    () =>
      (data?.edges ?? []).filter(
        (e) => visibleCardMap.has(e.a) && visibleCardMap.has(e.b),
      ),
    [data, visibleCardMap],
  );
  const discardedCount = useMemo(
    () => (data?.cards ?? []).filter((c) => (c.status ?? "idea") === "discarded")
      .length,
    [data],
  );

  const q = query.trim().toLowerCase();
  const cardMatches = useCallback(
    (c: StoryboardCard): boolean => {
      if (!q) return false;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.note ?? "").toLowerCase().includes(q) ||
        (c.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    },
    [q],
  );
  const matchCount = useMemo(
    () => (q ? visibleCards.filter(cardMatches).length : 0),
    [q, visibleCards, cardMatches],
  );

  const onSearchEnter = useCallback(() => {
    if (!q) return;
    const first = visibleCards.find(cardMatches);
    if (first) {
      centerOn(first);
      setSelection([{ type: "card", id: first.id }]);
    }
  }, [q, visibleCards, cardMatches, centerOn]);

  const isSel = useCallback(
    (type: SelKind, id: string) =>
      selection.some((s) => s.type === type && s.id === id),
    [selection],
  );

  const singleCard =
    selection.length === 1 && selection[0].type === "card"
      ? data?.cards.find((c) => c.id === selection[0].id)
      : undefined;
  const singleFrame =
    selection.length === 1 && selection[0].type === "frame"
      ? data?.frames.find((f) => f.id === selection[0].id)
      : undefined;
  const singleEdge =
    selection.length === 1 && selection[0].type === "edge"
      ? data?.edges.find((e) => e.id === selection[0].id)
      : undefined;
  const multiCount = selection.length > 1 ? selection.length : 0;

  if (!open) return null;

  const isEmpty =
    !loading && !error && data !== null && data.cards.length === 0;
  const isWindow = variant === "window";
  const hasSelectedCards = selection.some((s) => s.type === "card");

  const linkFrom = linking
    ? visibleCardMap.get(linking.fromId)
    : undefined;

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
          <button
            type="button"
            className="storyboard-btn"
            onClick={duplicateSelection}
            disabled={!hasSelectedCards}
            title="Auswahl duplizieren (Strg+D)"
          >
            <Copy size={14} /> Duplizieren
          </button>

          <div className="storyboard-tool-group">
            <button
              type="button"
              className="storyboard-icon-btn"
              onClick={undo}
              disabled={!past.current.length}
              title="Rückgängig (Strg+Z)"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              className="storyboard-icon-btn"
              onClick={redo}
              disabled={!future.current.length}
              title="Wiederholen (Strg+Umschalt+Z)"
            >
              <Redo2 size={15} />
            </button>
            <button
              type="button"
              className="storyboard-icon-btn"
              onClick={fitView}
              title="Alles einpassen"
            >
              <Maximize2 size={15} />
            </button>
          </div>

          <label className="storyboard-search">
            <Search size={13} className="storyboard-search-icon" aria-hidden />
            <input
              type="text"
              className="storyboard-search-input"
              value={query}
              placeholder="Suchen…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchEnter();
              }}
            />
            {q && (
              <span className="storyboard-search-count">{matchCount}</span>
            )}
          </label>

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
            disabled={
              !data ||
              (data.cards.length === 0 &&
                data.frames.length === 0 &&
                data.edges.length === 0)
            }
            title="Alle Karten, Gruppen und Verbindungen entfernen"
          >
            <Eraser size={14} /> Alles löschen
          </button>
          <span className="storyboard-hint">
            Ziehen = verschieben · Rad = Zoom · Umschalt+Ziehen = auswählen · Punkt
            am Rand = verbinden
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
              <svg className="storyboard-edges" aria-hidden>
                {visibleEdges.map((e) => {
                  const a = visibleCardMap.get(e.a) as StoryboardCard;
                  const b = visibleCardMap.get(e.b) as StoryboardCard;
                  const ra = cardRect(a);
                  const rb = cardRect(b);
                  const cbx = rb.x + rb.w / 2;
                  const cby = rb.y + rb.h / 2;
                  const cax = ra.x + ra.w / 2;
                  const cay = ra.y + ra.h / 2;
                  const p1 = edgeAnchor(ra, cbx, cby);
                  const p2 = edgeAnchor(rb, cax, cay);
                  const sel = isSel("edge", e.id);
                  return (
                    <g key={e.id}>
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        className="storyboard-edge-hit"
                        onPointerDown={(ev) => {
                          ev.stopPropagation();
                          setSelection([{ type: "edge", id: e.id }]);
                        }}
                      />
                      <line
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        className={`storyboard-edge ${sel ? "storyboard-edge--sel" : ""}`}
                        style={e.color ? { stroke: e.color } : undefined}
                      />
                    </g>
                  );
                })}
                {linking && linkFrom && (
                  <line
                    x1={
                      edgeAnchor(cardRect(linkFrom), linking.x, linking.y).x
                    }
                    y1={
                      edgeAnchor(cardRect(linkFrom), linking.x, linking.y).y
                    }
                    x2={linking.x}
                    y2={linking.y}
                    className="storyboard-edge storyboard-edge--draft"
                  />
                )}
              </svg>

              {visibleEdges.map((e) => {
                if (!e.label) return null;
                const a = visibleCardMap.get(e.a) as StoryboardCard;
                const b = visibleCardMap.get(e.b) as StoryboardCard;
                const ra = cardRect(a);
                const rb = cardRect(b);
                const mx = (ra.x + ra.w / 2 + rb.x + rb.w / 2) / 2;
                const my = (ra.y + ra.h / 2 + rb.y + rb.h / 2) / 2;
                return (
                  <div
                    key={`lbl_${e.id}`}
                    className="storyboard-edge-label"
                    style={{ left: mx, top: my }}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      setSelection([{ type: "edge", id: e.id }]);
                    }}
                  >
                    {e.label}
                  </div>
                );
              })}

              {data?.frames.map((f) => (
                <div
                  key={f.id}
                  className={`storyboard-frame ${isSel("frame", f.id) ? "storyboard-frame--sel" : ""}`}
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
                const sel = isSel("card", c.id);
                const dim = q ? !cardMatches(c) : false;
                const hit = q ? cardMatches(c) : false;
                return (
                  <div
                    key={c.id}
                    className={`storyboard-card storyboard-card--${status} ${sel ? "storyboard-card--sel" : ""} ${dim ? "storyboard-card--dim" : ""} ${hit ? "storyboard-card--hit" : ""}`}
                    style={{
                      left: c.x,
                      top: c.y,
                      width: c.w ?? CARD_W,
                      minHeight: c.h ?? CARD_H,
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
                    <span
                      className="storyboard-card-linkport"
                      title="Verbinden — auf eine andere Karte ziehen"
                      onPointerDown={(e) => startLink(e, c)}
                    />
                    <span
                      className="storyboard-card-resize"
                      onPointerDown={(e) => startCardResize(e, c)}
                    />
                  </div>
                );
              })}

              {marquee && (
                <div
                  className="storyboard-marquee"
                  style={{
                    left: Math.min(marquee.x0, marquee.x1),
                    top: Math.min(marquee.y0, marquee.y1),
                    width: Math.abs(marquee.x1 - marquee.x0),
                    height: Math.abs(marquee.y1 - marquee.y0),
                  }}
                />
              )}
            </div>
          </div>

          {(singleCard || singleFrame || singleEdge || multiCount > 0) && (
            <div className="storyboard-sidebar">
              {singleCard && (
                <CardEditor
                  key={singleCard.id}
                  card={singleCard}
                  books={books}
                  titleRef={titleInputRef}
                  onChange={(patch) => updateCard(singleCard.id, patch)}
                  onDelete={deleteSelection}
                />
              )}
              {singleFrame && (
                <FrameEditor
                  key={singleFrame.id}
                  frame={singleFrame}
                  onChange={(patch) => updateFrame(singleFrame.id, patch)}
                  onDelete={deleteSelection}
                />
              )}
              {singleEdge && (
                <EdgeEditor
                  key={singleEdge.id}
                  edge={singleEdge}
                  onChange={(patch) => updateEdge(singleEdge.id, patch)}
                  onDelete={deleteSelection}
                />
              )}
              {multiCount > 0 && (
                <div className="storyboard-editor">
                  <span className="storyboard-label">
                    {multiCount} ausgewählt
                  </span>
                  {hasSelectedCards && (
                    <div className="storyboard-field">
                      <span className="storyboard-label">Farbe</span>
                      <SwatchRow onPick={applyColorToSelection} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="storyboard-btn"
                    onClick={duplicateSelection}
                    disabled={!hasSelectedCards}
                  >
                    <Copy size={14} /> Duplizieren
                  </button>
                  <button
                    type="button"
                    className="storyboard-btn storyboard-btn--danger"
                    onClick={deleteSelection}
                  >
                    <Trash2 size={14} /> Auswahl löschen
                  </button>
                </div>
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
                Entfernt alle {data?.cards.length ?? 0} Karten, {data?.frames.length ?? 0}{" "}
                Gruppen und {data?.edges.length ?? 0} Verbindungen von der Pinnwand.
                Das kann nicht rückgängig gemacht werden.
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

function EdgeEditor({
  edge,
  onChange,
  onDelete,
}: {
  edge: StoryboardEdge;
  onChange: (patch: Partial<StoryboardEdge>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="storyboard-editor">
      <label className="storyboard-field">
        <span className="storyboard-label">Beschriftung</span>
        <input
          type="text"
          className="storyboard-input"
          value={edge.label ?? ""}
          placeholder="z.B. hängt zusammen, Kontrast"
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </label>
      <div className="storyboard-field">
        <span className="storyboard-label">Farbe</span>
        <SwatchRow value={edge.color} onPick={(color) => onChange({ color })} />
      </div>
      <button
        type="button"
        className="storyboard-btn storyboard-btn--danger"
        onClick={onDelete}
      >
        <Trash2 size={14} /> Verbindung löschen
      </button>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Waypoints, RefreshCw, X, Plus, Link2, Trash2, ChevronUp, ChevronDown, Check } from "lucide-react";
import { arcApi } from "../../api.ts";
import type {
  Arc,
  ArcData,
  ArcKind,
  ArcLink,
  ArcLinkType,
  Beat,
} from "../../types.ts";

interface ArcTimelineProps {
  open: boolean;
  onClose: () => void;
}

/** Default lane color when an arc carries no explicit color. */
const KIND_COLOR: Record<ArcKind, string> = {
  story: "#5F5E5A",
  character: "#1D9E75",
  relationship: "#D85A30",
};

const KIND_LABEL: Record<ArcKind, string> = {
  story: "Story-Arc",
  character: "Figuren-Arc",
  relationship: "Beziehung",
};

/** Visual encoding for each cause→effect edge type. */
const LINK_STYLE: Record<
  ArcLinkType,
  { color: string; dashed: boolean; label: string }
> = {
  enables: { color: "#639922", dashed: false, label: "ermöglicht" },
  forces: { color: "#D85A30", dashed: false, label: "erzwingt" },
  prevents: { color: "#E24B4A", dashed: true, label: "verhindert" },
  triggers: { color: "#BA7517", dashed: true, label: "löst aus" },
};

const LINK_TYPES: ArcLinkType[] = ["enables", "forces", "prevents", "triggers"];
const ARC_KINDS: ArcKind[] = ["story", "character", "relationship"];

// Virtual coordinate space — the SVG scales to fit via viewBox.
const W = 1040;
const GUTTER = 168;
const PAD_RIGHT = 40;
const AXIS_Y = 44;
const LANE_TOP = AXIS_Y + 24;
const LANE_H = 74;
const PLOT_X0 = GUTTER;
const PLOT_X1 = W - PAD_RIGHT;

function arcColor(arc: Arc): string {
  return arc.color ?? KIND_COLOR[arc.kind];
}

/**
 * Pick a "nice" tick step (1, 2, 5 × 10ⁿ) so the axis shows recognizable steps
 * without overcrowding — aims for roughly `target` ticks across the span.
 */
function niceStep(span: number, target = 22): number {
  const raw = span / target;
  if (raw <= 1) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const m = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return m * pow;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

type Selection =
  | { type: "beat"; id: string }
  | { type: "arc"; id: string }
  | { type: "link"; id: string }
  | null;

/**
 * Arc workspace: story / character / relationship arcs stacked as lanes over a
 * shared story-time axis, with typed cause→effect edges between beats.
 * Editing writes through to .assistant/arcs/ (debounced autosave).
 */
export function ArcTimeline({ open, onClose }: ArcTimelineProps) {
  const [data, setData] = useState<ArcData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [showAddArc, setShowAddArc] = useState(false);
  const [newArcTitle, setNewArcTitle] = useState("");
  const [newArcKind, setNewArcKind] = useState<ArcKind>("character");

  const svgRef = useRef<SVGSVGElement | null>(null);
  const saveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await arcApi.read());
      setSelection(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arcs konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (linkMode) {
          setLinkMode(false);
          setLinkSource(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, linkMode]);

  const scheduleSave = useCallback((next: ArcData) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setSaving(true);
      arcApi
        .write(next)
        .then(() => setSaveError(null))
        .catch((e) =>
          setSaveError(e instanceof Error ? e.message : "Speichern fehlgeschlagen."),
        )
        .finally(() => setSaving(false));
    }, 400);
  }, []);

  /** Apply a pure transform to the current data and persist (debounced). */
  const apply = useCallback(
    (fn: (d: ArcData) => ArcData) => {
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
  const addArc = useCallback(() => {
    const title = newArcTitle.trim() || "Neuer Bogen";
    const id = `arc_${newId()}`;
    apply((d) => ({
      ...d,
      arcs: [...d.arcs, { id, kind: newArcKind, title, order: d.arcs.length }],
    }));
    setNewArcTitle("");
    setShowAddArc(false);
    setSelection({ type: "arc", id });
  }, [apply, newArcTitle, newArcKind]);

  const updateArc = useCallback(
    (id: string, patch: Partial<Arc>) =>
      apply((d) => ({
        ...d,
        arcs: d.arcs.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    [apply],
  );

  const deleteArc = useCallback(
    (id: string) =>
      apply((d) => {
        const beatIds = new Set(d.beats.filter((b) => b.arcId === id).map((b) => b.id));
        return {
          ...d,
          arcs: d.arcs.filter((a) => a.id !== id).map((a, i) => ({ ...a, order: i })),
          beats: d.beats.filter((b) => b.arcId !== id),
          links: d.links.filter((l) => !beatIds.has(l.from) && !beatIds.has(l.to)),
        };
      }),
    [apply],
  );

  const moveArc = useCallback(
    (id: string, dir: -1 | 1) =>
      apply((d) => {
        const idx = d.arcs.findIndex((a) => a.id === id);
        const swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= d.arcs.length) return d;
        const arcs = [...d.arcs];
        [arcs[idx], arcs[swap]] = [arcs[swap], arcs[idx]];
        return { ...d, arcs: arcs.map((a, i) => ({ ...a, order: i })) };
      }),
    [apply],
  );

  const addBeat = useCallback(
    (arcId: string, at: number) => {
      const id = `b_${newId()}`;
      apply((d) => ({
        ...d,
        beats: [...d.beats, { id, arcId, at, title: "Neuer Beat" }],
      }));
      setSelection({ type: "beat", id });
    },
    [apply],
  );

  const updateBeat = useCallback(
    (id: string, patch: Partial<Beat>) =>
      apply((d) => ({
        ...d,
        beats: d.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    [apply],
  );

  const deleteBeat = useCallback(
    (id: string) =>
      apply((d) => ({
        ...d,
        beats: d.beats.filter((b) => b.id !== id),
        links: d.links.filter((l) => l.from !== id && l.to !== id),
      })),
    [apply],
  );

  const addLink = useCallback(
    (from: string, to: string) => {
      if (from === to) return;
      const id = `l_${newId()}`;
      apply((d) => {
        if (d.links.some((l) => l.from === from && l.to === to)) return d;
        return { ...d, links: [...d.links, { id, from, to, type: "triggers" }] };
      });
      setSelection({ type: "link", id });
    },
    [apply],
  );

  const updateLink = useCallback(
    (id: string, patch: Partial<ArcLink>) =>
      apply((d) => ({
        ...d,
        links: d.links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      })),
    [apply],
  );

  const deleteLink = useCallback(
    (id: string) =>
      apply((d) => ({ ...d, links: d.links.filter((l) => l.id !== id) })),
    [apply],
  );

  const updateTimeline = useCallback(
    (patch: Partial<ArcData["timeline"]>) =>
      apply((d) => ({ ...d, timeline: { ...d.timeline, ...patch } })),
    [apply],
  );

  // ── Layout ─────────────────────────────────────────────────────────
  const layout = useMemo(() => {
    if (!data) return null;
    const { timeline, arcs, beats, links } = data;
    const span = timeline.end - timeline.start;

    const x = (at: number): number => {
      if (span <= 0) return PLOT_X0;
      const t = (at - timeline.start) / span;
      return PLOT_X0 + Math.max(0, Math.min(1, t)) * (PLOT_X1 - PLOT_X0);
    };

    const laneIndex = new Map<string, number>();
    arcs.forEach((arc, i) => laneIndex.set(arc.id, i));
    const laneCenter = (arcId: string): number =>
      LANE_TOP + (laneIndex.get(arcId) ?? 0) * LANE_H + LANE_H / 2;

    const beatPos = new Map<string, { x: number; y: number; beat: Beat }>();
    for (const beat of beats) {
      if (!laneIndex.has(beat.arcId)) continue;
      beatPos.set(beat.id, { x: x(beat.at), y: laneCenter(beat.arcId), beat });
    }

    // Axis tick steps so individual days (or a nice multiple) are visible.
    const ticks: number[] = [];
    if (span > 0) {
      const step = niceStep(span);
      const first = Math.ceil(timeline.start / step) * step;
      for (let t = first; t <= timeline.end + 1e-9; t += step) {
        ticks.push(Math.round(t * 1000) / 1000);
      }
    }

    const height = LANE_TOP + Math.max(1, arcs.length) * LANE_H + 24;
    return { timeline, arcs, beats, links, x, beatPos, height, span, ticks };
  }, [data]);

  /** Map a click on a lane to a rounded story-time value. */
  const clientToAt = useCallback(
    (evt: React.MouseEvent): number => {
      const svg = svgRef.current;
      if (!svg || !data) return data?.timeline.start ?? 0;
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return data.timeline.start;
      const loc = pt.matrixTransform(ctm.inverse());
      const { start, end } = data.timeline;
      const span = end - start;
      if (span <= 0) return start;
      const t = (loc.x - PLOT_X0) / (PLOT_X1 - PLOT_X0);
      return Math.round(start + Math.max(0, Math.min(1, t)) * span);
    },
    [data],
  );

  const handleBeatClick = useCallback(
    (beatId: string) => {
      if (linkMode) {
        if (!linkSource) {
          setLinkSource(beatId);
        } else {
          addLink(linkSource, beatId);
          setLinkSource(null);
          setLinkMode(false);
        }
        return;
      }
      setSelection({ type: "beat", id: beatId });
    },
    [linkMode, linkSource, addLink],
  );

  if (!open) return null;

  const isEmpty = !loading && !error && data !== null && data.arcs.length === 0;
  const selectedBeat =
    selection?.type === "beat" ? data?.beats.find((b) => b.id === selection.id) : undefined;
  const selectedArc =
    selection?.type === "arc" ? data?.arcs.find((a) => a.id === selection.id) : undefined;
  const selectedLink =
    selection?.type === "link" ? data?.links.find((l) => l.id === selection.id) : undefined;

  return (
    <div className="arc-overlay" onClick={onClose}>
      <div
        className="arc-dialog"
        role="dialog"
        aria-labelledby="arc-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="arc-header">
          <div className="arc-header-left">
            <Waypoints size={18} className="arc-header-icon" aria-hidden />
            <h2 id="arc-title" className="arc-title">
              Spannungsbögen
            </h2>
            {saving && <span className="arc-save-state">speichert…</span>}
            {saveError && <span className="arc-save-state arc-save-state--err">{saveError}</span>}
          </div>
          <div className="arc-header-actions">
            <button
              type="button"
              className="arc-icon-btn"
              onClick={load}
              disabled={loading}
              title="Neu laden"
            >
              <RefreshCw size={15} className={loading ? "arc-spin" : ""} />
            </button>
            <button type="button" className="arc-icon-btn" onClick={onClose} title="Schließen">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="arc-toolbar">
          <button type="button" className="arc-btn" onClick={() => setShowAddArc((v) => !v)}>
            <Plus size={14} /> Bogen
          </button>
          <button
            type="button"
            className={`arc-btn ${linkMode ? "arc-btn--active" : ""}`}
            onClick={() => {
              setLinkMode((v) => !v);
              setLinkSource(null);
            }}
            disabled={!data || data.beats.length < 2}
          >
            <Link2 size={14} /> Verknüpfen
          </button>
          {showAddArc && (
            <span className="arc-inline-form">
              <input
                type="text"
                className="arc-input"
                placeholder="Name des Bogens"
                value={newArcTitle}
                onChange={(e) => setNewArcTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addArc()}
                autoFocus
              />
              <select
                className="arc-input"
                value={newArcKind}
                onChange={(e) => setNewArcKind(e.target.value as ArcKind)}
              >
                {ARC_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <button type="button" className="arc-btn" onClick={addArc}>
                <Check size={14} /> Anlegen
              </button>
            </span>
          )}
          <span className="arc-hint">
            {linkMode
              ? linkSource
                ? "Ziel-Beat anklicken (Ursache → Wirkung)"
                : "Ursache-Beat anklicken"
              : "Klicke in eine Lane, um einen Beat anzulegen."}
          </span>
        </div>

        <div className="arc-body">
          <div className="arc-canvas-wrap">
            {loading && <div className="arc-state">Lade…</div>}
            {error && <div className="arc-state arc-state--error">{error}</div>}

            {isEmpty && (
              <div className="arc-state">
                Noch keine Bögen. Klick oben auf <strong>+ Bogen</strong>, um zu starten.
              </div>
            )}

            {layout && layout.arcs.length > 0 && (
              <svg
                ref={svgRef}
                className="arc-svg"
                viewBox={`0 0 ${W} ${layout.height}`}
                role="img"
                aria-label="Zeitleiste der Spannungsbögen"
              >
                <defs>
                  {LINK_TYPES.map((type) => (
                    <marker
                      key={type}
                      id={`arc-arrow-${type}`}
                      markerWidth="9"
                      markerHeight="9"
                      refX="7"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6 Z" fill={LINK_STYLE[type].color} />
                    </marker>
                  ))}
                </defs>

                <line x1={PLOT_X0} y1={AXIS_Y} x2={PLOT_X1} y2={AXIS_Y} className="arc-axis-line" />
                <text x={16} y={AXIS_Y - 12} className="arc-axis-end">
                  {layout.timeline.unit}
                </text>
                {/* Day-step grid so the timeline is readable at a glance */}
                {layout.ticks.map((t, i) => (
                  <g key={`t-${i}`}>
                    <line
                      x1={layout.x(t)}
                      y1={AXIS_Y}
                      x2={layout.x(t)}
                      y2={layout.height - 16}
                      className="arc-tick-line"
                    />
                    <text
                      x={layout.x(t)}
                      y={AXIS_Y - 12}
                      textAnchor="middle"
                      className="arc-tick-label"
                    >
                      {t}
                    </text>
                  </g>
                ))}
                {layout.timeline.markers.map((m, i) => (
                  <g key={`m-${i}`}>
                    <line
                      x1={layout.x(m.at)}
                      y1={AXIS_Y}
                      x2={layout.x(m.at)}
                      y2={layout.height - 16}
                      className="arc-marker-line"
                    />
                    <text x={layout.x(m.at)} y={AXIS_Y - 12} textAnchor="middle" className="arc-marker-label">
                      {m.label}
                    </text>
                  </g>
                ))}

                {/* Lanes — click to add a beat, click label to select arc */}
                {layout.arcs.map((arc, i) => {
                  const top = LANE_TOP + i * LANE_H;
                  const color = arcColor(arc);
                  const isSel = selection?.type === "arc" && selection.id === arc.id;
                  return (
                    <g key={arc.id}>
                      <rect
                        x={PLOT_X0}
                        y={top + 8}
                        width={PLOT_X1 - PLOT_X0}
                        height={LANE_H - 16}
                        rx={6}
                        fill={color}
                        opacity={0.08}
                        style={{ cursor: "copy" }}
                        onClick={(e) => addBeat(arc.id, clientToAt(e))}
                      />
                      <line
                        x1={PLOT_X0}
                        y1={top + LANE_H / 2}
                        x2={PLOT_X1}
                        y2={top + LANE_H / 2}
                        stroke={color}
                        strokeOpacity={0.35}
                        strokeWidth={1.5}
                        pointerEvents="none"
                      />
                      <text
                        x={16}
                        y={top + LANE_H / 2 - 3}
                        className={`arc-lane-name ${isSel ? "arc-lane-name--sel" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelection({ type: "arc", id: arc.id })}
                      >
                        {arc.title}
                      </text>
                      <text
                        x={16}
                        y={top + LANE_H / 2 + 13}
                        className="arc-lane-kind"
                        style={{ cursor: "pointer" }}
                        onClick={() => setSelection({ type: "arc", id: arc.id })}
                      >
                        {KIND_LABEL[arc.kind]}
                      </text>
                    </g>
                  );
                })}

                {/* Cause → effect edges */}
                {layout.links.map((link) => {
                  const a = layout.beatPos.get(link.from);
                  const b = layout.beatPos.get(link.to);
                  if (!a || !b) return null;
                  const style = LINK_STYLE[link.type];
                  const midX = (a.x + b.x) / 2;
                  const d = `M${a.x},${a.y} Q${midX},${(a.y + b.y) / 2} ${b.x},${b.y}`;
                  const isSel = selection?.type === "link" && selection.id === link.id;
                  return (
                    <path
                      key={link.id}
                      d={d}
                      fill="none"
                      stroke={style.color}
                      strokeWidth={isSel ? 3 : 1.6}
                      strokeDasharray={style.dashed ? "5 3" : undefined}
                      markerEnd={`url(#arc-arrow-${link.type})`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection({ type: "link", id: link.id });
                      }}
                    >
                      <title>{style.label}{link.note ? ` — ${link.note}` : ""}</title>
                    </path>
                  );
                })}

                {/* Beats */}
                {[...layout.beatPos.values()].map(({ x, y, beat }) => {
                  const arc = layout.arcs.find((a) => a.id === beat.arcId);
                  const color = arc ? arcColor(arc) : "#888780";
                  const isSel = selection?.type === "beat" && selection.id === beat.id;
                  const isSource = linkSource === beat.id;
                  return (
                    <g key={beat.id} style={{ cursor: "pointer" }}>
                      {(isSel || isSource) && (
                        <circle cx={x} cy={y} r={11} fill="none" stroke={color} strokeWidth={2} />
                      )}
                      <circle
                        cx={x}
                        cy={y}
                        r={7}
                        fill={color}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBeatClick(beat.id);
                        }}
                      />
                      <text
                        x={x}
                        y={y - 14}
                        textAnchor="middle"
                        className="arc-beat-label"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBeatClick(beat.id);
                        }}
                      >
                        {beat.title}
                      </text>
                      <title>{beat.title} · {beat.at} {layout.timeline.unit}</title>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* Sidebar editor */}
          <aside className="arc-sidebar">
            {selectedBeat && (
              <BeatEditor
                key={selectedBeat.id}
                beat={selectedBeat}
                arcs={data!.arcs}
                unit={data!.timeline.unit}
                onChange={(patch) => updateBeat(selectedBeat.id, patch)}
                onDelete={() => {
                  deleteBeat(selectedBeat.id);
                  setSelection(null);
                }}
              />
            )}
            {selectedArc && (
              <ArcEditor
                key={selectedArc.id}
                arc={selectedArc}
                onChange={(patch) => updateArc(selectedArc.id, patch)}
                onMove={(dir) => moveArc(selectedArc.id, dir)}
                onDelete={() => {
                  deleteArc(selectedArc.id);
                  setSelection(null);
                }}
              />
            )}
            {selectedLink && (
              <LinkEditor
                key={selectedLink.id}
                link={selectedLink}
                beats={data!.beats}
                onChange={(patch) => updateLink(selectedLink.id, patch)}
                onDelete={() => {
                  deleteLink(selectedLink.id);
                  setSelection(null);
                }}
              />
            )}
            {!selection && data && (
              <TimelineEditor timeline={data.timeline} onChange={updateTimeline} />
            )}
          </aside>
        </div>

        <div className="arc-legend">
          {LINK_TYPES.map((type) => (
            <span key={type} className="arc-legend-item">
              <span
                className="arc-legend-line"
                style={{
                  borderTopColor: LINK_STYLE[type].color,
                  borderTopStyle: LINK_STYLE[type].dashed ? "dashed" : "solid",
                }}
              />
              {LINK_STYLE[type].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar editors ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="arc-field">
      <span className="arc-field-label">{label}</span>
      {children}
    </label>
  );
}

function BeatEditor({
  beat,
  arcs,
  unit,
  onChange,
  onDelete,
}: {
  beat: Beat;
  arcs: Arc[];
  unit: string;
  onChange: (patch: Partial<Beat>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="arc-editor">
      <div className="arc-editor-title">Beat</div>
      <Field label="Titel">
        <input
          className="arc-input"
          value={beat.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field label={`Zeitpunkt (${unit})`}>
        <input
          className="arc-input"
          type="number"
          value={beat.at}
          onChange={(e) => onChange({ at: Number(e.target.value) })}
        />
      </Field>
      <Field label="Bogen">
        <select
          className="arc-input"
          value={beat.arcId}
          onChange={(e) => onChange({ arcId: e.target.value })}
        >
          {arcs.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Szenen-Anker (Pfad, optional)">
        <input
          className="arc-input"
          value={beat.sceneRef ?? ""}
          placeholder="structure/…/szene.md"
          onChange={(e) => onChange({ sceneRef: e.target.value || undefined })}
        />
      </Field>
      <Field label="Notiz">
        <textarea
          className="arc-input arc-textarea"
          value={beat.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value || undefined })}
        />
      </Field>
      <button type="button" className="arc-btn arc-btn--danger" onClick={onDelete}>
        <Trash2 size={14} /> Beat löschen
      </button>
    </div>
  );
}

function ArcEditor({
  arc,
  onChange,
  onMove,
  onDelete,
}: {
  arc: Arc;
  onChange: (patch: Partial<Arc>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="arc-editor">
      <div className="arc-editor-title">Bogen</div>
      <Field label="Titel">
        <input
          className="arc-input"
          value={arc.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field label="Typ">
        <select
          className="arc-input"
          value={arc.kind}
          onChange={(e) => onChange({ kind: e.target.value as ArcKind })}
        >
          {ARC_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Wiki-Bezug (Pfad, optional)">
        <input
          className="arc-input"
          value={arc.wikiRef ?? ""}
          placeholder="wiki/…/figur.md"
          onChange={(e) => onChange({ wikiRef: e.target.value || undefined })}
        />
      </Field>
      <Field label="Farbe">
        <input
          className="arc-input arc-color"
          type="color"
          value={arc.color ?? KIND_COLOR[arc.kind]}
          onChange={(e) => onChange({ color: e.target.value })}
        />
      </Field>
      <div className="arc-editor-row">
        <button type="button" className="arc-btn" onClick={() => onMove(-1)}>
          <ChevronUp size={14} /> Hoch
        </button>
        <button type="button" className="arc-btn" onClick={() => onMove(1)}>
          <ChevronDown size={14} /> Runter
        </button>
      </div>
      <button type="button" className="arc-btn arc-btn--danger" onClick={onDelete}>
        <Trash2 size={14} /> Bogen löschen
      </button>
    </div>
  );
}

function LinkEditor({
  link,
  beats,
  onChange,
  onDelete,
}: {
  link: ArcLink;
  beats: Beat[];
  onChange: (patch: Partial<ArcLink>) => void;
  onDelete: () => void;
}) {
  const nameOf = (id: string) => beats.find((b) => b.id === id)?.title ?? "?";
  return (
    <div className="arc-editor">
      <div className="arc-editor-title">Verknüpfung</div>
      <p className="arc-editor-desc">
        <strong>{nameOf(link.from)}</strong> → <strong>{nameOf(link.to)}</strong>
      </p>
      <Field label="Art">
        <select
          className="arc-input"
          value={link.type}
          onChange={(e) => onChange({ type: e.target.value as ArcLinkType })}
        >
          {LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {LINK_STYLE[t].label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notiz">
        <textarea
          className="arc-input arc-textarea"
          value={link.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value || undefined })}
        />
      </Field>
      <button type="button" className="arc-btn arc-btn--danger" onClick={onDelete}>
        <Trash2 size={14} /> Verknüpfung löschen
      </button>
    </div>
  );
}

function TimelineEditor({
  timeline,
  onChange,
}: {
  timeline: ArcData["timeline"];
  onChange: (patch: Partial<ArcData["timeline"]>) => void;
}) {
  const addMarker = () =>
    onChange({
      markers: [...timeline.markers, { at: timeline.start, label: "Marker" }],
    });
  const updateMarker = (i: number, patch: Partial<{ at: number; label: string }>) =>
    onChange({
      markers: timeline.markers.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    });
  const removeMarker = (i: number) =>
    onChange({ markers: timeline.markers.filter((_, j) => j !== i) });

  return (
    <div className="arc-editor">
      <div className="arc-editor-title">Zeitachse</div>
      <p className="arc-editor-desc">Wähle einen Bogen, Beat oder eine Verknüpfung, um sie zu bearbeiten.</p>
      <Field label="Einheit">
        <input
          className="arc-input"
          value={timeline.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
        />
      </Field>
      <div className="arc-editor-row">
        <Field label="Start">
          <input
            className="arc-input"
            type="number"
            value={timeline.start}
            onChange={(e) => onChange({ start: Number(e.target.value) })}
          />
        </Field>
        <Field label="Ende">
          <input
            className="arc-input"
            type="number"
            value={timeline.end}
            onChange={(e) => onChange({ end: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="arc-editor-title arc-editor-title--sub">Marker</div>
      {timeline.markers.map((m, i) => (
        <div key={i} className="arc-marker-row">
          <input
            className="arc-input"
            type="number"
            value={m.at}
            onChange={(e) => updateMarker(i, { at: Number(e.target.value) })}
          />
          <input
            className="arc-input"
            value={m.label}
            onChange={(e) => updateMarker(i, { label: e.target.value })}
          />
          <button type="button" className="arc-icon-btn" onClick={() => removeMarker(i)} title="Entfernen">
            <X size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="arc-btn" onClick={addMarker}>
        <Plus size={14} /> Marker
      </button>
    </div>
  );
}

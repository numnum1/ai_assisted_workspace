import { Handle, Position, type NodeProps } from "@xyflow/react";
import { type PointerEvent as ReactPointerEvent } from "react";
import type { BlueprintNode } from "../../../shared/types.ts";
import { arcColor, useArcRegistry } from "../arcRegistryContext.ts";
import { useNodeSpanDrag } from "../nodeSpanContext.ts";
import { xToTime } from "../layout.ts";

/**
 * A world-event node: a single implicit input on the left of the *first body
 * row* (not the header, so it lines up with the outputs it faces), and one
 * named execution output pin per row on the right. Pins carry narrative content
 * ("Begegnet Charakter Nele"); wires between them express *and then this leads
 * to* — narrative flow, not code execution.
 *
 * The node's own left/right edges double as Von/Bis handles: dragging either
 * one re-derives that bound from the pointer's flow-space X, mirroring the
 * details panel's Von/Bis fields but grabbed directly off the node.
 */
function subtitle(node: BlueprintNode): string | null {
  if (node.subGraphId) return "Enthält Unterablauf";
  if (node.description) {
    const line = node.description.trim().split("\n")[0];
    return line.length > 42 ? `${line.slice(0, 42)}…` : line;
  }
  return null;
}

export function EventNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as BlueprintNode;
  const arcs = useArcRegistry();
  const spanDrag = useNodeSpanDrag();
  const tags = (node.arcRefs ?? [])
    .map((arcId) => arcs.find((a) => a.id === arcId))
    .filter((a) => a !== undefined);
  const sub = subtitle(node);
  const inputPin = (
    <Handle type="target" position={Position.Left} id="in" className="bp-pin bp-pin--in" />
  );

  const startSpanResize = (edge: "from" | "to") => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!spanDrag) return;
    const opposite = edge === "from" ? node.to : node.from;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const flowX = spanDrag.toFlowX(ev.clientX);
      let t = Math.round(xToTime(flowX, spanDrag.columns, spanDrag.unitPx, spanDrag.columnGap));
      if (opposite !== undefined) {
        t = edge === "from" ? Math.min(t, opposite - 1) : Math.max(t, opposite + 1);
      }
      spanDrag.onPreview(id, edge === "from" ? { from: t } : { to: t });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      spanDrag.onCommit();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div
      className={`bp-node bp-node--${node.status}${node.subGraphId ? " bp-node--container" : ""}${selected ? " is-selected" : ""}`}
    >
      <div className="bp-node__header">
        {spanDrag && (
          <>
            <div
              className="bp-node__resize bp-node__resize--left"
              onPointerDown={startSpanResize("from")}
            />
            <div
              className="bp-node__resize bp-node__resize--right"
              onPointerDown={startSpanResize("to")}
            />
          </>
        )}
        <div className="bp-node__heading">
          <span className="bp-node__title">{node.title || "Ereignis"}</span>
          {sub && <span className="bp-node__subtitle">{sub}</span>}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="bp-node__tags">
          {tags.map((arc) => (
            <span
              key={arc.id}
              className="bp-node__tag"
              title={arc.title}
              style={{ backgroundColor: arcColor(arc) }}
            />
          ))}
        </div>
      )}
      <div className="bp-node__outputs">
        {node.outputs.length === 0 ? (
          <div className="bp-node__output bp-node__output--empty">
            {inputPin}—
          </div>
        ) : (
          node.outputs.map((pin, i) => (
            <div className="bp-node__output" key={pin.id}>
              {i === 0 && inputPin}
              <span className="bp-node__output-label">{pin.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={pin.id}
                className="bp-pin bp-pin--out"
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

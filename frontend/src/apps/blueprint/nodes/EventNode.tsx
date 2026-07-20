import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlueprintNode } from "../../../shared/types.ts";
import { arcColor, useArcRegistry } from "../arcRegistryContext.ts";

/**
 * A world-event node: a single implicit input on the left, and one named
 * execution output pin per row on the right. Pins carry narrative content
 * ("Begegnet Charakter Nele"); wires between them express *and then this leads
 * to* — narrative flow, not code execution.
 */
function subtitle(node: BlueprintNode): string | null {
  if (node.subGraphId) return "Enthält Unterablauf";
  if (node.description) {
    const line = node.description.trim().split("\n")[0];
    return line.length > 42 ? `${line.slice(0, 42)}…` : line;
  }
  return null;
}

export function EventNode({ data, selected }: NodeProps) {
  const node = data as unknown as BlueprintNode;
  const arcs = useArcRegistry();
  const tags = (node.arcRefs ?? [])
    .map((id) => arcs.find((a) => a.id === id))
    .filter((a) => a !== undefined);
  const sub = subtitle(node);
  return (
    <div
      className={`bp-node bp-node--${node.status}${selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="in" className="bp-pin bp-pin--in" />
      <div className="bp-node__header">
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
          <div className="bp-node__output bp-node__output--empty">—</div>
        ) : (
          node.outputs.map((pin) => (
            <div className="bp-node__output" key={pin.id}>
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

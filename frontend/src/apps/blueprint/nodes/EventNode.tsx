import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlueprintNode } from "../../../shared/types.ts";

/**
 * A world-event node: a single implicit input on the left, and one named
 * execution output pin per row on the right. Pins carry narrative content
 * ("Begegnet Charakter Nele"); wires between them express *and then this leads
 * to* — narrative flow, not code execution.
 */
export function EventNode({ data, selected }: NodeProps) {
  const node = data as unknown as BlueprintNode;
  return (
    <div
      className={`bp-node bp-node--${node.status}${selected ? " is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="in" className="bp-pin bp-pin--in" />
      <div className="bp-node__header">{node.title || "Ereignis"}</div>
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

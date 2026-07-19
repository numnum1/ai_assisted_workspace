import { Handle, Position, type NodeProps } from "@xyflow/react";

/** A wire pass-through point for clean cable routing — no content, one in/out pin. */
export function RerouteNode({ selected }: NodeProps) {
  return (
    <div className={`bp-reroute${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" className="bp-pin bp-pin--in" />
      <Handle type="source" position={Position.Right} id="out" className="bp-pin bp-pin--out" />
    </div>
  );
}

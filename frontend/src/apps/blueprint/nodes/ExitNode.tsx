import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlueprintNode } from "../../../shared/types.ts";

/** The tunnel mirroring one of a container's named output pins inside its sub-graph. */
export function ExitNode({ data, selected }: NodeProps) {
  const node = data as unknown as BlueprintNode;
  return (
    <div className={`bp-tunnel bp-tunnel--exit${selected ? " is-selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="in" className="bp-pin bp-pin--in" />
      <span>{node.title || "Ausgang"}</span>
    </div>
  );
}

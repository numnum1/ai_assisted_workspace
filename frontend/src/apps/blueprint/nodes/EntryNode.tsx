import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BlueprintNode } from "../../../shared/types.ts";

/** The tunnel mirroring a container's implicit input pin inside its sub-graph. */
export function EntryNode({ data, selected }: NodeProps) {
  const node = data as unknown as BlueprintNode;
  return (
    <div className={`bp-tunnel bp-tunnel--entry${selected ? " is-selected" : ""}`}>
      <span>{node.title || "Eingang"}</span>
      <Handle type="source" position={Position.Right} id="out" className="bp-pin bp-pin--out" />
    </div>
  );
}

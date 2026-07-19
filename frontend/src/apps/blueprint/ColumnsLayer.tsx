import { useViewport } from "@xyflow/react";
import type { BlueprintColumn } from "../../shared/types.ts";
import { TIME_UNIT_PX } from "./layout.ts";

interface ColumnsLayerProps {
  columns: BlueprintColumn[];
}

/** Full-height background bands for named time zones ("Tag 1 Hafen"), kept in
 * sync with the canvas pan/zoom via the shared flow-space transform. */
export function ColumnsLayer({ columns }: ColumnsLayerProps) {
  const { x, y, zoom } = useViewport();
  return (
    <div
      className="bp-columns-layer"
      style={{ transform: `translate(${x}px, ${y}px) scale(${zoom})` }}
    >
      {columns.map((col) => (
        <div
          key={col.id}
          className="bp-column"
          style={{
            left: col.from * TIME_UNIT_PX,
            width: Math.max(40, (col.to - col.from) * TIME_UNIT_PX),
          }}
        >
          <div className="bp-column__header">{col.label}</div>
        </div>
      ))}
    </div>
  );
}

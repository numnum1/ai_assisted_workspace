import { useViewport } from "@xyflow/react";
import type { BlueprintColumn } from "../../shared/types.ts";
import { spanEndX, timeToX } from "./layout.ts";

interface ColumnsLayerProps {
  columns: BlueprintColumn[];
  unitPx: number;
  columnGap: number;
}

/** Full-height background bands for named time zones ("Tag 1 Hafen"), kept in
 * sync with the canvas pan/zoom via the shared flow-space transform. */
export function ColumnsLayer({ columns, unitPx, columnGap }: ColumnsLayerProps) {
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
            left: timeToX(col.from, columns, unitPx, columnGap),
            width: Math.max(
              40,
              spanEndX(col.to, columns, unitPx, columnGap) -
                timeToX(col.from, columns, unitPx, columnGap),
            ),
          }}
        >
          <div className="bp-column__header">{col.label}</div>
        </div>
      ))}
    </div>
  );
}

import { useViewport } from "@xyflow/react";
import type { BlueprintColumn } from "../../shared/types.ts";
import { spanEndX, timeToX } from "./layout.ts";

interface ColumnsLayerProps {
  columns: BlueprintColumn[];
  unitPx: number;
  columnGap: number;
  /** How far down (flow-space Y) each band reaches — the bottom-most node's
   * edge plus a margin, not an arbitrary large constant. */
  bottom: number;
}

/** Background bands for named time zones ("Tag 1 Hafen"), reaching from the
 * top of the canvas down to the lowest node (+ margin) rather than an
 * arbitrary fixed depth — kept in sync with the canvas pan/zoom via the
 * shared flow-space transform. */
export function ColumnsLayer({ columns, unitPx, columnGap, bottom }: ColumnsLayerProps) {
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
            height: bottom,
          }}
        >
          <div className="bp-column__header">{col.label}</div>
        </div>
      ))}
    </div>
  );
}

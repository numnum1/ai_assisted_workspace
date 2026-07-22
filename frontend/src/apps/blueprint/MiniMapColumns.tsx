import { useEffect, useRef, useState } from "react";
import { Panel } from "@xyflow/react";
import type { BlueprintColumn } from "../../shared/types.ts";
import { spanEndX, timeToX } from "./layout.ts";

/** Rendered size of the MiniMap; the overlay has to match it exactly, so both
 * are driven from here instead of React Flow's implicit default. */
export const MINIMAP_WIDTH = 200;
export const MINIMAP_HEIGHT = 150;

interface MiniMapColumnsProps {
  columns: BlueprintColumn[];
  unitPx: number;
  columnGap: number;
}

interface MirroredMiniMap {
  viewBox: string;
  /** Tight top/bottom of the actual node dots — *not* the padded viewBox,
   * which React Flow stretches to fill whichever axis doesn't already match
   * the panel's aspect ratio. Using the viewBox's own y/height for the bands
   * made them balloon far past the real content on a wide, short graph. */
  minY: number;
  maxY: number;
}

function readMirroredState(svg: SVGSVGElement): MirroredMiniMap | null {
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return null;
  let minY = Infinity;
  let maxY = -Infinity;
  svg.querySelectorAll<SVGRectElement>(".react-flow__minimap-node").forEach((rect) => {
    const y = parseFloat(rect.getAttribute("y") ?? "0");
    const h = parseFloat(rect.getAttribute("height") ?? "0");
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minY)) return null;
  return { viewBox, minY, maxY };
}

/**
 * Column bands drawn on top of the MiniMap. The MiniMap ignores children, so
 * this renders a second panel pinned to the same corner/size and mirrors the
 * real MiniMap SVG via a MutationObserver — `viewBox` for the horizontal
 * mapping, and the rendered node dots' own y/height for the vertical extent —
 * rather than re-deriving the bounding box ourselves (which drifted from
 * React Flow's own measured-node bounds and desynced). Copying the literal
 * DOM state is the only way this can't drift.
 */
export function MiniMapColumns({ columns, unitPx, columnGap }: MiniMapColumnsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mirrored, setMirrored] = useState<MirroredMiniMap | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const flowRoot = panel?.closest(".react-flow");
    if (!flowRoot) return;

    let observer: MutationObserver | null = null;
    const attach = (svg: SVGSVGElement) => {
      setMirrored(readMirroredState(svg));
      observer = new MutationObserver(() => setMirrored(readMirroredState(svg)));
      observer.observe(svg, {
        attributes: true,
        attributeFilter: ["viewBox", "x", "y", "width", "height"],
        subtree: true,
      });
    };

    const existing = flowRoot.querySelector<SVGSVGElement>(".react-flow__minimap-svg");
    if (existing) {
      attach(existing);
      return () => observer?.disconnect();
    }
    // The MiniMap SVG isn't in the DOM on the very first commit yet — watch
    // for it to appear, then switch to observing its viewBox/node rects.
    const appearObserver = new MutationObserver(() => {
      const svg = flowRoot.querySelector<SVGSVGElement>(".react-flow__minimap-svg");
      if (svg) {
        appearObserver.disconnect();
        attach(svg);
      }
    });
    appearObserver.observe(flowRoot, { childList: true, subtree: true });
    return () => {
      appearObserver.disconnect();
      observer?.disconnect();
    };
  }, []);

  return (
    <Panel ref={panelRef} position="bottom-right" className="bp-minimap-columns">
      {mirrored && columns.length > 0 && (
        <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} viewBox={mirrored.viewBox}>
          {columns.map((col) => {
            const left = timeToX(col.from, columns, unitPx, columnGap);
            return (
              <rect
                key={col.id}
                x={left}
                y={mirrored.minY}
                width={Math.max(1, spanEndX(col.to, columns, unitPx, columnGap) - left)}
                height={mirrored.maxY - mirrored.minY}
              />
            );
          })}
        </svg>
      )}
    </Panel>
  );
}

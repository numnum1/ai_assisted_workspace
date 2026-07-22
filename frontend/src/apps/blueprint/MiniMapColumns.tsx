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

/**
 * Column bands drawn on top of the MiniMap. The MiniMap ignores children, so
 * this renders a second panel pinned to the same corner/size and mirrors the
 * real MiniMap SVG's `viewBox` attribute onto its own SVG via a
 * MutationObserver — rather than re-deriving the bounding box ourselves
 * (which drifted from React Flow's own measured-node bounds and desynced).
 * Copying the literal attribute is the only way this can't drift.
 */
export function MiniMapColumns({ columns, unitPx, columnGap }: MiniMapColumnsProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState<string | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const flowRoot = panel?.closest(".react-flow");
    if (!flowRoot) return;

    let observer: MutationObserver | null = null;
    const attach = (svg: SVGSVGElement) => {
      setViewBox(svg.getAttribute("viewBox"));
      observer = new MutationObserver(() => setViewBox(svg.getAttribute("viewBox")));
      observer.observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
    };

    const existing = flowRoot.querySelector<SVGSVGElement>(".react-flow__minimap-svg");
    if (existing) {
      attach(existing);
      return () => observer?.disconnect();
    }
    // The MiniMap SVG isn't in the DOM on the very first commit yet — watch
    // for it to appear, then switch to observing its viewBox.
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

  const [, y, , height] = viewBox ? viewBox.split(" ").map(Number) : [0, 0, 0, 0];

  return (
    <Panel ref={panelRef} position="bottom-right" className="bp-minimap-columns">
      {viewBox && columns.length > 0 && (
        <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} viewBox={viewBox}>
          {columns.map((col) => {
            const left = timeToX(col.from, columns, unitPx, columnGap);
            return (
              <rect
                key={col.id}
                x={left}
                y={y}
                width={Math.max(1, spanEndX(col.to, columns, unitPx, columnGap) - left)}
                height={height}
              />
            );
          })}
        </svg>
      )}
    </Panel>
  );
}

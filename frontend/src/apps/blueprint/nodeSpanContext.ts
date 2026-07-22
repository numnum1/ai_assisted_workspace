import { createContext, useContext } from "react";
import type { BlueprintColumn, BlueprintNode } from "../../shared/types.ts";

export interface NodeSpanDrag {
  columns: BlueprintColumn[];
  unitPx: number;
  columnGap: number;
  /** Client (screen) X → flow-space X, accounting for the current pan/zoom. */
  toFlowX: (clientX: number) => number;
  /** Live preview while dragging — re-derives position/width from the patched
   * span immediately, without re-settling lanes (that would jitter every
   * pointermove). */
  onPreview: (nodeId: string, patch: Partial<Pick<BlueprintNode, "from" | "to">>) => void;
  /** Called once on pointer up — the automatic counterpart to editing Von/Bis
   * in the details panel, so a resize resettles lanes like any other span edit. */
  onCommit: () => void;
}

export const NodeSpanContext = createContext<NodeSpanDrag | null>(null);

export function useNodeSpanDrag(): NodeSpanDrag | null {
  return useContext(NodeSpanContext);
}

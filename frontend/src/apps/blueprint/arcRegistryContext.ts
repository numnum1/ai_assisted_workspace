import { createContext, useContext } from "react";
import type { Arc, ArcKind } from "../../shared/types.ts";

/** Default lane color when an arc carries no explicit color — mirrors ArcTimeline's map. */
const KIND_COLOR: Record<ArcKind, string> = {
  story: "#5F5E5A",
  character: "#1D9E75",
  relationship: "#D85A30",
};

export function arcColor(arc: Arc): string {
  return arc.color ?? KIND_COLOR[arc.kind];
}

export const ArcRegistryContext = createContext<Arc[]>([]);

export function useArcRegistry(): Arc[] {
  return useContext(ArcRegistryContext);
}

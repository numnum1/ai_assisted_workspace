import { useEffect, useState, type ReactNode } from "react";
import { arcApi } from "../../shared/api.ts";
import type { Arc } from "../../shared/types.ts";
import { ArcRegistryContext } from "./arcRegistryContext.ts";

/** Loads the central arc registry (`.assistant/arcs/`) once and provides it
 * to Blueprint nodes/panels — the fixed tag set nodes pick `arcRefs` from. */
export function ArcRegistryProvider({ children }: { children: ReactNode }) {
  const [arcs, setArcs] = useState<Arc[]>([]);

  useEffect(() => {
    arcApi
      .read()
      .then((d) => setArcs(d.arcs))
      .catch(() => setArcs([]));
  }, []);

  return <ArcRegistryContext.Provider value={arcs}>{children}</ArcRegistryContext.Provider>;
}

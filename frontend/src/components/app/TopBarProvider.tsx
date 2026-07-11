import { useState, type ReactNode } from "react";
import {
  TopBarSlotContext,
  SetTopBarSlotContext,
} from "./TopBarContext.ts";

/** Holds the current TopBar slot node and exposes it via context. */
export function TopBarProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  return (
    <SetTopBarSlotContext.Provider value={setNode}>
      <TopBarSlotContext.Provider value={node}>
        {children}
      </TopBarSlotContext.Provider>
    </SetTopBarSlotContext.Provider>
  );
}

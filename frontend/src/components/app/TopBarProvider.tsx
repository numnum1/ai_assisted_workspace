import { useState, type ReactNode } from "react";
import {
  TopBarSlotContext,
  SetTopBarSlotContext,
  TopBarBgContext,
  SetTopBarBgContext,
} from "./TopBarContext.ts";

export function TopBarProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode>(null);
  const [bg, setBg] = useState<string | null>(null);
  return (
    <SetTopBarSlotContext.Provider value={setNode}>
      <TopBarSlotContext.Provider value={node}>
        <SetTopBarBgContext.Provider value={setBg}>
          <TopBarBgContext.Provider value={bg}>
            {children}
          </TopBarBgContext.Provider>
        </SetTopBarBgContext.Provider>
      </TopBarSlotContext.Provider>
    </SetTopBarSlotContext.Provider>
  );
}

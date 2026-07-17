import { createContext, useContext, useEffect, type ReactNode } from "react";

export const TopBarSlotContext = createContext<ReactNode>(null);
export const SetTopBarSlotContext = createContext<(node: ReactNode) => void>(
  () => {},
);

export const TopBarBgContext = createContext<string | null>(null);
export const SetTopBarBgContext = createContext<
  (color: string | null) => void
>(() => {});

export function useTopBarContent(node: ReactNode) {
  const setNode = useContext(SetTopBarSlotContext);
  useEffect(() => {
    setNode(node);
    return () => setNode(null);
  }, [node, setNode]);
}

export function useTopBarSlot(): ReactNode {
  return useContext(TopBarSlotContext);
}

export function useTopBarBackground(color: string | null) {
  const setColor = useContext(SetTopBarBgContext);
  useEffect(() => {
    setColor(color);
    return () => setColor(null);
  }, [color, setColor]);
}

export function useTopBarBg(): string | null {
  return useContext(TopBarBgContext);
}

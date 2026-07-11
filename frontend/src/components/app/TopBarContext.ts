import { createContext, useContext, useEffect, type ReactNode } from "react";

/**
 * Shared slot for the app-wide TopBar. The TopBar is a fixed shell in Main;
 * whichever editor is currently active fills it with its own tools via
 * {@link useTopBarContent}. State for those tools stays inside each editor —
 * only the rendered node travels through this context.
 *
 * Contexts + hooks live in this `.ts` file (no components) so the Provider
 * component can live on its own; see TopBarProvider.tsx.
 */
export const TopBarSlotContext = createContext<ReactNode>(null);
export const SetTopBarSlotContext = createContext<(node: ReactNode) => void>(
  () => {},
);

/**
 * Register the active editor's toolbar content into the TopBar. Clears on
 * unmount so switching editors swaps the tools cleanly.
 *
 * Callers should build `node` with `useMemo` over the relevant state so the
 * effect does not re-register on every keystroke.
 */
export function useTopBarContent(node: ReactNode) {
  const setNode = useContext(SetTopBarSlotContext);
  useEffect(() => {
    setNode(node);
    return () => setNode(null);
  }, [node, setNode]);
}

/** Read the currently registered TopBar content (used by the TopBar shell). */
export function useTopBarSlot(): ReactNode {
  return useContext(TopBarSlotContext);
}

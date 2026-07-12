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

/** Background color of the active editor's toolbar, mirrored onto the
 * window controls (minimize/close) so they blend into the same bar instead
 * of showing the app's default background. */
export const TopBarBgContext = createContext<string | null>(null);
export const SetTopBarBgContext = createContext<
  (color: string | null) => void
>(() => {});

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

/** Register the active editor's toolbar background color so the window
 * controls can match it. Clears on unmount, same lifecycle as
 * {@link useTopBarContent}. */
export function useTopBarBackground(color: string | null) {
  const setColor = useContext(SetTopBarBgContext);
  useEffect(() => {
    setColor(color);
    return () => setColor(null);
  }, [color, setColor]);
}

/** Read the currently registered TopBar background color (used by the
 * TopBar shell to color the window controls). */
export function useTopBarBg(): string | null {
  return useContext(TopBarBgContext);
}

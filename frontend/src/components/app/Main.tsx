import type { ReactNode } from "react";
import { TopBar } from "./TopBar.tsx";

/**
 * Main working area: the fixed {@link TopBar} above the active editor. The
 * editor content is passed as `children` (extracted into an Editor container in
 * a later step).
 */
export function Main({ children }: { children: ReactNode }) {
  return (
    <div className="main">
      <TopBar />
      {children}
    </div>
  );
}

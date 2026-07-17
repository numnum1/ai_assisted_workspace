import type { ReactNode } from "react";
import { TopBar } from "./TopBar.tsx";

export function Main({ children }: { children: ReactNode }) {
  return (
    <div className="main">
      <TopBar />
      {children}
    </div>
  );
}

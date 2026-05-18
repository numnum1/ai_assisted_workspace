import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ContextInspectorEntry({
  name,
  icon,
  size,
  percentage,
  Content,
}: {
  name: string;
  icon: LucideIcon;
  size: number;
  percentage: number;
  Content: ReactNode;
}) {
  return (<div>Placeholder For Context Inspect Entry</div>)
}

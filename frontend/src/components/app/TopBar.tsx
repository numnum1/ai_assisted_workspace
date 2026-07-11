import { useTopBarSlot } from "./TopBarContext.ts";

/**
 * Fixed shell at the top of {@link Main}. Renders whatever tools the active
 * editor has registered via {@link useTopBarContent}; empty (zero height) when
 * no editor supplies content.
 */
export function TopBar() {
  const slot = useTopBarSlot();
  return <div className="top-bar">{slot}</div>;
}

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ContextInspectorEntry({
  name,
  icon: Icon,
  size,
  percentage,
  Content,
  contentClassName,
}: {
  name: string;
  icon: LucideIcon;
  size: number;
  percentage: number;
  Content: ReactNode;
  contentClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="context-block">
      <div
        className="context-block-header"
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        <span className="context-block-expand">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <span className="context-block-icon">
          <Icon size={14} />
        </span>
        <span className="context-block-label">{name}</span>
        {size > 0 && (
          <span className="context-block-tokens">
            {size.toLocaleString()}
            {percentage > 0 && ` (${percentage}%)`}
          </span>
        )}
      </div>
      {expanded && (
        <div
          className={["context-block-content", contentClassName]
            .filter(Boolean)
            .join(" ")}
        >
          {Content}
        </div>
      )}
    </div>
  );
}

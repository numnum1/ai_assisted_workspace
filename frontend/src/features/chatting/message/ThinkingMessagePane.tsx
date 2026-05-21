import { useState } from "react";
import { ChevronRight } from "lucide-react";

export function ThinkingMessagePane({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-block-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight
          size={14}
          className={`thinking-block-chevron${open ? " thinking-block-chevron--open" : ""}`}
          aria-hidden
        />
        <span className="thinking-block-label">
          {isStreaming ? "Thinking…" : "Thinking"}
        </span>
      </button>
      {open && (
        <div className="thinking-block-body">
          {text}
        </div>
      )}
    </div>
  );
}

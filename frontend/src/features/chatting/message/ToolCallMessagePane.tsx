import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import type { FunctionCallToolCall, MultipleChoiceToolCall, ToolCall } from "../tool_call/tool_call.types";

function FunctionCallPane({ call }: { call: FunctionCallToolCall }) {
  const [open, setOpen] = useState(false);

  let prettyArgs = call.arguments;
  try {
    prettyArgs = JSON.stringify(JSON.parse(call.arguments), null, 2);
  } catch {
    // leave as-is if not valid JSON
  }

  return (
    <div className="tool-call-block">
      <button
        type="button"
        className="tool-call-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronRight
          size={14}
          className={`tool-call-chevron${open ? " tool-call-chevron--open" : ""}`}
          aria-hidden
        />
        <Wrench size={12} className="tool-call-icon" aria-hidden />
        <span className="tool-call-name">{call.name}</span>
        {call.result !== undefined && (
          <span className="tool-call-done-badge">done</span>
        )}
      </button>
      {open && (
        <div className="tool-call-body">
          <pre className="tool-call-args">{prettyArgs}</pre>
          {call.result !== undefined && (
            <div className="tool-call-result">
              <span className="tool-call-result-label">Result:</span>
              <pre className="tool-call-result-body">{call.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MultipleChoicePane({ call }: { call: MultipleChoiceToolCall }) {
  return (
    <div className="tool-call-block">
      <div className="tool-call-header">
        <Wrench size={12} className="tool-call-icon" aria-hidden />
        <span className="tool-call-name">{call.question}</span>
      </div>
      <ul className="tool-call-options">
        {call.options.map((opt) => (
          <li key={opt.value} className={opt.isSelected ? "tool-call-option--selected" : ""}>
            {opt.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToolCallMessagePane({ content }: { content: ToolCall }) {
  if (content.type === "FUNCTION_CALL") {
    return <FunctionCallPane call={content} />;
  }
  if (content.type === "MULTIPLE_CHOICE") {
    return <MultipleChoicePane call={content} />;
  }
  return null;
}

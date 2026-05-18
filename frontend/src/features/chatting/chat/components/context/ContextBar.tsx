import { Eye } from "lucide-react";
import { ContextInspector } from "./ContextInspector";
import { useCallback, useState } from "react";

export interface ContextBarProps {
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview: string | null;
}

export function ContextBar() {
  const [open, setOpen] = useState(false);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  return (
    <div className="context-bar-wrapper">
      <div className="context-bar">
        <div className="context-bar-left"></div>
        <div className="context-bar-right">
          <span className="context-bar-files">
            {contextInfo.includedFiles.length} files in context
          </span>
          {hasMax ? (
            <span
              className="context-bar-tokens context-bar-tokens--with-bar"
              title={`${contextInfo!.estimatedTokens.toLocaleString()} / ${contextInfo!.maxContextTokens!.toLocaleString()} tokens`}
            >
              <span
                className="context-bar-token-pct"
                style={{
                  color: tokenBarColor(contextInfo!.estimatedTokens),
                }}
              >
                {pct}%
              </span>
              <span className="context-bar-token-bar" aria-hidden="true">
                <span
                  className="context-bar-token-bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: tokenBarColor(contextInfo!.estimatedTokens),
                  }}
                />
              </span>
              ~{contextInfo.estimatedTokens.toLocaleString()} /{" "}
              {(contextInfo.maxContextTokens! / 1000).toFixed(0)}k
            </span>
          ) : (
            <span className="context-bar-tokens">
              ~{contextInfo.estimatedTokens.toLocaleString()} tokens
            </span>
          )}
          {systemPromptPreview != null && systemPromptPreview.length > 0 && (
            <span
              className="context-bar-system-prompt-hint"
              title="Zeichen im vollständigen Systemprompt (nächster Send)"
            >
              {systemPromptPreview.length.toLocaleString()} Zeichen System
            </span>
          )}
          <button
            className={`context-inspector-toggle ${open ? "context-inspector-toggle--open" : ""}`}
            onClick={toggleOpen}
            title="Konversations-Inspector: Vorschau für den nächsten Send (Systemprompt, Glossar, Kontext-Blöcke)"
          >
            <Eye size={12} />
          </button>
        </div>
      </div>

      {open && <ContextInspector />}
    </div>
  );
}

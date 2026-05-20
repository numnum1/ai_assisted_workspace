import { Eye } from "lucide-react";
import { ContextInspector } from "./ContextInspector";
import { useCallback, useContext, useMemo, useState } from "react";
import ChatContext from "../../chat-context";
import type { ChatViewModel } from "../../chat-view-model";

export interface ContextBarProps {
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview: string | null;
}

export function ContextBar() {
  const [open, setOpen] = useState(false);

  const {
    context: {
      estimatedTokens,
      includedFiles,
      maxTokens,
      percent,
      systemPrompt,
    },
    selectedLLMVersion
  } = useContext<ChatViewModel>(ChatContext);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  function tokenBarColor(tokens: number): string {
    if (tokens >= 100_000) return "var(--red, #f38ba8)";
    if (tokens >= 75_000) return "var(--orange, #fab387)";
    if (tokens >= 60_000) return "var(--yellow, #f9e2af)";
    return "var(--green, #a6e3a1)";
  }

  const expectedCostText: number | null = useMemo(() => {
    if (selectedLLMVersion == null || selectedLLMVersion.cost == null) return null;
    return selectedLLMVersion.cost * estimatedTokens / 1000000
  }, [estimatedTokens, selectedLLMVersion])

  return (
    <div className="context-bar-wrapper">
      <div className="context-bar">
        <div className="context-bar-left"></div>
        <div className="context-bar-right">
          <span
            className="context-bar-system-prompt-hint"
            title="Expected Input Tokens cost"
          >
            {expectedCostText != null ? expectedCostText.toLocaleString(undefined, { style: 'currency', currency: '€', maximumFractionDigits: 6 }) : ''}
          </span>
          <span className="context-bar-files">
            {includedFiles.length} files in context
          </span>
          {maxTokens ? (
            <span
              className="context-bar-tokens context-bar-tokens--with-bar"
              title={`${estimatedTokens.toLocaleString()} / ${maxTokens!.toLocaleString()} tokens`}
            >
              <span
                className="context-bar-token-pct"
                style={{
                  color: tokenBarColor(estimatedTokens),
                }}
              >
                {percent ?? 0}%
              </span>
              <span className="context-bar-token-bar" aria-hidden="true">
                <span
                  className="context-bar-token-bar-fill"
                  style={{
                    width: `${percent ?? 0}%`,
                    background: tokenBarColor(estimatedTokens),
                  }}
                />
              </span>
              ~{estimatedTokens.toLocaleString()} /{" "}
              {(maxTokens ? maxTokens / 1000 : 0).toFixed(0)}k
            </span>
          ) : (
            <span className="context-bar-tokens">
              ~{estimatedTokens.toLocaleString()} tokens
            </span>
          )}
          {systemPrompt != null && systemPrompt.length > 0 && (
            <span
              className="context-bar-system-prompt-hint"
              title="Zeichen im vollständigen Systemprompt (nächster Send)"
            >
              {systemPrompt.length.toLocaleString()} Zeichen System
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

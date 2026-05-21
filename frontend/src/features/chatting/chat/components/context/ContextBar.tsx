import { Eye } from "lucide-react";
import { ContextInspector } from "./ContextInspector";
import { useCallback, useContext, useMemo, useState } from "react";
import ChatContext from "../../chat-context";
import type { ChatViewModel } from "../../chat-view-model";
import { useUserMessage } from "../../useUserMessage";
import { calculateTokensFromString } from "../../../../../utils/contextTools";

export interface ContextBarProps {
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview: string | null;
}

export function ContextBar() {
  const [open, setOpen] = useState(false);

  const {
    id,
    context: {
      estimatedTokens,
      includedFiles,
      maxTokens,
      percent,
    },
    selectedLLMVersion,
  } = useContext<ChatViewModel>(ChatContext);

  const enteredUserMessage = useUserMessage(id);
  console.log('ContextBar rendered')

  const actualTokens = useMemo(() => {
    return estimatedTokens + calculateTokensFromString(enteredUserMessage)
  }, [estimatedTokens, enteredUserMessage])

  const actualPercentage = useMemo(() => {
    if (maxTokens == null) return 0
    return actualTokens * 100 / maxTokens
  }, [actualTokens, maxTokens])

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
    if (selectedLLMVersion == null || selectedLLMVersion.cost == null)
      return null;
    const rawCost = (selectedLLMVersion.cost * actualTokens) / 1000000;
    return Math.ceil(rawCost * 100) / 100; // round up to the next cent
  }, [actualTokens, selectedLLMVersion]);

  return (
    <div className="context-bar-wrapper">
      <div className="context-bar">
        <div className="context-bar-left">
          <span
            className="context-bar-system-prompt-hint"
            title="Expected Input Tokens cost"
          >
            {expectedCostText != null
              ? "" + expectedCostText + "€"
              : "No cost specified"}
          </span>
        </div>
        <div className="context-bar-right">
          <span className="context-bar-files">
            {includedFiles.length} files in context
          </span>
          {maxTokens ? (
            <span
              className="context-bar-tokens context-bar-tokens--with-bar"
              title={`${actualTokens.toLocaleString()} / ${maxTokens!.toLocaleString()} tokens`}
            >
              <span
                className="context-bar-token-pct"
                style={{
                  color: tokenBarColor(actualTokens),
                }}
              >
                {actualPercentage ?? 0}%
              </span>
              <span className="context-bar-token-bar" aria-hidden="true">
                <span
                  className="context-bar-token-bar-fill"
                  style={{
                    width: `${actualPercentage ?? 0}%`,
                    background: tokenBarColor(actualTokens),
                  }}
                />
              </span>
              ~{actualTokens.toLocaleString()} /{" "}
              {(maxTokens ? maxTokens / 1000 : 0).toFixed(0)}k
            </span>
          ) : (
            <span className="context-bar-tokens">
              ~{actualTokens.toLocaleString()} tokens
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

      {open && <ContextInspector userInput={enteredUserMessage} />}
    </div>
  );
}

import { useContext, useMemo } from "react";
import { Brain } from "lucide-react";
import { ContextInspectorEntry } from "./ContextInspectorEntry.tsx";
import ChatContext from "../../chat-context";
import { calculateTokensFromString } from "../../../../../utils/contextTools.ts";

export function ContextInspector() {
  const {
    context: { systemPrompt, maxTokens },
  } = useContext(ChatContext);

  const systemPromptSize = useMemo(
    () => calculateTokensFromString(systemPrompt),
    [systemPrompt],
  );

  const systemPromptPercentage = useMemo(() => {
    return maxTokens ? systemPromptSize / maxTokens : 0;
  }, [maxTokens, systemPromptSize]);

  return (
    <div className="context-inspector">
      <div className="context-inspector-header">
        <span className="context-inspector-title">Context-Inspector</span>
      </div>
      <div className="context-inspector-body">
        <div className="context-inspector-scroll">
          <ContextInspectorEntry
            name="Systemprompt (gesamt)"
            icon={Brain}
            size={systemPromptSize}
            percentage={systemPromptPercentage}
            Content={<pre>{systemPrompt}</pre>}
            contentClassName="context-block-content--system-prompt"
          />

          <span>Here Belongs The Glossary</span>

          <div className="context-inspector-section-title">Kontext-Blöcke</div>
          {/* TODO: Add missing context blocks */}
        </div>
      </div>
    </div>
  );
}

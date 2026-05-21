import { useContext, useMemo } from "react";
import { Brain, Wrench } from "lucide-react";
import { ContextInspectorEntry } from "./ContextInspectorEntry.tsx";
import ChatContext from "../../chat-context";
import { calculateTokensFromString } from "../../../../../utils/contextTools.ts";
import { ToolsInspectorContent } from "./ToolsInspectorContent.tsx";
import { computeToolSize, type Tool } from "../../../tools/tool.ts";
import { TOOLKITS } from "../../../tools/toolkits.ts";
import type { ChatViewModel } from "../../chat-view-model.ts";

export function ContextInspector({userInput, systemPrompt, maxTokens, enabledToolkitIds }: {userInput: string}) {
  const {
    context: { systemPrompt, maxTokens },
    settings: { enabledToolkitIds },
  } = useContext<ChatViewModel>(ChatContext);

  const systemPromptSize = useMemo(
    () => calculateTokensFromString(systemPrompt),
    [systemPrompt],
  );

  const systemPromptPercentage = useMemo(() => {
    return maxTokens ? systemPromptSize / maxTokens : 0;
  }, [maxTokens, systemPromptSize]);

  const toolsSize = useMemo(() => {
    let res = 0;
    TOOLKITS.filter((t) => enabledToolkitIds.includes(t.id)).forEach((t) => {
      t.tools.forEach((tool: Tool) => {
        res += computeToolSize(tool)
      });
    });
    return res;
  }, [enabledToolkitIds]);

  const toolsPercentage = useMemo(() => {
    return maxTokens ? toolsSize / maxTokens : 0;
  }, [maxTokens, toolsSize]);

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
          <ContextInspectorEntry
            name="Tools"
            icon={Wrench}
            size={toolsSize}
            percentage={toolsPercentage}
            Content={<ToolsInspectorContent />}
            contentClassName="context-block-content--system-prompt"
          />
        </div>
      </div>
    </div>
  );
}

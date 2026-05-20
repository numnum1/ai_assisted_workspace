import { useMemo, useContext } from "react";
import { TOOLKITS } from "../../../tools/toolkits";
import type { Tool } from "../../../tools/tool";

import { computeToolSize } from "../../../tools/tool";
import type { ChatViewModel } from "../../chat-view-model";
import ChatContext from "../../chat-context";

export function ToolsInspectorContent() {
  const {
    settings: { enabledToolkitIds },
  } = useContext<ChatViewModel>(ChatContext);

  const tools: Tool[] = useMemo(() => {
    const res: Tool[] = [];
    TOOLKITS.filter((t) => enabledToolkitIds.includes(t.id)).forEach((t) => {
      res.push(...t.tools);
    });
    return res;
  }, [enabledToolkitIds]);

  return (
    <div className="tools-inspector-table-wrapper">
      <table className="tools-inspector-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Beschreibung</th>
            <th style={{ textAlign: "right" }}>Größe (Tokens)</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.function.name}>
              <td>
                <code>{tool.label}</code>
              </td>
              <td>{tool.function.description}</td>
              <td
                style={{
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {computeToolSize(tool)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

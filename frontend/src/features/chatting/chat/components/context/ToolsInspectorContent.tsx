import { useMemo, useContext } from 'react';
import { TOOLKITS } from "../../../tools/toolkits";
import type { Tool } from "../../../tools/tool";

import { ToolsInspectorEntry } from "./ToolsInspectorEntry";
import type { ChatViewModel } from '../../chat-view-model';
import ChatContext from '../../chat-context';

export function ToolsInspectorContent() {

  const { settings: { enabledToolkitIds } } = useContext<ChatViewModel>(ChatContext)

  const tools: Tool[] = useMemo(() => {
    const res: Tool[] = [];
    TOOLKITS.filter((t) => enabledToolkitIds.includes(t.id)).forEach((t) => {
      res.push(...t.tools);
    });
    return res;
  }, [enabledToolkitIds]);

  return (
    <div>
      {tools.map((tool, index) => (
        <ToolsInspectorEntry key={index} tool={tool} />
      ))}
    </div>
  );
}

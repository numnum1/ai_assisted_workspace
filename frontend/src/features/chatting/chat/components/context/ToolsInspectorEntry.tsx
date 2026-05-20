import type { Tool } from "../../../tools/tool";

export function ToolsInspectorEntry({ tool }: { tool: Tool }) {
  return <div>{tool.label}</div>;
}

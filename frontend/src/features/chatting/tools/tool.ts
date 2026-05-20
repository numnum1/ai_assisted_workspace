export type Tool = {
  type: "function";
  label: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export function computeToolSize(tool: Tool): number {
  const definitionJson = JSON.stringify({
    type: tool.type,
    function: tool.function,
  });
  const definitionTokens = Math.ceil(definitionJson.length / 4);
  return definitionTokens;
}
import type { LLM } from "../../project/project-types";

export function LLMSelector({
  selectedLLMId,
  setSelectedLLMId,
  availableLLMs,
}: {
  selectedLLMId: string | null;
  setSelectedLLMId: (newSelectedLLMId: string) => void;
  availableLLMs: LLM[];
}) {
  return (
    <select
      className="chat-llm-select"
      value={selectedLLMId ?? ''}
      onChange={(e) => setSelectedLLMId(e.target.value)}
      title="LLM auswählen"
    >
      <option value="">— Standard —</option>
      {availableLLMs.map((llm) => (
        <option key={llm.id} value={llm.id}>
          {llm.name}
        </option>
      ))}
    </select>
  );
}

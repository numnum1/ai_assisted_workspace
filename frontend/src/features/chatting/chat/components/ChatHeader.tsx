import { Wand2, Pencil } from "lucide-react";
import { ModeSelector } from "./ModeSelector";
import type { ProjectViewModel } from "../../project/project-types";
import { useCallback, useContext, useMemo, useState } from "react";
import ProjectContext from "../../project/project-context";
import type { SelectedLLM } from "../unsortedChatTypes";

const noop = () => {};

export function ChatHeader({
  name,
  rename,
  onHistoryButtonClicked,
  onNewChatButtonClicked,
  selectedModeId,
  selectMode,
  selectedLLM,
}: {
  name: string;
  rename: (newName: string) => void;
  onHistoryButtonClicked: () => void;
  onNewChatButtonClicked: () => void;
  selectedModeId: string | null;
  selectMode: (newSelectedMode: string) => void;
  selectedLLM: SelectedLLM;
}) {
  const {
    settings: { modes, llms },
    findModeById,
    findLLMById,
  }: ProjectViewModel = useContext<ProjectViewModel>(ProjectContext);

  const selectedMode = useMemo(() => {
    return selectedModeId ? findModeById(selectedModeId) : null;
  }, [findModeById, selectedModeId]);

  const selectedLLMData = useMemo(() => {
    return selectedLLM.id ? findLLMById(selectedLLM.id) : null;
  }, [selectedLLM.id, findLLMById]);

  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const startRenaming = useCallback(() => {
    setRenameTitle("");
    setRenaming(true);
  }, [setRenameTitle, setRenaming]);
  const applyNewName = useCallback(() => {
      rename(renameTitle)
      setRenaming(false)
  }, [rename, renameTitle, setRenaming]);

  // #region placeholder
  console.log(
    JSON.stringify({
      name,
      rename,
      onHistoryButtonClicked,
      onNewChatButtonClicked,
    }),
  );

  const onOpenPromptPack = false;

  const guidedExecSummary = null as {
    modeLabel: string;
    llmLabel: string;
  } | null;
  // #endregion

  return (
    <div className="chat-header">
      {guidedExecSummary ? (
        <div
          className="chat-guided-execution-summary"
          role="status"
          aria-label={`Geführte Sitzung: Modus ${guidedExecSummary.modeLabel}, LLM ${guidedExecSummary.llmLabel}`}
          title={`Modus: ${guidedExecSummary.modeLabel} — LLM: ${guidedExecSummary.llmLabel}`}
        >
          <span className="chat-guided-execution-summary-text">
            {guidedExecSummary.modeLabel}
            <span className="chat-guided-execution-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            {guidedExecSummary.llmLabel}
          </span>
        </div>
      ) : (
        <div className="mode-selector-placeholder" data-testid="modeSelector">
          <ModeSelector
            modes={modes}
            selectedMode={selectedMode}
            selectMode={selectMode}
          />
        </div>
      )}
      <div className="chat-header-actions">
        {!guidedExecSummary && llms.length > 0 && (
          <select
            className="chat-llm-select"
            value={selectedLLMData?.name ?? ""}
            onChange={noop}
            title="LLM auswählen"
          >
            <option value="">— Standard —</option>
            {llms.map((llm) => (
              <option key={llm.id} value={llm.id}>
                {llm.name}
              </option>
            ))}
          </select>
        )}
        {onOpenPromptPack && (
          <button
            type="button"
            className="chat-prompt-pack-btn"
            onClick={noop}
            title="Prompt-Paket (Export für ChatGPT / Grok)"
          >
            <Wand2 size={14} />
          </button>
        )}
      </div>
      <div className="chat-header-title-row">
        {renaming ? (
          <input
            className="chat-header-rename-input"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyNewName();
              if (e.key === "Escape") setRenaming(false);
            }}
            autoFocus
          />
        ) : (
          <span className="chat-header-title" title={name}>
            {name}
          </span>
        )}
        <button
          className="chat-header-rename-btn"
          onClick={startRenaming}
          title="Chat umbenennen"
        >
          <Pencil size={11} />
        </button>
      </div>
    </div>
  );
}

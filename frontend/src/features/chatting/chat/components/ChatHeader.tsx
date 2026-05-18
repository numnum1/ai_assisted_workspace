import { Pencil } from "lucide-react";
import { ModeSelector } from "./ModeSelector";
import type { ProjectViewModel } from "../../project/project-types";
import { useCallback, useContext, useMemo, useState } from "react";
import ProjectContext from "../../project/project-context";
import { LLMSelector } from "./LLMSelector";
import ChatContext from "../chat-context";
import type { ChatViewModel } from "../chat-view-model";

export function ChatHeader() {
  const { name, rename, selectMode, selectLLM, settings: { selectedModeId, selectedLLM: { id: selectedLLMId } } } =
    useContext<ChatViewModel>(ChatContext);

  const {
    settings: { modes, llms },
    findModeById,
  }: ProjectViewModel = useContext<ProjectViewModel>(ProjectContext);

  const selectedMode = useMemo(() => {
    return selectedModeId ? findModeById(selectedModeId) : null;
  }, [findModeById, selectedModeId]);

  const [renameTitle, setRenameTitle] = useState("");
  const [renaming, setRenaming] = useState(false);
  const startRenaming = useCallback(() => {
    setRenameTitle("");
    setRenaming(true);
  }, [setRenameTitle, setRenaming]);
  const applyNewName = useCallback(() => {
    rename(renameTitle);
    setRenaming(false);
  }, [rename, renameTitle, setRenaming]);

  // #region placeholder
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
        <LLMSelector
          selectedLLMId={selectedLLMId}
          setSelectedLLMId={selectLLM}
          availableLLMs={llms}
        />
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

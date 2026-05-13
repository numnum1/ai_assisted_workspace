import { History, Wand2, Pencil, Maximize2, Minimize2 } from "lucide-react";
import { ModeSelector } from "./ModeSelector";
import type { ProjectViewModel } from "../../project/project-types";
import { useContext, useMemo } from "react";
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

  // #region placeholder
  console.log(
    JSON.stringify({
      name,
      rename,
      onHistoryButtonClicked,
      onNewChatButtonClicked,
    }),
  );

  const isFullscreen = false;
  const toggleFullscreen = () => {};
  const onOpenPromptPack = false;
  const activeIsThread = false;
  const renamingTitle = false;
  const toggleHistoryOpen = () => {};
  const historyOpen = false;
  const setNewChatDialogOpen = (newOpen: boolean) => {
    console.log(newOpen);
  };
  const titleDraft = "TitleDraft";
  const setTitleDraft = (newTitleDraft: string) => {
    console.log(newTitleDraft);
  };
  const setRenamingTitle = (newRenamingTitle: boolean) => {
    console.log(newRenamingTitle);
  };
  const activeTitle = "Active Title";

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
          {/* ModeSelector Platzhalter */}
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
        {renamingTitle ? (
          <input
            className="chat-header-rename-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setRenamingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") setRenamingTitle(false);
              if (e.key === "Escape") setRenamingTitle(false);
            }}
            autoFocus
          />
        ) : (
          <span className="chat-header-title" title={activeTitle}>
            {activeTitle}
          </span>
        )}
        <button
          className="chat-header-rename-btn"
          onClick={() => {
            setTitleDraft(activeTitle);
            setRenamingTitle(true);
          }}
          title="Chat umbenennen"
        >
          <Pencil size={11} />
        </button>
      </div>
    </div>
  );
}

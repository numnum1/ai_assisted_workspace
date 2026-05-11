import { History, Wand2, Pencil, Maximize2, Minimize2 } from "lucide-react";
import type { AssistantMode } from "../../project/useProject";

export interface ChatHeaderProps {
  name: string
  rename: (newName: string) => void
  onHistoryButtonClicked: () => void
  onNewChatButtonClicked: () => void
  selectedMode: AssistantMode | null
  availableModes: AssistantMode[]
}

const noop = () => {};

export function ChatHeader({
  name,
  rename,
  onHistoryButtonClicked,
  onNewChatButtonClicked,
  selectedMode,
  availableModes
}: ChatHeaderProps) {
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
          <span>Mode: {selectedMode || "Standard"}</span>
        </div>
      )}
      <div className="chat-header-actions">
        {!guidedExecSummary && llms.length > 0 && (
          <select
            className="chat-llm-select"
            value={selectedLlmId ?? ""}
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
        <button
          type="button"
          data-testid="expandButton"
          className={`chat-history-btn ${isFullscreen ? "active" : ""}`}
          onClick={() => setIsFullscreen((v) => !v)}
          title={
            activeIsThread
              ? "Thread-Workspace öffnen"
              : isFullscreen
                ? "Vergrößerte Ansicht schließen (Esc)"
                : "Chat vergrößern"
          }
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          className={`chat-history-btn ${historyOpen ? "active" : ""}`}
          onClick={() => setHistoryOpen((prev) => !prev)}
          title="Chat-Historie"
        >
          <History size={14} />
        </button>
        <button
          type="button"
          className="new-chat-button"
          onClick={() => setNewChatDialogOpen(true)}
          title="Neuer Chat"
        >
          +
        </button>
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

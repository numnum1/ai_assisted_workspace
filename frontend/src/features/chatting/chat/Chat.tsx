import { useRef, useState } from "react";
import { History, Wand2, Pencil, Maximize2, Minimize2 } from "lucide-react";
import type { ChatSettings, Conversation } from "./unsortedChatTypes";
import { ChatMessagesPane } from "../../../components/chat/ChatMessagesPane";
import type { ChatMessage } from "../../../types";
import type { CardState } from "../../../components/chat/ChangeCard";

export type Chat = {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
};

export function ChatPane({
  parentChatId: _parentChatId,
  id: _id,
  name,
  conversation: _conversation,
  settings: _settings,
  setChat: _setChat,
  findChatById: _findChatById,
}: {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
  setChat: (id: string, patch: Partial<Chat>) => void;
  findChatById: (id: string) => Chat | null;
}) {
  // UI-States (keine Geschäftslogik)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [steeringPlanOpen, setSteeringPlanOpen] = useState(true);
  const [glossaryPopup, setGlossaryPopup] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const [glossaryForm, setGlossaryForm] = useState<{
    term: string;
    definition: string;
  } | null>(null);
  const [glossarySaving, setGlossarySaving] = useState(false);

  // Platzhalter-Daten
  const activeTitle = name;
  const guidedExecSummary = null as {
    modeLabel: string;
    llmLabel: string;
  } | null;
  const selectedMode = "";
  const selectedLlmId = undefined as string | undefined;
  const llms = [] as { id: string; name: string }[];
  const activeIsThread = false;
  const onOpenPromptPack = undefined as (() => void) | undefined;
  const activeSessionKind = "standard" as "standard" | "guided";
  const streaming = false;
  const error = null as string | null;
  const toolActivity = null as string | null;
  const useReasoning = false;
  const reasoningAvailable = true;
  const fastAvailable = true;
  const fullscreen = false;
  const steeringPlan = "";
  const contextInfo = null;
  const activeFile = null as string | null;
  const isDirty = false;
  const systemPromptPreview = null as string | null;
  const activeSelection = null;
  const referencedFiles = [] as string[];
  const structureRoot = null as string | null;
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [bulkDismissIds] = useState(() => new Set<string>());
  const [composerBatchForced] = useState<Record<string, CardState>>({});

  const messages = [
    {
      role: "user" as const,
      content: "Hallo, kannst du mir bei einem React-Problem helfen?",
    },
    {
      role: "assistant" as const,
      content:
        "Natürlich! Beschreib einfach, worum es geht — ob State-Management, Rendering, Performance oder Styling. Ich schaue mir das gerne an.",
    },
  ] as ChatMessage[];
  const disabledToolkits = new Set<string>();

  const noop = () => {};
  const cancelEdit = () => setEditingIdx(null);
  const commitEdit = (_index: number, _text: string) => {
    setEditingIdx(null);
  };

  return (
    <div className={`chat-panel${isFullscreen ? " chat-panel--expanded" : ""}`}>
      {/* ===== HEADER (aus ChatPanel.tsx) ===== */}
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

      {/* ===== CHAT HISTORY ===== */}
      {historyOpen && (
        <div className="chat-history-placeholder" data-testid="chatHistory">
          {/* ChatHistory Platzhalter */}
        </div>
      )}

      <div className="chat-panel-body">
        {/* ===== CHAT PANE (aus ChatPane.tsx) ===== */}
        <div className="chat-pane" data-testid="chatPane">
          <div className="chat-panel-body-main">
            {/* ---- Messages Pane ---- */}
            <ChatMessagesPane
              messages={messages}
              readOnly={false}
              scrollRef={messagesScrollRef}
              streaming={streaming}
              error={error}
              toolActivity={toolActivity}
              activeIsThread={activeIsThread}
              editingIdx={editingIdx}
              setEditingIdx={setEditingIdx}
              copiedIdx={copiedIdx}
              setCopiedIdx={setCopiedIdx}
              bulkDismissIds={bulkDismissIds}
              composerBatchForced={composerBatchForced}
              onForkFromMessage={noop}
              onStartThreadFromMessage={noop}
              onForkToNewConversation={noop}
              onEditMessage={noop}
              onDeleteMessages={noop}
              commitEdit={commitEdit}
              cancelEdit={cancelEdit}
              theme="dark"
            />

            {/* ---- Steering Plan ---- */}
            {activeSessionKind === "guided" && (
              <div
                className="chat-steering-plan-panel"
                data-testid="steeringPlanSection"
              >
                <button
                  type="button"
                  className="chat-steering-plan-toggle"
                  onClick={() => setSteeringPlanOpen((o) => !o)}
                  aria-expanded={steeringPlanOpen}
                >
                  Arbeitsplan
                  <span className="chat-steering-plan-chevron">
                    {steeringPlanOpen ? "▼" : "▶"}
                  </span>
                </button>
                {steeringPlanOpen && (
                  <div className="chat-steering-plan-body">
                    {steeringPlan.trim() ? (
                      <>
                        <div className="steering-plan-viewer-placeholder">
                          {/* SteeringPlanViewer Platzhalter */}
                          <pre>{steeringPlan}</pre>
                        </div>
                        <div className="chat-steering-plan-actions">
                          <button
                            type="button"
                            className="chat-steering-plan-mark-complete-btn"
                            disabled={streaming}
                            onClick={noop}
                          >
                            Plan als abgeschlossen markieren
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="chat-steering-plan-empty">
                        Noch kein Plan — die Assistentin legt ihn in der ersten
                        inhaltlichen Antwort als Markdown-Block mit Sprache{" "}
                        <code>plan</code> an.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ---- Composer Stack ---- */}
            <div className="chat-composer-stack">
              {/* SuggestedActionsCard Platzhalter */}
              <div
                className="chat-composer-card-placeholder"
                data-testid="suggestedActionsCard"
              >
                {/* SuggestedActionsCard */}
              </div>

              {/* GuidedThreadOfferCard Platzhalter */}
              <div
                className="chat-composer-card-placeholder"
                data-testid="guidedThreadOfferCard"
              >
                {/* GuidedThreadOfferCard */}
              </div>

              {/* WriteFileBatchComposerBar Platzhalter */}
              <div
                className="write-file-batch-composer-bar-placeholder"
                data-testid="writeFileBatchComposerBar"
              >
                {/* WriteFileBatchComposerBar */}
              </div>

              {/* ChatInput Platzhalter */}
              <div className="chat-input-container" data-testid="chatInput">
                {activeSelection && (
                  <div className="chat-selection-chip">
                    <span className="chat-selection-chip-text">
                      &ldquo;Auswahl&rdquo;
                    </span>
                    <button
                      type="button"
                      className="chat-selection-chip-dismiss"
                      onClick={noop}
                      title="Auswahl entfernen"
                    >
                      ×
                    </button>
                  </div>
                )}
                {referencedFiles.length > 0 && (
                  <div className="chat-input-files">
                    {referencedFiles.map((f) => (
                      <span key={f} className="file-chip">
                        {f}
                        <button onClick={noop}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="chat-input-toolbar-card">
                  <div className="chat-input-row">
                    <textarea
                      className="chat-textarea"
                      placeholder="Nachricht..."
                      rows={1}
                      onChange={noop}
                      onKeyDown={noop}
                    />
                    <button
                      type="button"
                      className="chat-expand-btn"
                      onClick={noop}
                      title="Prompt-Fenster öffnen"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <button
                      type="button"
                      className={`chat-reasoning-btn${useReasoning ? " active" : ""}`}
                      onClick={noop}
                      title="Reasoning"
                    >
                      ⚡
                    </button>
                    <button
                      type="button"
                      className="chat-tools-toggle-btn active"
                      onClick={noop}
                      title="Toolkits"
                    >
                      🔧
                    </button>
                    {streaming ? (
                      <button
                        className="chat-send-btn stop"
                        onClick={noop}
                        title="Stop"
                      >
                        ⏹
                      </button>
                    ) : (
                      <button
                        className="chat-send-btn"
                        onClick={noop}
                        title="Send (Enter)"
                      >
                        ➤
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CONTEXT BAR ===== */}
          <div className="context-bar" data-testid="contextBar">
            {/* ContextBar Platzhalter */}
            {activeFile && (
              <div className="context-bar-active-file">
                {activeFile} {isDirty && "●"}
              </div>
            )}
            {systemPromptPreview && (
              <div className="context-bar-system-prompt">
                {systemPromptPreview}
              </div>
            )}
          </div>

          {/* ===== GLOSSARY POPUP ===== */}
          {glossaryPopup &&
            !glossaryForm &&
            !disabledToolkits.has("glossary") && (
              <div
                className="glossary-selection-popup"
                style={{ left: glossaryPopup.x, top: glossaryPopup.y }}
              >
                <button
                  className="glossary-selection-btn"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setGlossaryForm({
                      term: glossaryPopup.selectedText,
                      definition: "",
                    });
                  }}
                >
                  📖 Als Glossar-Begriff speichern
                </button>
              </div>
            )}

          {/* ===== GLOSSARY SAVE DIALOG ===== */}
          {glossaryForm && !disabledToolkits.has("glossary") && (
            <div
              className="glossary-save-overlay"
              onClick={() => {
                setGlossaryForm(null);
                setGlossaryPopup(null);
              }}
            >
              <div
                className="glossary-save-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="glossary-save-title">
                  Glossar-Eintrag speichern
                </div>
                <label className="glossary-save-label">
                  Begriff
                  <input
                    className="glossary-save-input"
                    value={glossaryForm.term}
                    onChange={(e) =>
                      setGlossaryForm({ ...glossaryForm, term: e.target.value })
                    }
                    autoFocus
                  />
                </label>
                <label className="glossary-save-label">
                  Definition
                  <textarea
                    className="glossary-save-textarea"
                    value={glossaryForm.definition}
                    onChange={(e) =>
                      setGlossaryForm({
                        ...glossaryForm,
                        definition: e.target.value,
                      })
                    }
                    rows={3}
                    placeholder="Kurze Erklärung..."
                  />
                </label>
                <div className="glossary-save-actions">
                  <button
                    className="glossary-save-cancel"
                    onClick={() => {
                      setGlossaryForm(null);
                      setGlossaryPopup(null);
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    className="glossary-save-confirm"
                    disabled={
                      !glossaryForm.term.trim() ||
                      !glossaryForm.definition.trim() ||
                      glossarySaving
                    }
                    onClick={() => {
                      setGlossarySaving(true);
                      setTimeout(() => {
                        setGlossarySaving(false);
                        setGlossaryForm(null);
                        setGlossaryPopup(null);
                      }, 500);
                    }}
                  >
                    {glossarySaving ? "Speichere…" : "Speichern"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== NEW CHAT DIALOG ===== */}
      {newChatDialogOpen && (
        <div
          className="new-chat-dialog-placeholder"
          data-testid="newChatDialog"
        >
          {/* NewChatDialog Platzhalter */}
        </div>
      )}
    </div>
  );
}

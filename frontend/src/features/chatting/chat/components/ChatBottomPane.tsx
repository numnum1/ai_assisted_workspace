export interface ChatComposerProps {
  activeSelection: unknown;
  referencedFiles: string[];
  streaming: boolean;
  useReasoning: boolean;
}

const noop = () => {};

export function ChatBottomPane({
  activeSelection,
  referencedFiles,
  streaming,
  useReasoning,
}: ChatComposerProps) {
  return (
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
        {!!activeSelection && (
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
  );
}

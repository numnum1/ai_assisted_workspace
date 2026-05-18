export function ChatBottomParts() {
  const activeSelection = false;
  const referencedFiles: string[] = [];
  const noop = () => {};

  return (
    <>
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
      </div>
    </>
  );
}

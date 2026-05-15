export function ConversationPane({}: {}) {
  return (
    <div
      className={`chat-messages${readOnly ? " chat-messages--readonly" : ""}`}
      data-testid="ChatMessagesPane"
      ref={scrollRef}
      onMouseUp={readOnly ? undefined : onMouseUp}
    >
      {parentLastMessage && (
        <div className="thread-parent-context-banner">
          <div className="thread-parent-context-content">
            {parentLastMessage.role === "user" ? (
              <span className="thread-parent-context-role">Du</span>
            ) : parentLastMessage.role === "assistant" ? (
              <span className="thread-parent-context-role">Assistent</span>
            ) : null}
            <p className="thread-parent-context-text">
              {parentLastMessage.content.length > 300
                ? parentLastMessage.content.slice(0, 300) + "…"
                : parentLastMessage.content}
            </p>
          </div>
          <div className="thread-parent-context-divider" />
        </div>
      )}
      {messages.filter((m) => !m.hidden).length === 0 && (
        <div className="chat-empty">
          <p>Start a conversation with your AI assistant.</p>
          <p className="chat-empty-hint">
            Drag files from the project tree into the input area to reference
            them, or use @filename syntax in the input area.
            {onOpenPromptPack && !readOnly && (
              <>
                {" "}
                Für einen fertigen Export-Prompt nutze das Zauberstab-Symbol
                oben (Prompt-Paket).
              </>
            )}
          </p>
        </div>
      )}
      {activeIsThread && visibleEntries.length > 0 && (
        <div className="thread-start-indicator">
          <GitFork
            className="thread-start-indicator-icon"
            size={14}
            aria-hidden
          />
          <span className="thread-start-indicator-text">Thread-Startpunkt</span>
        </div>
      )}
      {renderUnits.map((unit) => {
        if (unit.type === "assistantTurn") {
          return (
            <AssistantTurnCard
              key={`turn-${unit.originalIndices.join("-")}`}
              originalIndices={unit.originalIndices}
              lastOriginalIdx={unit.lastOriginalIdx}
              firstVisIdx={unit.firstVisIdx}
              subUnits={unit.subUnits}
              messages={messages}
              visibleEntries={visibleEntries}
              renderUnits={renderUnits}
              readOnly={readOnly}
              streaming={streaming}
              activeIsThread={activeIsThread}
              bulkDismissIds={dismissIds}
              composerBatchForced={batchForced}
              copiedIdx={copiedIdx}
              setCopiedIdx={setCopiedIdx}
              onFileChanged={fileCb}
              onSnapshotSettled={snapshotCb}
              onForkFromMessage={onForkFromMessage}
              onStartThreadFromMessage={onStartThreadFromMessage}
              onForkToNewConversation={onForkToNewConversation}
              onDeleteMessages={onDeleteMessages}
              onUseMessageAsThreadSummary={onUseMessageAsThreadSummary}
              onReplaceSelection={onReplaceSelection}
              onApplyFieldUpdate={onApplyFieldUpdate}
              fieldLabels={fieldLabels}
            />
          );
        }

        const { visIdx, msg, originalIdx } = unit;
        const visArr = visibleEntries;
        const isLastUserMsg =
          msg.role === "user" &&
          !visArr.slice(visIdx + 1).some(({ msg: m }) => m.role === "user");
        const displayModeColor =
          msg.role === "user" && msg.modeColor
            ? (effectiveModeColor(msg.modeColor, theme) ?? msg.modeColor)
            : undefined;

        return (
          <div key={originalIdx}>
            <div
              className={`chat-message ${msg.role}`}
              style={
                displayModeColor
                  ? {
                      backgroundColor: displayModeColor,
                      borderLeftColor: displayModeColor,
                      color: getContrastingTextColor(displayModeColor),
                    }
                  : undefined
              }
            >
              {(msg.role === "user" || msg.role === "system") && (
                <div
                  className="chat-message-role"
                  style={
                    displayModeColor
                      ? { color: getContrastingTextColor(displayModeColor) }
                      : undefined
                  }
                >
                  {msg.role === "user" ? (
                    <span>
                      You
                      {msg.mode && (
                        <span
                          className="chat-message-mode"
                          style={{
                            color: getContrastingTextColor(displayModeColor),
                          }}
                        >
                          {" · "}
                          {msg.mode}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>Thread · Kontext</span>
                  )}
                </div>
              )}
              <div
                className={
                  msg.role === "assistant"
                    ? "chat-message-content chat-message-md"
                    : msg.role === "system"
                      ? "chat-message-content chat-message-system-md chat-message-md"
                      : "chat-message-content"
                }
              >
                {msg.role === "assistant" ? (
                  <ChatMessageMarkdown
                    content={msg.content}
                    streamingCursor={
                      !readOnly &&
                      streaming &&
                      originalIdx === messages.length - 1
                    }
                    selectionContext={msg.selectionContext}
                    onReplace={
                      !readOnly && msg.selectionContext && onReplaceSelection
                        ? (text) =>
                            onReplaceSelection(text, msg.selectionContext!)
                        : undefined
                    }
                    onApplyFieldUpdate={
                      readOnly ? undefined : onApplyFieldUpdate
                    }
                    fieldLabels={fieldLabels}
                    suppressClarificationWidget={hasClarificationFence(
                      msg.content,
                    )}
                  />
                ) : msg.role === "system" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                ) : readOnly || editingIdx !== originalIdx ? (
                  msg.content
                ) : (
                  <MessageEditBox
                    initialContent={msg.content}
                    onSave={(text) => commitEdit(originalIdx, text)}
                    onCancel={cancelEdit}
                  />
                )}
              </div>
              {!readOnly && !streaming && editingIdx !== originalIdx && (
                <div className="chat-fork-actions">
                  <button
                    type="button"
                    className="chat-fork-btn"
                    onClick={() => onStartThreadFromMessage(originalIdx)}
                    title="Thread starten (neuer Chat mit bisherigem Verlauf)"
                  >
                    <MessageSquare size={12} />
                  </button>
                  {msg.role === "user" && isLastUserMsg && (
                    <button
                      type="button"
                      className="chat-fork-btn chat-resend-btn"
                      onClick={() => onEditMessage(originalIdx, msg.content)}
                      title="Nachricht erneut senden"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                  {msg.role === "user" && (
                    <button
                      type="button"
                      className="chat-fork-btn chat-edit-btn"
                      onClick={() => setEditingIdx(originalIdx)}
                      title="Nachricht bearbeiten"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {visIdx > 0 && (
                    <button
                      type="button"
                      className="chat-fork-btn"
                      onClick={() => onForkFromMessage(originalIdx)}
                      title="Hier abschneiden (in-place)"
                    >
                      <Scissors size={12} />
                    </button>
                  )}
                  {visIdx > 0 && (
                    <button
                      type="button"
                      className="chat-fork-btn"
                      onClick={() => onForkToNewConversation(originalIdx)}
                      title="Als neuen Chat forken"
                    >
                      <GitFork size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="chat-fork-btn chat-fork-btn--danger"
                    onClick={() => onDeleteMessages([originalIdx])}
                    title="Nachricht löschen"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!readOnly && toolActivity && streaming && (
        <div className="chat-tool-activity">
          <Search size={14} className="chat-tool-activity-icon" />
          <span>{toolActivity}</span>
        </div>
      )}
      {!readOnly && error && (
        <div className="chat-message error">
          <div className="chat-message-content">
            {error === "NETWORK_ERROR" ? (
              <>
                <strong>Verbindungsproblem:</strong> Die KI-API ist nicht
                erreichbar.
                <br />
                Bitte VPN-Verbindung prüfen — aktive VPN-Verbindungen können die
                DNS-Auflösung blockieren.
              </>
            ) : error === "MODEL_EMPTY_RESPONSE" ? (
              "Das Modell hat keine Antwort geliefert (Kontext zu lang oder Inhaltsfilter)."
            ) : (
              `Error: ${error}`
            )}
          </div>
          {(error === "MODEL_EMPTY_RESPONSE" || error === "NETWORK_ERROR") &&
            onRetry && (
              <button
                type="button"
                className="chat-retry-btn"
                onClick={onRetry}
              >
                Erneut versuchen
              </button>
            )}
        </div>
      )}
    </div>
  );
}

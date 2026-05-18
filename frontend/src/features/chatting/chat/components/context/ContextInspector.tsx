export function ContextInspector() {
  return (
    <div className="context-inspector">
      <div className="context-inspector-header">
        <span className="context-inspector-title">Context-Inspector</span>
      </div>
      <div className="context-inspector-body">
        <div className="context-inspector-scroll">
          {systemPrompt != null && systemPrompt.length > 0 && (
            <div className="context-block">
              <div
                className="context-block-header"
                onClick={() => setSystemPromptExpanded((v) => !v)}
              >
                <span className="context-block-expand">
                  {systemPromptExpanded ? (
                    <ChevronDown size={11} />
                  ) : (
                    <ChevronRight size={11} />
                  )}
                </span>
                <span className="context-block-icon">🧠</span>
                <span className="context-block-label">
                  Systemprompt (gesamt)
                </span>
                <span className="context-block-tokens">
                  {systemPrompt.length.toLocaleString()} Zeichen
                </span>
                <button
                  type="button"
                  className="context-block-copy-btn"
                  title="Systemprompt in die Zwischenablage kopieren"
                  aria-label="Systemprompt kopieren"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCopySystemPrompt();
                  }}
                >
                  {systemPromptCopied ? (
                    <Check size={11} />
                  ) : (
                    <Copy size={11} />
                  )}
                </button>
              </div>
              {systemPromptExpanded && (
                <div className="context-block-content context-block-content--system-prompt">
                  <pre>{systemPrompt}</pre>
                </div>
              )}
            </div>
          )}

          <div className="context-block">
            <div
              className="context-block-header"
              onClick={() => setGlossaryExpanded((v) => !v)}
            >
              <span className="context-block-expand">
                {glossaryExpanded ? (
                  <ChevronDown size={11} />
                ) : (
                  <ChevronRight size={11} />
                )}
              </span>
              <span className="context-block-icon">{typeIcon("glossary")}</span>
              <span className="context-block-label">Glossar</span>
            </div>
            {glossaryExpanded && (
              <div className="context-block-content context-block-content--glossary">
                <GlossarContextView expanded={glossaryExpanded} />
              </div>
            )}
          </div>

          <div className="context-inspector-section-title">Kontext-Blöcke</div>
          {loading && !blocks && (
            <div className="context-inspector-loading">Lade Vorschau…</div>
          )}
          {blocks && (
            <div className="context-inspector-blocks-inner">
              {blocks.map((block, idx) => {
                const key = `${block.type}-${idx}`;
                const isExpanded = expandedBlock === key;
                return (
                  <div key={key} className="context-block">
                    <div
                      className="context-block-header"
                      onClick={() => setExpandedBlock(isExpanded ? null : key)}
                    >
                      <span className="context-block-expand">
                        {isExpanded ? (
                          <ChevronDown size={11} />
                        ) : (
                          <ChevronRight size={11} />
                        )}
                      </span>
                      <span className="context-block-icon">
                        {typeIcon(block.type)}
                      </span>
                      <span className="context-block-label">{block.label}</span>
                      <span className="context-block-tokens">
                        ~{block.estimatedTokens.toLocaleString()} tok
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="context-block-content">
                        <pre>{block.content}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

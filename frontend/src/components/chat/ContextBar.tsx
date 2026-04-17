import { useState, useCallback } from 'react';
import { FileText, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import type { ContextInfo } from '../../types.ts';
import { GlossarContextView } from './GlossarContextView.tsx';

interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

interface ContextBarProps {
  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
  /** Full assembled system message for the next send (from context-preview). */
  systemPromptPreview?: string | null;
  onFetchContextBlocks?: () => Promise<ContextBlock[]>;
}

function tokenBarColor(tokens: number): string {
  if (tokens >= 100_000) return 'var(--red, #f38ba8)';
  if (tokens >= 75_000)  return 'var(--orange, #fab387)';
  if (tokens >= 60_000)  return 'var(--yellow, #f9e2af)';
  return 'var(--green, #a6e3a1)';
}

function typeIcon(type: string): string {
  switch (type) {
    case 'mode': return '⚙️';
    case 'workspace-mode': return '🗂️';
    case 'glossary': return '📖';
    case 'structure': return '🏗️';
    case 'file-tree': return '📁';
    case 'file': return '📄';
    case 'active-file': return '✏️';
    default: return '📌';
  }
}

export function ContextBar({
  contextInfo,
  activeFile,
  isDirty,
  systemPromptPreview = null,
  onFetchContextBlocks,
}: ContextBarProps) {
  const hasMax = contextInfo != null && contextInfo.maxContextTokens != null && contextInfo.maxContextTokens > 0;
  const pct = hasMax
    ? Math.min(100, Math.round((contextInfo!.estimatedTokens / contextInfo!.maxContextTokens!) * 100))
    : 0;

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [blocks, setBlocks] = useState<ContextBlock[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);
  const [glossaryExpanded, setGlossaryExpanded] = useState(false);
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false);

  const handleToggleInspector = useCallback(async () => {
    if (!inspectorOpen && !blocks && onFetchContextBlocks) {
      setLoading(true);
      try {
        const fetched = await onFetchContextBlocks();
        setBlocks(fetched);
      } finally {
        setLoading(false);
      }
    }
    setInspectorOpen((prev) => !prev);
  }, [inspectorOpen, blocks, onFetchContextBlocks]);

  const handleRefresh = useCallback(async () => {
    if (!onFetchContextBlocks) return;
    setLoading(true);
    try {
      const fetched = await onFetchContextBlocks();
      setBlocks(fetched);
    } finally {
      setLoading(false);
    }
  }, [onFetchContextBlocks]);

  return (
    <div className="context-bar-wrapper">
      <div className="context-bar">
        <div className="context-bar-left">
          {activeFile && (
            <span className="context-bar-file">
              <FileText size={12} />
              {activeFile}
              {isDirty && ' *'}
            </span>
          )}
        </div>
        <div className="context-bar-right">
          {contextInfo && (
            <>
              <span className="context-bar-files">
                {contextInfo.includedFiles.length} files in context
              </span>
              {hasMax ? (
                <span className="context-bar-tokens context-bar-tokens--with-bar" title={`${contextInfo!.estimatedTokens.toLocaleString()} / ${contextInfo!.maxContextTokens!.toLocaleString()} tokens`}>
                  <span className="context-bar-token-pct" style={{ color: tokenBarColor(contextInfo!.estimatedTokens) }}>{pct}%</span>
                  <span className="context-bar-token-bar" aria-hidden="true">
                    <span
                      className="context-bar-token-bar-fill"
                      style={{ width: `${pct}%`, background: tokenBarColor(contextInfo!.estimatedTokens) }}
                    />
                  </span>
                  ~{contextInfo.estimatedTokens.toLocaleString()} / {(contextInfo.maxContextTokens! / 1000).toFixed(0)}k
                </span>
              ) : (
                <span className="context-bar-tokens">
                  ~{contextInfo.estimatedTokens.toLocaleString()} tokens
                </span>
              )}
              {systemPromptPreview != null && systemPromptPreview.length > 0 && (
                <span
                  className="context-bar-system-prompt-hint"
                  title="Zeichen im vollständigen Systemprompt (nächster Send)"
                >
                  {systemPromptPreview.length.toLocaleString()} Zeichen System
                </span>
              )}
            </>
          )}
          {onFetchContextBlocks && (
            <button
              className={`context-inspector-toggle ${inspectorOpen ? 'context-inspector-toggle--open' : ''}`}
              onClick={handleToggleInspector}
              title="Konversations-Inspector: Vorschau für den nächsten Send (Systemprompt, Glossar, Kontext-Blöcke)"
            >
              <Eye size={12} />
            </button>
          )}
        </div>
      </div>

      {inspectorOpen && (
        <div className="context-inspector">
          <div className="context-inspector-header">
            <span className="context-inspector-title">Konversations-Inspector</span>
            <button
              className="context-inspector-refresh"
              onClick={handleRefresh}
              disabled={loading}
              title="Aktualisieren"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>
          <div className="context-inspector-body">
            <div className="context-inspector-scroll">
              {systemPromptPreview != null && systemPromptPreview.length > 0 && (
                <div className="context-block">
                  <div
                    className="context-block-header"
                    onClick={() => setSystemPromptExpanded((v) => !v)}
                  >
                    <span className="context-block-expand">
                      {systemPromptExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </span>
                    <span className="context-block-icon">🧠</span>
                    <span className="context-block-label">Systemprompt (gesamt)</span>
                    <span className="context-block-tokens">
                      {systemPromptPreview.length.toLocaleString()} Zeichen
                    </span>
                  </div>
                  {systemPromptExpanded && (
                    <div className="context-block-content context-block-content--system-prompt">
                      <pre>{systemPromptPreview}</pre>
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
                    {glossaryExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </span>
                  <span className="context-block-icon">{typeIcon('glossary')}</span>
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
                            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                          </span>
                          <span className="context-block-icon">{typeIcon(block.type)}</span>
                          <span className="context-block-label">{block.label}</span>
                          <span className="context-block-tokens">~{block.estimatedTokens.toLocaleString()} tok</span>
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
      )}
    </div>
  );
}

import { FileText } from 'lucide-react';
import type { ContextInfo } from '../../types.ts';

interface ContextBarProps {
  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
}

function tokenBarColor(pct: number): string {
  if (pct >= 90) return 'var(--color-error, #f38ba8)';
  if (pct >= 70) return 'var(--color-warning, #f9e2af)';
  return 'var(--color-success, #a6e3a1)';
}

export function ContextBar({ contextInfo, activeFile, isDirty }: ContextBarProps) {
  const hasMax = contextInfo != null && contextInfo.maxContextTokens != null && contextInfo.maxContextTokens > 0;
  const pct = hasMax
    ? Math.min(100, Math.round((contextInfo!.estimatedTokens / contextInfo!.maxContextTokens!) * 100))
    : 0;

  return (
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
                <span className="context-bar-token-bar" aria-hidden="true">
                  <span
                    className="context-bar-token-bar-fill"
                    style={{ width: `${pct}%`, background: tokenBarColor(pct) }}
                  />
                </span>
                ~{contextInfo.estimatedTokens.toLocaleString()} / {(contextInfo.maxContextTokens! / 1000).toFixed(0)}k
              </span>
            ) : (
              <span className="context-bar-tokens">
                ~{contextInfo.estimatedTokens.toLocaleString()} tokens
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { FileText } from 'lucide-react';
import type { ContextInfo } from '../types.ts';

interface ContextBarProps {
  contextInfo: ContextInfo | null;
  activeFile: string | null;
  isDirty: boolean;
}

export function ContextBar({ contextInfo, activeFile, isDirty }: ContextBarProps) {
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
            <span className="context-bar-tokens">
              ~{contextInfo.estimatedTokens.toLocaleString()} tokens
            </span>
          </>
        )}
      </div>
    </div>
  );
}

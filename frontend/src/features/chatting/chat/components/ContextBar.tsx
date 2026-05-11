export interface ContextBarProps {
  activeFile: string | null;
  isDirty: boolean;
  systemPromptPreview: string | null;
}

export function ContextBar({
  activeFile,
  isDirty,
  systemPromptPreview,
}: ContextBarProps) {
  return (
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
  );
}

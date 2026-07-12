interface ChapterAIPanelProps {
  /** Distance (px) from the panel's edge to where the chapter text ends. */
  textInset: number;
  textColor: string;
  mutedColor: string;
  accentColor: string;
}

/**
 * Placeholder right-hand AI panel (chat/rewrite/comments).
 * Floats over the editor's right margin; a divider marks where the text column
 * actually ends so the panel visually respects the reading padding.
 */
export function ChapterAIPanel({ textInset, textColor, mutedColor, accentColor }: ChapterAIPanelProps) {
  return (
    <div className="chapter-side-panel chapter-side-panel-right">
      <div
        className="chapter-side-panel-divider chapter-side-panel-divider-right"
        style={{ right: textInset, background: accentColor }}
      />
      <div className="chapter-side-panel-inner">
        <div className="chapter-side-panel-title" style={{ color: mutedColor }}>KI</div>
        <div className="chapter-side-panel-placeholder" style={{ color: textColor }}>
          <div className="chapter-side-panel-item">Chat</div>
          <div className="chapter-side-panel-item">Umschreiben</div>
          <div className="chapter-side-panel-item">Kommentare</div>
        </div>
      </div>
    </div>
  );
}

import type { ChapterNode } from '../../types.ts';

interface ChapterOutlinePanelProps {
  chapter: ChapterNode;
  /** Distance (px) from the panel's edge to where the chapter text begins. */
  textInset: number;
  textColor: string;
  mutedColor: string;
  accentColor: string;
}

/**
 * Placeholder left-hand outline panel (acts/scenes + metadata).
 * Floats over the editor's left margin; a divider marks where the text column
 * actually starts so the panel visually respects the reading padding.
 */
export function ChapterOutlinePanel({ chapter, textInset, textColor, mutedColor, accentColor }: ChapterOutlinePanelProps) {
  return (
    <div className="chapter-side-panel chapter-side-panel-left">
      <div
        className="chapter-side-panel-divider chapter-side-panel-divider-left"
        style={{ left: textInset, background: accentColor }}
      />
      <div className="chapter-side-panel-inner">
        <div className="chapter-side-panel-title" style={{ color: mutedColor }}>Gliederung</div>
        <div className="chapter-side-panel-placeholder" style={{ color: textColor }}>
          {chapter.scenes.map(scene => (
            <div key={scene.id} className="chapter-side-panel-item">
              {scene.meta.title || scene.id}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

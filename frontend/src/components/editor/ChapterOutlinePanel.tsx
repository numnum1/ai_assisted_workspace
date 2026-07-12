import type { ChapterNode } from '../../types.ts';

interface ChapterOutlinePanelProps {
  chapter: ChapterNode;
  textColor: string;
  mutedColor: string;
}

/**
 * Placeholder left-hand outline panel (acts/scenes + metadata).
 * Floats over the editor's left margin without pushing the text column.
 */
export function ChapterOutlinePanel({ chapter, textColor, mutedColor }: ChapterOutlinePanelProps) {
  return (
    <div className="chapter-side-panel chapter-side-panel-left">
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

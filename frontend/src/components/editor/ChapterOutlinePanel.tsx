import type { CSSProperties } from 'react';

interface OutlineSpan {
  id: string;
  label: string;
  top: number;
  height: number;
}

interface ChapterOutlinePanelProps {
  /** Scenes, one bracket each, spanning the full range of their actions. */
  sceneSpans: OutlineSpan[];
  /** Actions ("Handlungseinheiten"), nested inside their scene's span. */
  actionSpans: (OutlineSpan & { sceneId: string })[];
  contentHeight: number;
  /** Reading padding (px) from the text column's edge to where the text actually starts. */
  textInset: number;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  focusedSceneId: string | null;
  focusedActionId: string | null;
  onSelectScene: (sceneId: string) => void;
  onSelectAction: (actionId: string) => void;
}

export const CHAPTER_OUTLINE_PANEL_WIDTH = 260;

// Labels up to this length (e.g. roman numerals like "III") stay horizontal;
// longer titles are set vertically (top-to-bottom) to save horizontal space.
const VERTICAL_LABEL_THRESHOLD = 4;

const ACTION_LABEL_GAP = 6;
const SCENE_LABEL_GAP = 6;
const RAIL_SPACING = 40; // gap between the action rail and the scene rail
const RAIL_GUTTER = 10; // gap kept between the scene rail and where the text actually starts
const SCENE_RAIL_MIN = 60 + RAIL_SPACING;

/** A label positioned relative to the outline panel itself, right-anchored just left of its rail. */
function OutlineLabel({
  label, top, height, railLeft, gap, color, onClick,
}: {
  label: string;
  top: number;
  height: number;
  railLeft: number;
  gap: number;
  color: string;
  onClick: () => void;
}) {
  const vertical = label.length > VERTICAL_LABEL_THRESHOLD;
  return (
    <button
      type="button"
      className={`chapter-outline-label${vertical ? ' chapter-outline-label-vertical' : ''}`}
      style={{ top: top + height / 2, right: CHAPTER_OUTLINE_PANEL_WIDTH - railLeft + gap, color }}
      onClick={onClick}
      title={label}
    >
      {label}
    </button>
  );
}

/**
 * Left-hand outline panel. Lives inside the scrollable chapter layout (not
 * pinned to the viewport) so its two bracket rails — scenes and actions
 * ("Handlungseinheiten") — track the actual text 1:1 as the reader scrolls.
 * Both rails hug the text edge, scaling with the reading padding, so most of
 * the panel stays free for scene/action metadata (added later). Labels run
 * vertically once they're longer than a few characters, keeping the whole
 * cluster narrow; short labels (e.g. roman numerals) stay horizontal.
 */
export function ChapterOutlinePanel({
  sceneSpans, actionSpans, contentHeight, textInset, textColor, mutedColor, accentColor,
  focusedSceneId, focusedActionId, onSelectScene, onSelectAction,
}: ChapterOutlinePanelProps) {
  const sceneRailLeft = Math.max(SCENE_RAIL_MIN, textInset - RAIL_GUTTER);
  const actionRailLeft = sceneRailLeft - RAIL_SPACING;

  return (
    <div className="chapter-outline-panel" style={{ height: contentHeight || '100%' }}>
      {actionSpans.map(span => {
        const active = span.id === focusedActionId;
        return (
          <div
            key={span.id}
            className="chapter-outline-rail chapter-outline-rail-action"
            style={{
              top: span.top,
              height: span.height,
              left: actionRailLeft,
              ...(active ? { '--rail-color': accentColor } as CSSProperties : {}),
            }}
          />
        );
      })}
      {actionSpans.map(span => {
        const active = span.id === focusedActionId;
        return (
          <OutlineLabel
            key={span.id}
            label={span.label}
            top={span.top}
            height={span.height}
            railLeft={actionRailLeft}
            gap={ACTION_LABEL_GAP}
            color={active ? accentColor : mutedColor}
            onClick={() => onSelectAction(span.id)}
          />
        );
      })}
      {sceneSpans.map(span => {
        const active = span.id === focusedSceneId;
        return (
          <div
            key={span.id}
            className="chapter-outline-rail chapter-outline-rail-scene"
            style={{
              top: span.top,
              height: span.height,
              left: sceneRailLeft,
              ...(active ? { '--rail-color': accentColor } as CSSProperties : {}),
            }}
          />
        );
      })}
      {sceneSpans.map(span => {
        const active = span.id === focusedSceneId;
        return (
          <OutlineLabel
            key={span.id}
            label={span.label}
            top={span.top}
            height={span.height}
            railLeft={sceneRailLeft}
            gap={SCENE_LABEL_GAP}
            color={active ? accentColor : textColor}
            onClick={() => onSelectScene(span.id)}
          />
        );
      })}
    </div>
  );
}

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

const ACTION_LABEL_WIDTH = 84;
const ACTION_LABEL_GAP = 8;
const SCENE_LABEL_WIDTH = 100;
const SCENE_LABEL_GAP = 8;
const RAIL_GUTTER = 12; // gap kept between the scene rail and where the text actually starts

const ACTION_RAIL_LEFT = ACTION_LABEL_WIDTH + ACTION_LABEL_GAP;
const SCENE_RAIL_MIN = ACTION_RAIL_LEFT + SCENE_LABEL_GAP + SCENE_LABEL_WIDTH + SCENE_LABEL_GAP;

/**
 * Left-hand outline panel. Lives inside the scrollable chapter layout (not
 * pinned to the viewport) so its two bracket rails — scenes and actions
 * ("Handlungseinheiten") — track the actual text 1:1 as the reader scrolls.
 * The scene rail scales with the reading padding so it always sits just
 * outside where the text itself begins.
 */
export function ChapterOutlinePanel({
  sceneSpans, actionSpans, contentHeight, textInset, textColor, mutedColor, accentColor,
  focusedSceneId, focusedActionId, onSelectScene, onSelectAction,
}: ChapterOutlinePanelProps) {
  const sceneRailLeft = Math.max(SCENE_RAIL_MIN, textInset - RAIL_GUTTER);

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
              left: ACTION_RAIL_LEFT,
              ...(active ? { '--rail-color': accentColor } as CSSProperties : {}),
            }}
          >
            <button
              type="button"
              className="chapter-outline-label chapter-outline-label-action"
              style={{ color: active ? accentColor : mutedColor, width: ACTION_LABEL_WIDTH, left: -(ACTION_LABEL_WIDTH + ACTION_LABEL_GAP) }}
              onClick={() => onSelectAction(span.id)}
              title={span.label}
            >
              {span.label}
            </button>
          </div>
        );
      })}
      {sceneSpans.map(span => {
        const active = span.id === focusedSceneId;
        const labelWidth = sceneRailLeft - ACTION_RAIL_LEFT - SCENE_LABEL_GAP * 2;
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
          >
            <button
              type="button"
              className="chapter-outline-label chapter-outline-label-scene"
              style={{ color: active ? accentColor : textColor, width: labelWidth, left: -(labelWidth + SCENE_LABEL_GAP) }}
              onClick={() => onSelectScene(span.id)}
              title={span.label}
            >
              {span.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

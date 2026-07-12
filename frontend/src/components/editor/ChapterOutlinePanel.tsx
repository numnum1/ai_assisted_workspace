import type { CSSProperties } from 'react';
import type { NodeMeta, UserChapterSelection } from '../../types.ts';
import { ChapterMetaEditor } from './ChapterMetaEditor.tsx';

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
  /** Drives the inline metadata editor card. */
  selection: UserChapterSelection;
  selectionMeta: NodeMeta | null;
  selectionLabel: string;
  onSaveSelectionMeta: (patch: { title: string; description: string }) => void;
}

// Reference width for the `right` (panel-relative) coordinate math below —
// kept in sync with the CSS `.chapter-outline-panel` width.
export const CHAPTER_OUTLINE_PANEL_WIDTH = 480;

// Labels up to this length (e.g. roman numerals like "III") stay horizontal;
// longer titles are set vertically (top-to-bottom) to save horizontal space.
const VERTICAL_LABEL_THRESHOLD = 4;

const ACTION_LABEL_GAP = 6;
const SCENE_LABEL_GAP = 6;
const RAIL_SPACING = 40; // gap between the action rail and the scene rail
const RAIL_GUTTER = 10; // gap kept between the scene rail and where the text actually starts

// Space reserved at the panel's left edge for the metadata editor card, plus
// worst-case room for a (short, horizontal) action label to its right.
const META_ZONE_WIDTH = 200;
const META_ZONE_GAP = 10;
const ACTION_LABEL_RESERVE = 70;
const SCENE_RAIL_MIN = META_ZONE_WIDTH + META_ZONE_GAP + ACTION_LABEL_RESERVE + RAIL_SPACING;

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
 * Both rails hug the text edge, scaling with the reading padding. The strip
 * from the panel's left edge up to the rails is reserved for the metadata
 * editor, which appears next to whatever is currently selected. Labels run
 * vertically once they're longer than a few characters, keeping the bracket
 * cluster narrow.
 */
export function ChapterOutlinePanel({
  sceneSpans, actionSpans, contentHeight, textInset, textColor, mutedColor, accentColor,
  focusedSceneId, focusedActionId, onSelectScene, onSelectAction,
  selection, selectionMeta, selectionLabel, onSaveSelectionMeta,
}: ChapterOutlinePanelProps) {
  const sceneRailLeft = Math.max(SCENE_RAIL_MIN, textInset - RAIL_GUTTER);
  const actionRailLeft = sceneRailLeft - RAIL_SPACING;

  const selectionTop = !selection ? null
    : selection.type === 'chapter' ? 0
    : selection.type === 'scene' ? sceneSpans.find(s => s.id === selection.id)?.top ?? null
    : actionSpans.find(a => a.id === selection.id)?.top ?? null;

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
      {selection && selectionMeta && selectionTop !== null && (
        <ChapterMetaEditor
          key={`${selection.type}:${selection.id}`}
          label={selectionLabel}
          title={selectionMeta.title}
          description={selectionMeta.description}
          top={selectionTop}
          width={META_ZONE_WIDTH}
          textColor={textColor}
          mutedColor={mutedColor}
          onSave={onSaveSelectionMeta}
        />
      )}
    </div>
  );
}

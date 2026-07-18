/**
 * Lifecycle of a storyboard card. Material starts as a loose `idea`, may be
 * `active` while being worked out, `graduated` once its content has moved on to
 * a wiki entry / scene / arc point, and `discarded` when set aside (kept, not
 * deleted, so it can resurface in a later book of the series).
 */
export type StoryboardCardStatus = "idea" | "active" | "graduated" | "discarded";

/**
 * A free-floating story idea on the pinboard — the pre-canon workspace. Cards
 * carry no structural position; spatial placement (`x`/`y`) and optional frame
 * membership are the only grouping. A card belongs to the series, optionally
 * assigned to one or more books via `bookPaths` (empty = series-wide).
 */
export interface StoryboardCard {
  id: string;
  title: string;
  note?: string;
  /** Free canvas position. */
  x: number;
  y: number;
  /** Hex card color; falls back to a default when absent. */
  color?: string;
  /** Free-form labels, no fixed vocabulary. */
  tags?: string[];
  /** BookProject.path per assignment; empty/absent = series-wide. */
  bookPaths?: string[];
  /** Enclosing frame id, or null/absent when loose on the canvas. */
  frameId?: string | null;
  status?: StoryboardCardStatus;
}

/** A named region on the canvas that groups the cards placed inside it. */
export interface StoryboardFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

/** Full contents of the pinboard workspace (.assistant/storyboard/). */
export interface StoryboardData {
  cards: StoryboardCard[];
  frames: StoryboardFrame[];
}

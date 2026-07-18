import { useEffect, useState, type RefObject } from 'react';

export const READING_PADDING_SLIDER_STEP = 4;

/** Minimum text column width (px): container width minus left and right padding. */
export const READING_MIN_CONTENT_WIDTH_PX = 320;

/**
 * Largest padding (per side, px) so that content stays at least `minContentWidthPx` wide.
 * Rounded down to {@link READING_PADDING_SLIDER_STEP} to match the range input.
 */
export function maxPaddingPxForContainerWidth(
  containerWidthPx: number,
  minContentWidthPx: number = READING_MIN_CONTENT_WIDTH_PX,
): number {
  const raw = Math.max(0, (containerWidthPx - minContentWidthPx) / 2);
  return Math.floor(raw / READING_PADDING_SLIDER_STEP) * READING_PADDING_SLIDER_STEP;
}

export type UseReadingPaddingMaxOptions = {
  /** When false, observation stops (e.g. no scroll container mounted). */
  enabled?: boolean;
  minContentWidthPx?: number;
};

/**
 * Observes the reading scroll container width and returns a dynamic `max` for the padding slider.
 */
export function useReadingPaddingMax(
  containerRef: RefObject<Element | null>,
  options?: UseReadingPaddingMaxOptions,
): number {
  const enabled = options?.enabled ?? true;
  const minContentWidthPx = options?.minContentWidthPx ?? READING_MIN_CONTENT_WIDTH_PX;

  const [maxPadding, setMaxPadding] = useState(200);

  useEffect(() => {
    if (!enabled) return;

    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      setMaxPadding(maxPaddingPxForContainerWidth(w, minContentWidthPx));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, minContentWidthPx, enabled]);

  return maxPadding;
}

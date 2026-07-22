import type { CSSProperties } from "react";
import type { BlueprintColors } from "../../shared/types.ts";

/** Built-in accent palette — also what a document with no `colors` (or a
 * document predating this field) renders with. */
export const DEFAULT_BLUEPRINT_COLORS: BlueprintColors = {
  idee: "#8b6bff",
  kanon: "#22c98a",
  container: "#3fc9e6",
  reroute: "#38d6d6",
  entry: "#22c98a",
  exit: "#ff9a4d",
};

/** Fills in any role missing from a stored/partial palette with its default —
 * the single place that turns "whatever was saved" into a complete palette. */
export function resolveBlueprintColors(stored?: Partial<BlueprintColors>): BlueprintColors {
  return { ...DEFAULT_BLUEPRINT_COLORS, ...stored };
}

/** Exposes the palette to CSS as custom properties on the canvas root; every
 * role-specific rule in BlueprintCanvas.css reads `var(--bp-color-<role>)`
 * with the same default baked in, so this is the only place a saved color
 * actually reaches the DOM. */
export function blueprintColorVars(colors: BlueprintColors): CSSProperties {
  return {
    "--bp-color-idee": colors.idee,
    "--bp-color-kanon": colors.kanon,
    "--bp-color-container": colors.container,
    "--bp-color-reroute": colors.reroute,
    "--bp-color-entry": colors.entry,
    "--bp-color-exit": colors.exit,
  } as CSSProperties;
}

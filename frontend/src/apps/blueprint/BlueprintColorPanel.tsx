import type { BlueprintColors } from "../../shared/types.ts";
import { DEFAULT_BLUEPRINT_COLORS } from "./colors.ts";

interface BlueprintColorPanelProps {
  colors: BlueprintColors;
  onChange: (patch: Partial<BlueprintColors>) => void;
  onReset: () => void;
  onClose: () => void;
}

const FIELDS: Array<{ key: keyof BlueprintColors; label: string }> = [
  { key: "idee", label: "Idee" },
  { key: "kanon", label: "Kanon" },
  { key: "container", label: "Unterablauf" },
  { key: "reroute", label: "Reroute" },
  { key: "entry", label: "Eingang" },
  { key: "exit", label: "Ausgang" },
];

/** The accent palette editor opened from the columns panel's gear button —
 * one color role per node kind/status, all deriving that role's header,
 * border and glow in BlueprintCanvas.css via CSS custom properties. */
export function BlueprintColorPanel({ colors, onChange, onReset, onClose }: BlueprintColorPanelProps) {
  return (
    <div className="bp-color-panel">
      <div className="bp-columns-panel__header">
        <span>Farben</span>
        <button type="button" onClick={onClose} aria-label="Schließen">
          ×
        </button>
      </div>
      {FIELDS.map(({ key, label }) => (
        <div className="bp-color-panel__row" key={key}>
          <label>{label}</label>
          <input
            type="color"
            value={colors[key]}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
          <input
            type="text"
            value={colors[key]}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        className="bp-color-panel__reset"
        onClick={onReset}
        disabled={FIELDS.every(({ key }) => colors[key] === DEFAULT_BLUEPRINT_COLORS[key])}
      >
        Zurücksetzen
      </button>
    </div>
  );
}

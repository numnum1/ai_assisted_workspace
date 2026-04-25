import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { AppPreferences, AppearancePreferences } from "../../types.ts";
import "./AppearanceModal.css";

interface AppearanceModalProps {
  preferences: AppPreferences;
  onUpdate: (patch: Partial<AppPreferences>) => Promise<void>;
  onClose: () => void;
}

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "System (Standard)", value: "system-ui" },
  { label: "Segoe UI", value: "'Segoe UI', sans-serif" },
  { label: "Inter", value: "'Inter', sans-serif" },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Merriweather (Serif)", value: "'Merriweather', Georgia, serif" },
  { label: "Menlo / Consolas (Mono)", value: "Menlo, Consolas, monospace" },
  { label: "Fira Code (Mono)", value: "'Fira Code', Consolas, monospace" },
];

export function AppearanceModal({
  preferences,
  onUpdate,
  onClose,
}: AppearanceModalProps) {
  const [draft, setDraft] = useState<AppearancePreferences>({
    ...preferences.appearance,
  });

  useEffect(() => {
    setDraft({ ...preferences.appearance });
  }, [preferences]);

  const handleChange = (patch: Partial<AppearancePreferences>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void onUpdate({ appearance: next });
  };

  const fontSizePx = draft.chatFontSizePx ?? 14;

  return (
    <div
      className="appearance-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Darstellungseinstellungen"
    >
      <div
        className="appearance-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="appearance-modal-header">
          <span className="appearance-modal-title">Darstellung</span>
          <button
            type="button"
            className="appearance-modal-close"
            onClick={onClose}
            title="Schließen (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="appearance-modal-body">
          {/* Theme */}
          <section className="appearance-section">
            <div className="appearance-section-label">Farbschema</div>
            <div className="appearance-theme-row">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`appearance-theme-btn${draft.theme === t ? " active" : ""}`}
                  onClick={() => handleChange({ theme: t })}
                >
                  <span
                    className={`appearance-theme-swatch appearance-theme-swatch--${t}`}
                  />
                  {t === "dark" ? "Dunkel" : "Hell"}
                </button>
              ))}
            </div>
          </section>

          {/* Font family */}
          <section className="appearance-section">
            <label className="appearance-section-label" htmlFor="pref-font-family">
              Schriftart
            </label>
            <select
              id="pref-font-family"
              className="appearance-select"
              value={draft.fontFamily ?? "system-ui"}
              onChange={(e) => handleChange({ fontFamily: e.target.value })}
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p
              className="appearance-preview-text"
              style={{ fontFamily: draft.fontFamily }}
            >
              Die schnelle braune Katze springt über den faulen Hund. The quick
              brown fox jumps over the lazy dog.
            </p>
          </section>

          {/* Chat font size */}
          <section className="appearance-section">
            <label
              className="appearance-section-label"
              htmlFor="pref-chat-font-size"
            >
              Chat-Schriftgröße&ensp;
              <span className="appearance-size-value">{fontSizePx} px</span>
            </label>
            <div className="appearance-slider-row">
              <span className="appearance-slider-bound">10</span>
              <input
                id="pref-chat-font-size"
                type="range"
                min={10}
                max={22}
                step={1}
                value={fontSizePx}
                className="appearance-slider"
                onChange={(e) =>
                  handleChange({ chatFontSizePx: Number(e.target.value) })
                }
              />
              <span className="appearance-slider-bound">22</span>
            </div>
            <p
              className="appearance-preview-text"
              style={{ fontSize: fontSizePx }}
            >
              So sieht der Chat-Text bei dieser Größe aus.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

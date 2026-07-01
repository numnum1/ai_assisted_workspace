import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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

  const handleLanguageChange = (lang: 'de' | 'en') => {
    void onUpdate({ language: lang });
  };

  const fontSizePx = draft.chatFontSizePx ?? 14;

  return (
    <div
      className="appearance-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("appearance.title")}
    >
      <div
        className="appearance-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="appearance-modal-header">
          <span className="appearance-modal-title">{t("appearance.title")}</span>
          <button
            type="button"
            className="appearance-modal-close"
            onClick={onClose}
            title={t("common.close") + " (Esc)"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="appearance-modal-body">
          {/* Theme */}
          <section className="appearance-section">
            <div className="appearance-section-label">{t("appearance.colorScheme")}</div>
            <div className="appearance-theme-row">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`appearance-theme-btn${draft.theme === theme ? " active" : ""}`}
                  onClick={() => handleChange({ theme })}
                >
                  <span
                    className={`appearance-theme-swatch appearance-theme-swatch--${theme}`}
                  />
                  {theme === "dark" ? t("appearance.dark") : t("appearance.light")}
                </button>
              ))}
            </div>
          </section>

          {/* Language */}
          <section className="appearance-section">
            <div className="appearance-section-label">{t("appearance.language")}</div>
            <div className="appearance-theme-row">
              {(["de", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`appearance-theme-btn${(preferences.language ?? "de") === lang ? " active" : ""}`}
                  onClick={() => handleLanguageChange(lang)}
                >
                  {lang === "de" ? t("appearance.deutsch") : t("appearance.english")}
                </button>
              ))}
            </div>
          </section>

          {/* Font family */}
          <section className="appearance-section">
            <label className="appearance-section-label" htmlFor="pref-font-family">
              {t("appearance.fontFamily")}
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
              {t("appearance.previewText")}
            </p>
          </section>

          {/* Chat font size */}
          <section className="appearance-section">
            <label
              className="appearance-section-label"
              htmlFor="pref-chat-font-size"
            >
              {t("appearance.chatFontSize")}&ensp;
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
              {t("appearance.previewText")}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

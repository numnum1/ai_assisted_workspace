import type { Dispatch, SetStateAction } from "react";
import { Save, Moon, Sun, Palette, MoveHorizontal, MoveVertical, X, Music, Eye, EyeOff } from "lucide-react";
import { READING_PADDING_SLIDER_STEP } from "../hooks/useReadingPaddingMax.ts";

const LINE_HEIGHT_MIN = 1.1;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_STEP = 0.1;

/**
 * Music editor tools rendered into the app-wide TopBar: title label, reading
 * sliders, metatag visibility, night mode, save, and close. Purely
 * presentational — all state lives in {@link MusicProjectEditor}.
 */
export interface MusicProjectToolbarProps {
  toolbarBg: string;
  toolbarBorder: string;
  accentColor: string;
  mutedColor: string;
  title: string;
  hasDirtyActions: boolean;
  paddingSliderMax: number;
  effectivePadding: number;
  setPadding: (value: number) => void;
  lineHeight: number;
  setLineHeight: (value: number) => void;
  hideMetatags: boolean;
  setHideMetatags: Dispatch<SetStateAction<boolean>>;
  nightMode: boolean;
  setNightMode: Dispatch<SetStateAction<boolean>>;
  setNightVariant: Dispatch<SetStateAction<number>>;
  nightPalettesLength: number;
  onSaveAll: () => void;
  onClose: () => void;
}

export function MusicProjectToolbar({
  toolbarBg,
  toolbarBorder,
  accentColor,
  mutedColor,
  title,
  hasDirtyActions,
  paddingSliderMax,
  effectivePadding,
  setPadding,
  lineHeight,
  setLineHeight,
  hideMetatags,
  setHideMetatags,
  nightMode,
  setNightMode,
  setNightVariant,
  nightPalettesLength,
  onSaveAll,
  onClose,
}: MusicProjectToolbarProps) {
  return (
    <div
      className="top-bar-tools top-bar-tools--music"
      style={{ backgroundColor: toolbarBg, borderBottomColor: toolbarBorder }}
    >
      <span className="song-view-title-label" style={{ color: accentColor }}>
        <Music size={13} />
        {title}
        {hasDirtyActions && <span className="editor-dirty"> *</span>}
      </span>
      <div className="chapter-view-toolbar-actions">
        <div className="reading-padding-control" title="Seitenabstand" style={{ color: mutedColor }}>
          <MoveHorizontal size={12} />
          <input
            type="range"
            className="reading-padding-slider"
            min={0}
            max={paddingSliderMax}
            step={READING_PADDING_SLIDER_STEP}
            value={effectivePadding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
        </div>
        <div className="reading-padding-control" title="Zeilenabstand" style={{ color: mutedColor }}>
          <MoveVertical size={12} />
          <input
            type="range"
            className="reading-padding-slider"
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
          />
        </div>
        <button
          className={`song-view-btn${hideMetatags ? " active" : ""}`}
          onClick={() => setHideMetatags((prev) => !prev)}
          title={hideMetatags ? "Metatags anzeigen" : "Metatags verstecken"}
          style={{ color: mutedColor, borderColor: toolbarBorder }}
        >
          {hideMetatags ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          className={`song-view-btn${nightMode ? " active" : ""}`}
          onClick={() => setNightMode((prev) => !prev)}
          title={nightMode ? "Studio-Modus" : "Tagmodus"}
          style={{ color: mutedColor, borderColor: toolbarBorder }}
        >
          {nightMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        {nightMode && (
          <button
            className="song-view-btn"
            onClick={() => setNightVariant((prev) => (prev + 1) % nightPalettesLength)}
            title="Nachtmodus-Palette wechseln"
            style={{ color: mutedColor, borderColor: toolbarBorder }}
          >
            <Palette size={14} />
          </button>
        )}
        <button
          className="song-view-btn"
          onClick={onSaveAll}
          disabled={!hasDirtyActions}
          title="Alles speichern (Ctrl+S)"
          style={{ color: mutedColor, borderColor: toolbarBorder }}
        >
          <Save size={14} />
        </button>
        <button
          className="song-view-btn song-view-close-btn"
          onClick={onClose}
          title="Datei schließen"
          style={{ color: mutedColor, borderColor: toolbarBorder }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

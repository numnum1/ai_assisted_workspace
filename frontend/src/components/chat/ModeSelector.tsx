import type { Mode } from '../../types.ts';
import {
  effectiveModeColor,
  getContrastingTextColor,
} from './modeColorTheme.ts';

interface ModeSelectorProps {
  modes: Mode[];
  selectedMode: string;
  onModeChange: (modeId: string) => void;
  theme: 'light' | 'dark';
}

export function ModeSelector({
  modes,
  selectedMode,
  onModeChange,
  theme,
}: ModeSelectorProps) {
  const currentMode = modes.find((m) => m.id === selectedMode);
  const modeColor = currentMode?.color;
  const displayColor = effectiveModeColor(modeColor, theme) ?? modeColor;
  const textColor = getContrastingTextColor(displayColor);

  return (
    <div className="mode-selector">
      <label style={displayColor ? { color: displayColor } : undefined}>Mode:</label>
      <select
        value={selectedMode}
        onChange={(e) => onModeChange(e.target.value)}
        style={
          displayColor
            ? {
                backgroundColor: displayColor,
                color: textColor,
                borderColor: displayColor,
              }
            : undefined
        }
      >
        {modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.name}
          </option>
        ))}
      </select>
    </div>
  );
}

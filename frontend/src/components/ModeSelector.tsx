import type { Mode } from '../types.ts';

interface ModeSelectorProps {
  modes: Mode[];
  selectedMode: string;
  onModeChange: (modeId: string) => void;
}

function getContrastingTextColor(hexColor?: string): string | undefined {
  if (!hexColor || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return undefined;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e1e2e' : '#f5f5ff';
}

export function ModeSelector({ modes, selectedMode, onModeChange }: ModeSelectorProps) {
  const currentMode = modes.find((m) => m.id === selectedMode);
  const modeColor = currentMode?.color;
  const textColor = getContrastingTextColor(modeColor);

  return (
    <div className="mode-selector">
      <label style={modeColor ? { color: modeColor } : undefined}>Mode:</label>
      <select
        value={selectedMode}
        onChange={(e) => onModeChange(e.target.value)}
        style={modeColor ? { backgroundColor: modeColor, color: textColor, borderColor: modeColor } : undefined}
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

import { useContext } from 'react';
import { effectiveModeColor, getContrastingTextColor } from '../../../../components/chat/modeColorTheme.ts';
import { ThemeContext } from '../../../../ThemeContext.tsx';
import type { AssistantMode } from '../../project/project-types.ts';

export function ModeSelector({
  modes,
  selectedMode,
  selectMode,
}: {
    modes: AssistantMode[];
    selectedMode: string;
    selectMode: (newSelectedModeId: string) => void;
}) {

  const theme = useContext(ThemeContext)

  const currentMode = modes.find((m) => m.id === selectedMode);
  const modeColor = currentMode?.color;
  const displayColor = effectiveModeColor(modeColor, theme.name) ?? modeColor;
  const textColor = getContrastingTextColor(displayColor);

  return (
    <div className="mode-selector">
      <label style={displayColor ? { color: displayColor } : undefined}>Mode:</label>
      <select
        value={selectedMode}
        onChange={(e) => selectMode(e.target.value)}
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

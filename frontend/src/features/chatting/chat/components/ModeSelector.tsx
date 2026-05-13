import { useContext, useMemo } from 'react';
import { effectiveModeColor, getContrastingTextColor } from '../../../../components/chat/modeColorTheme.ts';
import type { AssistantMode } from '../../project/project-types.ts';
import { ThemeContext } from '../../../../ThemeContext.ts';

export function ModeSelector({
  modes,
  selectedMode,
  selectMode,
}: {
    modes: AssistantMode[];
    selectedMode: AssistantMode | null;
    selectMode: (newSelectedModeId: string) => void;
}) {

  const theme = useContext(ThemeContext)

  const selectedColor = useMemo(() => {
    const modeColor = selectedMode?.color ?? 'grey';
    return effectiveModeColor(modeColor, theme.name) ?? modeColor
  }, [theme, selectedMode])

  const textColor = useMemo(() => {
    const modeColor = selectedMode?.color ?? 'grey';
    const selectedColorTmp = effectiveModeColor(modeColor, theme.name) ?? modeColor
    return getContrastingTextColor(selectedColorTmp) ?? 'black'
  }, [theme, selectedMode])

  return (
    <div className="mode-selector">
      <label style={selectedColor ? { color: selectedColor } : undefined}>Mode:</label>
      <select
        value={selectedMode?.id}
        onChange={(e) => selectMode(e.target.value)}
        style={
          selectedColor
            ? {
                backgroundColor: selectedColor,
                color: textColor,
                borderColor: selectedColor,
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

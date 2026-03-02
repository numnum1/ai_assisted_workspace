import { useEffect, useState } from 'react';
import type { Mode } from '../types.ts';
import { modesApi } from '../api.ts';

interface ModeSelectorProps {
  selectedMode: string;
  onModeChange: (modeId: string) => void;
}

export function ModeSelector({ selectedMode, onModeChange }: ModeSelectorProps) {
  const [modes, setModes] = useState<Mode[]>([]);

  useEffect(() => {
    modesApi.getAll().then(setModes).catch(console.error);
  }, []);

  return (
    <div className="mode-selector">
      <label>Mode:</label>
      <select
        value={selectedMode}
        onChange={(e) => onModeChange(e.target.value)}
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

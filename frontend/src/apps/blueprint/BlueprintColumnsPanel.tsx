import type { BlueprintColumn } from "../../shared/types.ts";
import {
  MIN_UNIT_PX,
  MAX_UNIT_PX,
  UNIT_PX_STEP,
  MAX_COLUMN_GAP,
  COLUMN_GAP_STEP,
  MAX_LANE_GAP,
  LANE_GAP_STEP,
} from "./layout.ts";

interface BlueprintColumnsPanelProps {
  columns: BlueprintColumn[];
  unitPx: number;
  onUnitPxChange: (value: number) => void;
  columnGap: number;
  onColumnGapChange: (value: number) => void;
  laneGap: number;
  onLaneGapChange: (value: number) => void;
  onAdd: () => void;
  onChange: (id: string, patch: Partial<BlueprintColumn>) => void;
  onRemove: (id: string) => void;
  onOpenColors: () => void;
}

export function BlueprintColumnsPanel({
  columns,
  unitPx,
  onUnitPxChange,
  columnGap,
  onColumnGapChange,
  laneGap,
  onLaneGapChange,
  onAdd,
  onChange,
  onRemove,
  onOpenColors,
}: BlueprintColumnsPanelProps) {
  return (
    <div className="bp-columns-panel">
      <div className="bp-columns-panel__header">
        <span>Spalten</span>
        <div className="bp-columns-panel__header-actions">
          <button type="button" onClick={onOpenColors} aria-label="Farben" title="Farben">
            ⚙
          </button>
          <button type="button" onClick={onAdd}>
            + Spalte
          </button>
        </div>
      </div>
      <div className="bp-columns-panel__spacing">
        <label>Rasterabstand</label>
        <input
          type="range"
          min={MIN_UNIT_PX}
          max={MAX_UNIT_PX}
          step={UNIT_PX_STEP}
          value={unitPx}
          onChange={(e) => onUnitPxChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={MIN_UNIT_PX}
          max={MAX_UNIT_PX}
          step={UNIT_PX_STEP}
          value={unitPx}
          onChange={(e) => onUnitPxChange(Number(e.target.value))}
        />
      </div>
      <div className="bp-columns-panel__spacing">
        <label>Spaltenlücke</label>
        <input
          type="range"
          min={0}
          max={MAX_COLUMN_GAP}
          step={COLUMN_GAP_STEP}
          value={columnGap}
          onChange={(e) => onColumnGapChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={0}
          max={MAX_COLUMN_GAP}
          step={COLUMN_GAP_STEP}
          value={columnGap}
          onChange={(e) => onColumnGapChange(Number(e.target.value))}
        />
      </div>
      <div className="bp-columns-panel__spacing">
        <label>Zeilenabstand</label>
        <input
          type="range"
          min={0}
          max={MAX_LANE_GAP}
          step={LANE_GAP_STEP}
          value={laneGap}
          onChange={(e) => onLaneGapChange(Number(e.target.value))}
        />
        <input
          type="number"
          min={0}
          max={MAX_LANE_GAP}
          step={LANE_GAP_STEP}
          value={laneGap}
          onChange={(e) => onLaneGapChange(Number(e.target.value))}
        />
      </div>
      {columns.length === 0 ? (
        <div className="bp-columns-panel__empty">Keine Spalten</div>
      ) : (
        columns
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((col) => (
            <div className="bp-columns-panel__row" key={col.id}>
              <input
                type="text"
                value={col.label}
                onChange={(e) => onChange(col.id, { label: e.target.value })}
              />
              <input
                type="number"
                value={col.from}
                onChange={(e) =>
                  onChange(col.id, { from: Number(e.target.value) })
                }
              />
              <input
                type="number"
                value={col.to}
                onChange={(e) =>
                  onChange(col.id, { to: Number(e.target.value) })
                }
              />
              <button type="button" onClick={() => onRemove(col.id)}>
                ×
              </button>
            </div>
          ))
      )}
    </div>
  );
}

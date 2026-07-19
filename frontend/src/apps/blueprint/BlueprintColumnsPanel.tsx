import type { BlueprintColumn } from "../../shared/types.ts";

interface BlueprintColumnsPanelProps {
  columns: BlueprintColumn[];
  onAdd: () => void;
  onChange: (id: string, patch: Partial<BlueprintColumn>) => void;
  onRemove: (id: string) => void;
}

export function BlueprintColumnsPanel({
  columns,
  onAdd,
  onChange,
  onRemove,
}: BlueprintColumnsPanelProps) {
  return (
    <div className="bp-columns-panel">
      <div className="bp-columns-panel__header">
        <span>Spalten</span>
        <button type="button" onClick={onAdd}>
          + Spalte
        </button>
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

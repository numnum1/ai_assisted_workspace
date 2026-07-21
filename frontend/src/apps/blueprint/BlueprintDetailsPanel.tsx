import type { BlueprintNode, BlueprintNodeStatus } from "../../shared/types.ts";
import { arcColor, useArcRegistry } from "./arcRegistryContext.ts";

interface BlueprintDetailsPanelProps {
  node: BlueprintNode;
  onChange: (patch: Partial<BlueprintNode>) => void;
  onRemovePin: (pinId: string) => void;
  onOpenOrCreateSubGraph: () => void;
}

function newPinId(): string {
  return `pin_${crypto.randomUUID().slice(0, 8)}`;
}

/** The UE-style "Details"-Panel for the selected node: content fields plus
 * the named execution pins that carry the story's narrative branches. */
export function BlueprintDetailsPanel({
  node,
  onChange,
  onRemovePin,
  onOpenOrCreateSubGraph,
}: BlueprintDetailsPanelProps) {
  const isContainer = node.subGraphId !== undefined;
  const arcs = useArcRegistry();
  const arcRefs = node.arcRefs ?? [];
  const toggleArc = (arcId: string) => {
    onChange({
      arcRefs: arcRefs.includes(arcId)
        ? arcRefs.filter((id) => id !== arcId)
        : [...arcRefs, arcId],
    });
  };
  const setPinLabel = (pinId: string, label: string) => {
    onChange({
      outputs: node.outputs.map((p) => (p.id === pinId ? { ...p, label } : p)),
    });
  };
  const addPin = () => {
    onChange({
      outputs: [...node.outputs, { id: newPinId(), label: "neuer Ausgang" }],
    });
  };

  return (
    <div className="bp-details">
      <div className="bp-details__header">Details</div>
      <div className="bp-details__field">
        <label>Titel</label>
        <input value={node.title} onChange={(e) => onChange({ title: e.target.value })} />
      </div>
      <div className="bp-details__field">
        <label>Beschreibung</label>
        <textarea
          rows={5}
          value={node.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      <div className="bp-details__field">
        <label>Status</label>
        <select
          value={node.status}
          onChange={(e) => onChange({ status: e.target.value as BlueprintNodeStatus })}
        >
          <option value="idee">Idee</option>
          <option value="kanon">Kanon</option>
        </select>
      </div>
      <div className="bp-details__row">
        <div className="bp-details__field">
          <label>Von</label>
          <input
            type="number"
            step={1}
            disabled={isContainer}
            value={node.from ?? ""}
            onChange={(e) =>
              onChange({
                from: e.target.value === "" ? undefined : Math.round(Number(e.target.value)),
              })
            }
          />
        </div>
        <div className="bp-details__field">
          <label>Bis</label>
          <input
            type="number"
            step={1}
            disabled={isContainer}
            value={node.to ?? ""}
            onChange={(e) =>
              onChange({
                to: e.target.value === "" ? undefined : Math.round(Number(e.target.value)),
              })
            }
          />
        </div>
      </div>
      <div className="bp-details__field">
        <label>Sub-Graph</label>
        <button
          type="button"
          className="bp-details__add-pin"
          onClick={onOpenOrCreateSubGraph}
        >
          {isContainer ? "Sub-Graph öffnen" : "Sub-Graph erstellen"}
        </button>
      </div>
      <div className="bp-details__field">
        <label>Bögen</label>
        {arcs.length === 0 ? (
          <div className="bp-details__hint">Keine Bögen angelegt (Spannungsbögen-Fenster).</div>
        ) : (
          <div className="bp-details__tags">
            {arcs.map((arc) => (
              <button
                key={arc.id}
                type="button"
                className={`bp-details__tag${arcRefs.includes(arc.id) ? " is-active" : ""}`}
                style={{ borderColor: arcColor(arc), color: arcRefs.includes(arc.id) ? "#fff" : arcColor(arc), backgroundColor: arcRefs.includes(arc.id) ? arcColor(arc) : "transparent" }}
                onClick={() => toggleArc(arc.id)}
              >
                {arc.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bp-details__field">
        <label>Ausgänge</label>
        {node.outputs.map((pin) => (
          <div className="bp-details__pin" key={pin.id}>
            <input value={pin.label} onChange={(e) => setPinLabel(pin.id, e.target.value)} />
            <button type="button" onClick={() => onRemovePin(pin.id)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="bp-details__add-pin" onClick={addPin}>
          + Ausgang
        </button>
      </div>
    </div>
  );
}

import type { BlueprintNode, BlueprintNodeStatus } from "../../shared/types.ts";

interface BlueprintDetailsPanelProps {
  node: BlueprintNode;
  onChange: (patch: Partial<BlueprintNode>) => void;
  onRemovePin: (pinId: string) => void;
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
}: BlueprintDetailsPanelProps) {
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
            value={node.from ?? ""}
            onChange={(e) =>
              onChange({
                from: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
        <div className="bp-details__field">
          <label>Bis</label>
          <input
            type="number"
            value={node.to ?? ""}
            onChange={(e) =>
              onChange({
                to: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
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

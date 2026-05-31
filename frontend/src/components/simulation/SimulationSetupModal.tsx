import { useState, useRef, useEffect } from "react";
import { X, Loader2, UserPlus, Save } from "lucide-react";
import type {
  SimulationConfig,
  Persona,
} from "../../types.ts";
import { getAppBridge } from "../../electron/bridge.ts";
import "./SimulationSetupModal.css";

export interface SimulationSetupResult {
  title: string;
  simulationConfig: SimulationConfig;
}

interface SimulationSetupModalProps {
  onConfirm: (result: SimulationSetupResult) => void;
  onCancel: () => void;
}

let _idCounter = 0;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function SimulationSetupModal({
  onConfirm,
  onCancel,
}: SimulationSetupModalProps) {
  const [goal, setGoal] = useState("");
  const [title, setTitle] = useState("");

  // Persona library
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personasLoading, setPersonasLoading] = useState(true);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");
  const [creatingPersona, setCreatingPersona] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaDesc, setNewPersonaDesc] = useState("");
  const [savingPersona, setSavingPersona] = useState(false);

  const goalRef = useRef<HTMLTextAreaElement>(null);

  // Load personas on mount
  useEffect(() => {
    const bridge = getAppBridge();
    if (!bridge?.persona?.list) {
      setPersonasLoading(false);
      return;
    }
    bridge.persona
      .list()
      .then((list) => setPersonas(list))
      .catch(() => {})
      .finally(() => setPersonasLoading(false));
  }, []);

  const selectedPersona =
    personas.find((p) => p.id === selectedPersonaId) ?? null;

  const handleSavePersona = async () => {
    const name = newPersonaName.trim();
    const desc = newPersonaDesc.trim();
    if (!name || !desc) return;
    const bridge = getAppBridge();
    if (!bridge?.persona?.write) return;
    setSavingPersona(true);
    try {
      const { persona } = await bridge.persona.write(name, desc);
      setPersonas((prev) => {
        const without = prev.filter((p) => p.id !== persona.id);
        return [...without, persona].sort((a, b) =>
          a.name.localeCompare(b.name, "de"),
        );
      });
      setSelectedPersonaId(persona.id);
      setCreatingPersona(false);
      setNewPersonaName("");
      setNewPersonaDesc("");
    } catch {
      /* ignore */
    } finally {
      setSavingPersona(false);
    }
  };

  const handleConfirm = () => {
    const trimGoal = goal.trim();
    if (!trimGoal && !selectedPersona) return;

    const slugSource = trimGoal || selectedPersona?.name || "simulation";
    const slug = slugify(slugSource);
    const ts = Date.now().toString(36) + (_idCounter++).toString(36);
    const resultFile = `${slug}_${ts}`;

    const simulationConfig: SimulationConfig = {
      goal: trimGoal,
      baseFilePath: "",
      characters: [],
      resultFile,
      ...(selectedPersona
        ? {
            personaId: selectedPersona.id,
            personaName: selectedPersona.name,
            personaPrompt: selectedPersona.description,
          }
        : {}),
    };

    const defaultTitle = selectedPersona
      ? `Navi-Simulation: ${selectedPersona.name}`
      : `Navi-Simulation: ${trimGoal.slice(0, 50)}`;
    onConfirm({
      title: title.trim() || defaultTitle,
      simulationConfig,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  const canConfirm = goal.trim().length > 0 || selectedPersona !== null;

  return (
    <div
      className="sim-modal-overlay"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="sim-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-modal-title"
      >
        {/* Header */}
        <div className="sim-modal-header">
          <span id="sim-modal-title" className="sim-modal-title">
            Navi-Simulation
          </span>
          <button
            type="button"
            className="sim-modal-close"
            onClick={onCancel}
            title="Abbrechen"
          >
            <X size={14} />
          </button>
        </div>

        <div className="sim-modal-body">
          {/* Persona library */}
          <label className="sim-modal-label" htmlFor="sim-persona">
            Persona{" "}
            <span className="sim-modal-hint-inline">
              — wen soll die KI als Händler spielen?
            </span>
          </label>
          {personasLoading ? (
            <div className="sim-modal-loading-row">
              <Loader2 size={14} className="spin" />
              <span className="sim-modal-hint">Wird geladen…</span>
            </div>
          ) : (
            <>
              <div className="sim-modal-persona-row">
                <select
                  id="sim-persona"
                  className="sim-modal-select"
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                >
                  <option value="">— keine Persona —</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sim-modal-wip-add-btn"
                  onClick={() => setCreatingPersona((v) => !v)}
                  title="Neue Persona anlegen"
                >
                  <UserPlus size={14} />
                </button>
              </div>

              {selectedPersona && !creatingPersona && (
                <p className="sim-modal-persona-preview">
                  {selectedPersona.description}
                </p>
              )}

              {creatingPersona && (
                <div className="sim-modal-persona-form">
                  <input
                    className="sim-modal-input"
                    value={newPersonaName}
                    onChange={(e) => setNewPersonaName(e.target.value)}
                    placeholder="Name, z.B. »Technikscheuer Bäcker«"
                  />
                  <textarea
                    className="sim-modal-textarea"
                    value={newPersonaDesc}
                    onChange={(e) => setNewPersonaDesc(e.target.value)}
                    placeholder="Beschreibung: Laden, Technik-Affinität, Budget, Probleme … z.B. »Bäckerei in Köln, 55 Jahre, nutzt nur Excel und Papier, verliert den Überblick bei Bestellungen, kleines Budget, skeptisch gegenüber Software.«"
                    rows={4}
                  />
                  <div className="sim-modal-persona-form-actions">
                    <button
                      type="button"
                      className="sim-modal-btn-secondary"
                      onClick={() => setCreatingPersona(false)}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="sim-modal-btn-primary"
                      onClick={handleSavePersona}
                      disabled={
                        !newPersonaName.trim() ||
                        !newPersonaDesc.trim() ||
                        savingPersona
                      }
                    >
                      {savingPersona ? (
                        <Loader2 size={13} className="spin" />
                      ) : (
                        <Save size={13} />
                      )}
                      Persona speichern
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Goal / focus */}
          <label className="sim-modal-label" htmlFor="sim-goal">
            Testfokus{" "}
            {selectedPersona ? (
              <span className="sim-modal-hint-inline">
                (optional — worauf willst du bei diesem Lauf achten?)
              </span>
            ) : (
              <span className="sim-modal-required">*</span>
            )}
          </label>
          <textarea
            ref={goalRef}
            id="sim-goal"
            className="sim-modal-textarea"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            placeholder={
              selectedPersona
                ? "Optional: z.B. »Erreicht Navi die Empfehlung in ≤ 5 Turns?«"
                : "Beschreibe den Händler, den die KI spielen soll. z.B. »Bäcker, 55 Jahre, nutzt nur Papier, skeptisch gegenüber Technik«"
            }
            rows={3}
          />

          {/* Title */}
          <label className="sim-modal-label" htmlFor="sim-title">
            Titel{" "}
            <span className="sim-modal-hint-inline">(optional)</span>
          </label>
          <input
            id="sim-title"
            className="sim-modal-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
            placeholder="Wird aus Persona / Testfokus abgeleitet, wenn leer"
          />

          <p className="sim-modal-result-hint">
            Transkript + KI-Bewertung werden unter{" "}
            <code>.assistant/simulations/</code> gespeichert.
          </p>
        </div>

        {/* Footer */}
        <div className="sim-modal-footer">
          <button
            type="button"
            className="sim-modal-btn-secondary"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="sim-modal-btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Simulation starten
          </button>
        </div>
      </div>
    </div>
  );
}

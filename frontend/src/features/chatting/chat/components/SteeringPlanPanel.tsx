export interface SteeringPlanPanelProps {
  activeSessionKind: "standard" | "guided";
  steeringPlan: string;
  steeringPlanOpen: boolean;
  setSteeringPlanOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  streaming: boolean;
}

const noop = () => {};

export function SteeringPlanPanel({
  activeSessionKind,
  steeringPlan,
  steeringPlanOpen,
  setSteeringPlanOpen,
  streaming,
}: SteeringPlanPanelProps) {
  if (activeSessionKind !== "guided") return null;

  return (
    <div className="chat-steering-plan-panel" data-testid="steeringPlanSection">
      <button
        type="button"
        className="chat-steering-plan-toggle"
        onClick={() => setSteeringPlanOpen((o) => !o)}
        aria-expanded={steeringPlanOpen}
      >
        Arbeitsplan
        <span className="chat-steering-plan-chevron">
          {steeringPlanOpen ? "▼" : "▶"}
        </span>
      </button>
      {steeringPlanOpen && (
        <div className="chat-steering-plan-body">
          {steeringPlan.trim() ? (
            <>
              <div className="steering-plan-viewer-placeholder">
                {/* SteeringPlanViewer Platzhalter */}
                <pre>{steeringPlan}</pre>
              </div>
              <div className="chat-steering-plan-actions">
                <button
                  type="button"
                  className="chat-steering-plan-mark-complete-btn"
                  disabled={streaming}
                  onClick={noop}
                >
                  Plan als abgeschlossen markieren
                </button>
              </div>
            </>
          ) : (
            <p className="chat-steering-plan-empty">
              Noch kein Plan — die Assistentin legt ihn in der ersten
              inhaltlichen Antwort als Markdown-Block mit Sprache{" "}
              <code>plan</code> an.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { Target, Users } from "lucide-react";
import type { SimulationConfig } from "../../types.ts";
import "./SimulationContextBanner.css";

interface SimulationContextBannerProps {
  simulationConfig: SimulationConfig;
}

export function SimulationContextBanner({
  simulationConfig,
}: SimulationContextBannerProps) {
  const { goal, baseFileLabel, baseFilePath, characters, resultFile } =
    simulationConfig;

  return (
    <div className="sim-banner">
      <div className="sim-banner-row">
        <Target size={13} className="sim-banner-icon" />
        <span className="sim-banner-goal">{goal}</span>
      </div>

      {characters.length > 0 && (
        <div className="sim-banner-row">
          <Users size={13} className="sim-banner-icon sim-banner-icon-muted" />
          <span className="sim-banner-chars">
            {characters.map((c) => c.name).join(", ")}
          </span>
        </div>
      )}

      <div className="sim-banner-meta">
        {(baseFileLabel ?? baseFilePath) && (
          <span className="sim-banner-meta-item">
            Basis: <code>{baseFileLabel ?? baseFilePath}</code>
          </span>
        )}
        <span className="sim-banner-meta-item">
          Ergebnis: <code>.assistant/simulations/{resultFile}.md</code>
        </span>
      </div>
    </div>
  );
}

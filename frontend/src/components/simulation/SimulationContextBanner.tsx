import { Target, Users } from "lucide-react";
import type { SimulationConfig } from "../../types.ts";
import "./SimulationContextBanner.css";

interface SimulationContextBannerProps {
  simulationConfig: SimulationConfig;
}

export function SimulationContextBanner({
  simulationConfig,
}: SimulationContextBannerProps) {
  const { goal, personaName } = simulationConfig;

  return (
    <div className="sim-banner">
      {personaName && (
        <div className="sim-banner-row">
          <Users size={13} className="sim-banner-icon" />
          <span className="sim-banner-goal">Persona: {personaName}</span>
        </div>
      )}
      {goal && (
        <div className="sim-banner-row">
          <Target size={13} className="sim-banner-icon" />
          <span className="sim-banner-goal">{goal}</span>
        </div>
      )}
    </div>
  );
}

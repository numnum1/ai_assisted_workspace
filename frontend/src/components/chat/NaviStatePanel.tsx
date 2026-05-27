import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  NAVI_CLIENT_STATES,
  getNaviClientState,
} from "./naviStateMachineClient.ts";
import "./NaviStatePanel.css";

interface Props {
  naviStateId: string;
}

export function NaviStatePanel({ naviStateId }: Props) {
  const [open, setOpen] = useState(false);
  const currentIndex = NAVI_CLIENT_STATES.findIndex(
    (s) => s.id === naviStateId,
  );
  const current = getNaviClientState(naviStateId);

  return (
    <div className="navi-state-panel">
      <button
        className={`navi-state-header${open ? " navi-state-header--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <ChevronRight
          size={12}
          className={`navi-state-chevron${open ? " navi-state-chevron--open" : ""}`}
        />
        <span className="navi-state-chip">Navi</span>
        <span className="navi-state-current-label">
          {current?.label ?? naviStateId}
        </span>
        <span className="navi-state-step-counter">
          {currentIndex + 1} / {NAVI_CLIENT_STATES.length}
        </span>
      </button>

      {open && (
        <div className="navi-state-body">
          {current && (
            <p className="navi-state-description">{current.description}</p>
          )}

          <ol className="navi-state-stepper">
            {NAVI_CLIENT_STATES.map((s, i) => {
              const status =
                i < currentIndex
                  ? "done"
                  : i === currentIndex
                    ? "active"
                    : "upcoming";
              return (
                <li
                  key={s.id}
                  className={`navi-state-step navi-state-step--${status}`}
                >
                  <span className="navi-state-step-dot" />
                  <span className="navi-state-step-label">{s.label}</span>
                </li>
              );
            })}
          </ol>

          {current && current.transitions.length > 0 && (
            <div className="navi-state-transitions">
              <span className="navi-state-transitions-label">Weiter zu:</span>
              {current.transitions.map((t) => (
                <span key={t.to} className="navi-state-transition-chip">
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

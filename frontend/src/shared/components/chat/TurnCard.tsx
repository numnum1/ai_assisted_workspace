import type { HTMLAttributes, ReactNode } from 'react';
import './TurnCard.css';

export type TurnType = 'user' | 'assistant';

interface TurnCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  turnType: TurnType;
  showActions: boolean;
  actions?: ReactNode;
  children: ReactNode;
}

export function TurnCard({ turnType, showActions, actions, children, ...divProps }: TurnCardProps) {
  return (
    <div {...divProps} className="turn-card" data-turn-type={turnType}>
      <div className="turn-card-content">
        {children}
      </div>
      {showActions && actions && (
        <div
          className="turn-card-actions"
          aria-label={
            turnType === 'assistant'
              ? 'Aktionen für diese KI-Antwort'
              : 'Aktionen für diese Nachricht'
          }
        >
          {actions}
        </div>
      )}
    </div>
  );
}

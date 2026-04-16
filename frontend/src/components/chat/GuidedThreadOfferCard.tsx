import { GitBranch } from 'lucide-react';
import type { GuidedThreadOfferPayload } from './guidedThreadOfferUtils.ts';
import { previewSteeringPlan } from './guidedThreadOfferUtils.ts';

export interface GuidedThreadOfferCardProps {
  offer: GuidedThreadOfferPayload;
  /** When true, thread creation is not allowed (e.g. already inside a thread). */
  blocked?: boolean;
  disabled: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}

const PLAN_PREVIEW_CHARS = 420;

export function GuidedThreadOfferCard({
  offer,
  blocked = false,
  disabled,
  onAccept,
  onDismiss,
}: GuidedThreadOfferCardProps) {
  const title = offer.threadTitle?.trim() || 'Guided Thread';
  const summary = offer.summary?.trim();
  const planPreview = previewSteeringPlan(offer.steeringPlanMarkdown, PLAN_PREVIEW_CHARS);

  return (
    <div className="guided-thread-offer-card">
      <div className="guided-thread-offer-card-header">
        <GitBranch size={16} aria-hidden className="guided-thread-offer-card-icon" />
        <div className="guided-thread-offer-card-titles">
          <span className="guided-thread-offer-card-label">Angebot: Guided Thread</span>
          <span className="guided-thread-offer-card-title">{title}</span>
        </div>
      </div>
      {summary ? <p className="guided-thread-offer-card-summary">{summary}</p> : null}
      <div className="guided-thread-offer-card-plan">
        <span className="guided-thread-offer-card-plan-label">Arbeitsplan (Vorschau)</span>
        <pre className="guided-thread-offer-card-plan-body">{planPreview}</pre>
      </div>
      {blocked ? (
        <p className="guided-thread-offer-card-blocked">
          In einem Thread kann kein weiterer Thread gestartet werden.
        </p>
      ) : null}
      <div className="guided-thread-offer-card-actions">
        <button
          type="button"
          className="guided-thread-offer-btn primary"
          onClick={onAccept}
          disabled={disabled || blocked}
        >
          Guided Thread starten
        </button>
        <button
          type="button"
          className="guided-thread-offer-btn secondary"
          onClick={onDismiss}
          disabled={disabled}
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}

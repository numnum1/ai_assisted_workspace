import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle, Clock, Target } from 'lucide-react';
import type { ParsedSteeringPlan } from './planFenceUtils.ts';

interface SteeringPlanViewerProps {
  parsedPlan: ParsedSteeringPlan;
}

export const SteeringPlanViewer: React.FC<SteeringPlanViewerProps> = ({
  parsedPlan,
}) => {
  const { isComplete, title, status, progress, currentStep, totalSteps, steps, rawMarkdown } = parsedPlan;

  return (
    <div className="steering-plan-viewer">
      {/* Header with status */}
      <div className="plan-header">
        <div className="plan-title">
          <Target size={16} />
          <span>{title}</span>
          {isComplete && (
            <span className="completion-badge">
              <CheckCircle size={14} />
              Abgeschlossen
            </span>
          )}
        </div>
        
        <div className="plan-status">
          <span className={`status-pill ${isComplete ? 'complete' : 'active'}`}>
            {status || (isComplete ? 'Abgeschlossen' : 'In Bearbeitung')}
          </span>
          <span className="step-counter">
            Schritt {currentStep} von {totalSteps}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="plan-progress-container">
        <div className="plan-progress-bar">
          <div 
            className="plan-progress-fill" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="plan-progress-label">{progress}% abgeschlossen</div>
      </div>

      {/* Current step highlight */}
      {steps.length > 0 && (
        <div className="current-step-section">
          <div className="current-step-label">
            <Clock size={14} />
            Aktueller Schritt
          </div>
          <div className="current-step-content">
            {steps.find(s => s.isCurrent)?.text || steps[0]?.text || 'Plan wird ausgeführt...'}
          </div>
        </div>
      )}

      {/* Full plan markdown (collapsible or always visible) */}
      <div className="plan-full-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {rawMarkdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};

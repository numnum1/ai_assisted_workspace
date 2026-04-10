/**
 * Extract markdown from assistant messages: fenced ```plan blocks (full updated steering plan).
 */

const PLAN_FENCE_RE = /```plan\s*\n?([\s\S]*?)\n?```/;
const PLAN_FENCE_RE_GLOBAL = new RegExp(PLAN_FENCE_RE.source, 'g');

/** Opening fence for a steering plan block (language tag exactly `plan`). */
const PLAN_OPEN_RE = /```plan\b/;

/**
 * Removes ```plan … ``` from markdown shown in the chat bubble (plan is shown in the Arbeitsplan panel).
 * When streaming, truncates from an opening ```plan if the closing fence has not arrived yet.
 */
export function stripPlanFencesForDisplay(content: string, streaming: boolean): string {
  if (!content) return content;
  let s = content.replace(PLAN_FENCE_RE_GLOBAL, '');
  if (streaming) {
    const m = s.match(PLAN_OPEN_RE);
    if (m?.index !== undefined) {
      s = s.slice(0, m.index).replace(/\s+$/, '');
    }
  }
  return s;
}

export function parseSteeringPlanFromAssistant(content: string): string | null {
  if (!content) return null;
  const m = content.match(PLAN_FENCE_RE);
  if (!m) return null;
  const inner = m[1]?.trim();
  return inner && inner.length > 0 ? inner : null;
}

/**
 * Detects if the assistant has declared the plan complete.
 * Looks for phrases like "Der Plan ist abgeschlossen" or "## Status: Abgeschlossen".
 */
export function isPlanCompleted(content: string): boolean {
  if (!content) return false;
  const normalized = content.toLowerCase();
  return normalized.includes('plan ist abgeschlossen') ||
         normalized.includes('status: abgeschlossen') ||
         normalized.includes('der plan ist fertig') ||
         /##\s*status:?\s*abgeschlossen/i.test(content);
}

export interface ParsedSteeringPlan {
  rawMarkdown: string;
  isComplete: boolean;
  title?: string;
  status?: string;
  currentStep?: number;
  totalSteps?: number;
  progress: number; // 0-100
  steps: Array<{ text: string; isCurrent: boolean; isDone?: boolean }>;
}

/**
 * Parses the steering plan markdown into structured data for the visual viewer.
 * Extracts completion status, current step, and progress.
 */
export function parseSteeringPlan(planMarkdown: string | null): ParsedSteeringPlan {
  if (!planMarkdown) {
    return {
      rawMarkdown: '',
      isComplete: false,
      progress: 0,
      steps: []
    };
  }

  const isComplete = isPlanCompleted(planMarkdown);
  const lines = planMarkdown.split('\n');
  let title = '';
  let status = '';
  let currentStep = 0;
  let totalSteps = 0;
  const steps: Array<{ text: string; isCurrent: boolean; isDone?: boolean }> = [];
  let inVorgehenSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Extract title from ## Ziel
    if (line.startsWith('## Ziel')) {
      title = lines[i + 1]?.trim() || 'Plan';
      i++;
      continue;
    }

    // Extract status
    if (line.startsWith('## Status') || line.includes('Status:')) {
      status = line.includes('Abgeschlossen') || line.includes('abgeschlossen') ? 'Abgeschlossen' : 'In Bearbeitung';
      continue;
    }

    // Parse Vorgehen steps
    if (line.startsWith('## Vorgehen') || line.startsWith('## Vorgehen:')) {
      inVorgehenSection = true;
      continue;
    }

    if (inVorgehenSection) {
      // Match numbered steps like "1. Do something → **Aktuell: 1**"
      const stepMatch = line.match(/^(\d+)\.\s*(.+?)(?:\s*→\s*\*\*Aktuell:\s*(\d+)\*\*)?$/i);
      if (stepMatch) {
        const stepNum = parseInt(stepMatch[1], 10);
        const stepText = stepMatch[2].trim();
        const isCurrent = stepMatch[3] !== undefined || line.includes('**Aktuell:');

        totalSteps = Math.max(totalSteps, stepNum);
        if (isCurrent) currentStep = stepNum;

        steps.push({
          text: stepText,
          isCurrent,
          isDone: stepNum < currentStep || (isComplete && stepNum <= totalSteps)
        });
      } else if (line.match(/^\d+\./)) {
        // Simple numbered line
        const simpleMatch = line.match(/^(\d+)\.\s*(.+)$/);
        if (simpleMatch) {
          const stepNum = parseInt(simpleMatch[1], 10);
          steps.push({
            text: simpleMatch[2].trim(),
            isCurrent: false,
            isDone: isComplete
          });
          totalSteps = Math.max(totalSteps, stepNum);
        }
      } else if (line.startsWith('##') || line === '') {
        // End of section
        inVorgehenSection = false;
      }
    }
  }

  const progress = totalSteps > 0 
    ? Math.round(((currentStep || (isComplete ? totalSteps : Math.max(1, steps.length))) / totalSteps) * 100)
    : isComplete ? 100 : steps.length > 0 ? 40 : 25; // graceful default

  return {
    rawMarkdown: planMarkdown,
    isComplete,
    title: title || 'Arbeitsplan',
    status: status || (isComplete ? 'Abgeschlossen' : 'In Bearbeitung'),
    currentStep: currentStep || Math.max(1, steps.length),
    totalSteps: totalSteps || Math.max(steps.length, 3),
    progress: Math.min(Math.max(progress, 0), 100),
    steps: steps.length > 0 ? steps : [
      { text: 'Plan wird initialisiert – die KI erstellt den ersten Arbeitsplan...', isCurrent: true }
    ]
  };
}

import type { NaviFacts } from '../../types.ts';

export function naviPlanIsAvailable(facts?: NaviFacts | null): boolean {
  return !!(
    facts &&
    (facts.recommendation?.trim() || facts.hypothesis?.trim() || facts.currentProblem?.trim())
  );
}

export function buildNaviPlanText(facts: NaviFacts, conversationTitle?: string): string {
  const lines: string[] = [];
  lines.push('Handlungsplan – Navi-Beratung');
  if (conversationTitle?.trim()) lines.push(conversationTitle.trim());
  lines.push(`Stand: ${new Date().toLocaleDateString('de-DE')}`);
  lines.push('');

  if (facts.currentProblem?.trim()) {
    lines.push('Ausgangslage');
    lines.push(facts.currentProblem.trim());
    lines.push('');
  }
  if (facts.hypothesis?.trim()) {
    lines.push('Einschätzung');
    lines.push(facts.hypothesis.trim());
    lines.push('');
  }
  if (facts.recommendation?.trim()) {
    lines.push('Empfehlung');
    lines.push(facts.recommendation.trim());
    lines.push('');
  }
  if (facts.notes?.trim()) {
    lines.push('Weitere Notizen');
    lines.push(facts.notes.trim());
    lines.push('');
  }
  if (facts.problemQueue?.length) {
    lines.push('Für später vorgemerkt');
    for (const p of facts.problemQueue) lines.push(`- ${p}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

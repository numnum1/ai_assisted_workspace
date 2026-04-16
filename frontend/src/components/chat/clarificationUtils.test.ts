import { describe, expect, it } from 'vitest';
import { hasClarificationFence, parseClarificationQuestions } from './clarificationUtils.ts';

const validJson = JSON.stringify([{ question: 'Wie weiter?', options: ['A', 'B'] }]);

describe('parseClarificationQuestions', () => {
  it('parses a message that is only a clarification fence', () => {
    const content = `\`\`\`clarification\n${validJson}\n\`\`\``;
    expect(parseClarificationQuestions(content)).toEqual([
      { question: 'Wie weiter?', options: ['A', 'B'] },
    ]);
    expect(hasClarificationFence(content)).toBe(true);
  });

  it('parses preamble text before the fence', () => {
    const content = `Hier ist kurz Kontext.\n\n\`\`\`clarification\n${validJson}\n\`\`\``;
    expect(parseClarificationQuestions(content)?.[0]?.question).toBe('Wie weiter?');
    expect(hasClarificationFence(content)).toBe(true);
  });

  it('uses the last valid block when an earlier fake fence is invalid JSON', () => {
    const good = JSON.stringify([{ question: 'Q2', options: ['x'] }]);
    const content = [
      '```clarification',
      'NOT JSON',
      '```',
      '',
      '```clarification',
      good,
      '```',
    ].join('\n');
    expect(parseClarificationQuestions(content)).toEqual([{ question: 'Q2', options: ['x'] }]);
  });

  it('allows option strings that contain backticks on a line (closing fence is its own line)', () => {
    const json = JSON.stringify([
      { question: 'Pick', options: ['use `code` here', 'plain'] },
    ]);
    const content = `Intro\n\`\`\`clarification\n${json}\n\`\`\``;
    expect(parseClarificationQuestions(content)).toEqual([
      { question: 'Pick', options: ['use `code` here', 'plain'] },
    ]);
  });

  it('returns null when the closing fence line is missing (streaming partial)', () => {
    const content = `\`\`\`clarification\n${validJson}`;
    expect(parseClarificationQuestions(content)).toBeNull();
    expect(hasClarificationFence(content)).toBe(false);
  });

  it('returns null for empty questions array', () => {
    const content = '```clarification\n[]\n```';
    expect(parseClarificationQuestions(content)).toBeNull();
    expect(hasClarificationFence(content)).toBe(false);
  });

  it('parses a single question object (not array)', () => {
    const json = JSON.stringify({ question: 'One?', options: ['y', 'n'] });
    const content = `\`\`\`clarification\n${json}\n\`\`\``;
    expect(parseClarificationQuestions(content)).toEqual([{ question: 'One?', options: ['y', 'n'] }]);
  });
});

describe('hasClarificationFence', () => {
  it('is false when no clarification block exists', () => {
    expect(hasClarificationFence('just chat')).toBe(false);
  });

  it('matches parseClarificationQuestions success', () => {
    const content = `x\n\`\`\`clarification\n${validJson}\n\`\`\``;
    expect(hasClarificationFence(content)).toBe(parseClarificationQuestions(content) != null);
  });
});

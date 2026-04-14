import { describe, expect, it } from 'vitest';
import { parseThinkSegments } from './thinkSegmentUtils.ts';

describe('parseThinkSegments', () => {
  it('returns empty array for empty string', () => {
    expect(parseThinkSegments('', false)).toEqual([]);
  });

  it('parses two complete thinking blocks with markdown between', () => {
    const s =
      'before <think>A</think> mid <think>B</think> after';
    expect(parseThinkSegments(s, false)).toEqual([
      { kind: 'markdown', text: 'before' },
      { kind: 'thinking', text: 'A' },
      { kind: 'markdown', text: 'mid' },
      { kind: 'thinking', text: 'B' },
      { kind: 'markdown', text: 'after' },
    ]);
  });

  it('marks only the last unclosed block as streaming', () => {
    const s =
      'x <think>a</think> y <think>partial';
    expect(parseThinkSegments(s, true)).toEqual([
      { kind: 'markdown', text: 'x' },
      { kind: 'thinking', text: 'a' },
      { kind: 'markdown', text: 'y' },
      { kind: 'thinking', text: 'partial', streaming: true },
    ]);
  });

  it('handles legacy leading text before close then a paired block', () => {
    const s = 'legacy\\think}<think>inner</think> tail';
    expect(parseThinkSegments(s, false)).toEqual([
      { kind: 'thinking', text: 'legacy' },
      { kind: 'thinking', text: 'inner' },
      { kind: 'markdown', text: 'tail' },
    ]);
  });

  it('accepts <thinking> open alias closed with long tag', () => {
    const s = 'p <thinking>t</think> q';
    expect(parseThinkSegments(s, false)).toEqual([
      { kind: 'markdown', text: 'p' },
      { kind: 'thinking', text: 't' },
      { kind: 'markdown', text: 'q' },
    ]);
  });
});

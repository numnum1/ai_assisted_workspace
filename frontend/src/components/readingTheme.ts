import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

export interface ReadingThemeConfig {
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  maxWidth: string;
  padding: string;
  backgroundColor: string;
  textColor: string;
  caretColor: string;
  selectionColor: string;
}

const defaultConfig: ReadingThemeConfig = {
  fontFamily: '"Georgia", "Palatino Linotype", "Book Antiqua", serif',
  fontSize: '15px',
  lineHeight: '1.5',
  maxWidth: '90%',
  padding: '48px 64px',
  backgroundColor: '#f5f0e8',
  textColor: '#2c2a25',
  caretColor: '#555',
  selectionColor: '#c8d8ec',
};

const readingHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '700', fontSize: '1.6em' },
  { tag: tags.heading2, fontWeight: '700', fontSize: '1.35em' },
  { tag: tags.heading3, fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading4, fontWeight: '600', fontSize: '1.05em' },
  { tag: tags.heading5, fontWeight: '600' },
  { tag: tags.heading6, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#888' },
  { tag: tags.link, color: '#2a6496', textDecoration: 'underline' },
  { tag: tags.url, color: '#2a6496' },
  { tag: tags.monospace, fontFamily: '"Consolas", "Fira Code", monospace', fontSize: '0.9em', backgroundColor: 'rgba(0, 0, 0, 0.06)', borderRadius: '3px' },
  { tag: tags.comment, color: '#9a9080', fontStyle: 'italic' },
  { tag: tags.quote, color: '#6b6050', fontStyle: 'italic', borderLeft: '3px solid #d0c8b8' },
  { tag: tags.processingInstruction, color: '#9a9080' },
  { tag: tags.meta, color: '#9a9080' },
  { tag: tags.contentSeparator, color: '#c0b8a8' },
]);

export function createReadingTheme(overrides: Partial<ReadingThemeConfig> = {}): Extension {
  const cfg = { ...defaultConfig, ...overrides };

  const theme = EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: cfg.backgroundColor,
    },
    '.cm-scroller': {
      overflow: 'auto',
      display: 'flex',
      justifyContent: 'center',
    },
    '.cm-content': {
      maxWidth: cfg.maxWidth,
      width: '100%',
      padding: cfg.padding,
      fontFamily: cfg.fontFamily,
      fontSize: cfg.fontSize,
      lineHeight: cfg.lineHeight,
      color: cfg.textColor,
      caretColor: cfg.caretColor,
      textAlign: 'left',
      textRendering: 'optimizeLegibility',
      letterSpacing: '0.01em',
      wordSpacing: '0.05em',
    },
    '.cm-line': {
      padding: '0',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLineGutter': {
      display: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '&.cm-focused .cm-activeLine': {
      backgroundColor: 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: cfg.caretColor,
      borderLeftWidth: '1.5px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: cfg.selectionColor,
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(200, 216, 236, 0.4)',
    },
  });

  return [theme, syntaxHighlighting(readingHighlightStyle)];
}

import { EditorView } from '@codemirror/view';
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
  fontSize: '18px',
  lineHeight: '1.8',
  maxWidth: '720px',
  padding: '48px 64px',
  backgroundColor: '#faf8f4',
  textColor: '#2c2a25',
  caretColor: '#555',
  selectionColor: '#c8d8ec',
};

export function createReadingTheme(overrides: Partial<ReadingThemeConfig> = {}): Extension {
  const cfg = { ...defaultConfig, ...overrides };

  return EditorView.theme({
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
}

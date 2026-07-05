import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { CSSProperties } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { unifiedMergeView } from '@codemirror/merge';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { createReadingTheme } from './readingTheme';
import { hideMarksExtension } from './hideMarksExtension';
import { wikiReferenceDisplayExtension } from './wikiReferenceDisplayExtension';
import { scrollLineWithoutCursorKeymap } from './codemirrorScrollLineKeymap.ts';
import type { ReadingThemeConfig } from './readingTheme';
import type { SelectionContext, AltVersionSession } from '../../types.ts';
import type { Extension } from '@codemirror/state';

export interface MarkdownEditorConfig {
  /** Hide *, _, #, ` and ~ syntax marks on non-active lines. Default: false */
  alwaysShowMarkdownStylingCharacters?: boolean;
  /** Hide <!-- ... --> HTML comments on non-active lines. Default: false */
  alwaysShowHtmlComments?: boolean;
  /** On non-active lines, show only the display name as an underlined link; hide @, brackets, and path. Default: false */
  showReferencesAsLinks?: boolean;
  /** Visual theme. Default: 'file' */
  theme?: 'file' | 'reading' | 'clean';
  /** Overrides for the reading theme (only applied when theme='reading'). */
  readingThemeOverrides?: Partial<ReadingThemeConfig>;
  /** Layout mode. 'fixed' fills container height with internal scroll; 'auto' expands to content. Default: 'fixed' */
  layout?: 'fixed' | 'auto';
  /** Enable Alt+S / Mod-Alt-S German quote wrapping. Default: false */
  enableGermanQuotes?: boolean;
  /** Passed as editorId in the SelectionContext for onCtrlL. Default: 'file' */
  editorId?: 'file' | 'chapter';
  /** When set, shows an inline diff of the current document against this original text (e.g. an older git revision). */
  diffOriginal?: string | null;
}

/** Imperative handle for programmatic edits from outside (e.g. accepting an AI suggestion). */
export interface MarkdownEditorHandle {
  /**
   * Replace the single exact occurrence of `search` with `replacement` in the
   * live document. Returns false (and does nothing) if `search` is not found or
   * appears more than once, so callers never overwrite an ambiguous match.
   */
  replaceExact: (search: string, replacement: string) => boolean;
}

export interface UnifiedMarkdownEditorProps extends MarkdownEditorConfig {
  /** Key that triggers editor recreation when it changes (e.g. file path or action id). */
  instanceKey: string;
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
  onAltVersion?: (session: AltVersionSession) => void;
  /** 1-based line to scroll to (used with scrollNonce). */
  scrollToLine?: number;
  /** Changes whenever a new scroll-to-line request is made (e.g. timestamp). */
  scrollNonce?: number;
  onScrollHandled?: () => void;
  className?: string;
  style?: CSSProperties;
}

function buildFileTheme(layout: 'fixed' | 'auto'): Extension {
  return EditorView.theme(
    {
      '&': {
        height: layout === 'fixed' ? '100%' : 'auto',
        fontSize: '14px',
        backgroundColor: 'var(--bg-secondary, #1e1e2e)',
        color: 'var(--text-primary, #cdd6f4)',
      },
      '.cm-scroller': {
        overflow: layout === 'fixed' ? 'auto' : 'visible',
        fontFamily: 'ui-monospace, monospace',
      },
      '.cm-content': { minHeight: '200px', padding: '12px 16px' },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-tertiary, #181825)',
        color: 'var(--text-muted, #6c7086)',
        borderRight: '1px solid var(--border, #313244)',
      },
      '.cm-activeLineGutter': { backgroundColor: 'rgba(137, 180, 250, 0.12)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, &.cm-focused .cm-selectionBackground':
        { background: 'rgba(137, 180, 250, 0.35)' },
      '.cm-selectionMatch': { backgroundColor: 'rgba(137, 180, 250, 0.15)' },
    },
    { dark: true },
  );
}

/** Clean, distraction-free theme: sans-serif prose look, no gutter, centered column, follows app light/dark vars. */
function buildCleanTheme(layout: 'fixed' | 'auto'): Extension {
  return EditorView.theme({
    '&': {
      height: layout === 'fixed' ? '100%' : 'auto',
      fontSize: '16px',
      backgroundColor: 'var(--bg-primary, #1e1e2e)',
      color: 'var(--text-primary, #cdd6f4)',
    },
    '.cm-scroller': {
      overflow: layout === 'fixed' ? 'auto' : 'visible',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      display: 'flex',
      justifyContent: 'center',
    },
    '.cm-content': {
      maxWidth: '760px',
      width: '100%',
      minHeight: '200px',
      padding: '40px 8px',
      lineHeight: '1.7',
      caretColor: 'var(--text-primary, #cdd6f4)',
    },
    '.cm-line': {
      padding: '0 2px',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '&.cm-focused .cm-activeLine': {
      backgroundColor: 'var(--bg-hover, rgba(137, 180, 250, 0.08))',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'var(--accent-dim, rgba(137, 180, 250, 0.35))',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'var(--accent-dim, rgba(137, 180, 250, 0.15))',
    },
  });
}

/** Higher-contrast override for @codemirror/merge's default (very subtle) diff colors. */
function buildDiffTheme(): Extension {
  return EditorView.theme({
    '.cm-deletedChunk': {
      backgroundColor: 'rgba(220, 50, 47, 0.16)',
    },
    '.cm-deletedChunk .cm-deletedText, .cm-deletedLine del.cm-deletedText': {
      background: 'rgba(220, 50, 47, 0.55)',
      color: '#ffd7d3',
      textDecoration: 'line-through',
    },
    '.cm-merge-b .cm-changedLine': {
      backgroundColor: 'rgba(46, 204, 113, 0.16)',
    },
    '.cm-merge-b .cm-changedText, ins.cm-insertedLine': {
      background: 'rgba(46, 204, 113, 0.6)',
      color: 'inherit',
    },
    '.cm-deletedLineGutter': {
      background: '#e5342f',
    },
    '.cm-merge-b .cm-changedLineGutter': {
      background: '#28c76f',
    },
  });
}

function buildDiffExtensions(diffOriginal: string | null): Extension[] {
  return diffOriginal != null ? [unifiedMergeView({ original: diffOriginal }), buildDiffTheme()] : [];
}

export const UnifiedMarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  UnifiedMarkdownEditorProps
>(function UnifiedMarkdownEditor({
  instanceKey,
  content,
  onChange,
  onSave,
  onCtrlL,
  onAltVersion,
  alwaysShowMarkdownStylingCharacters = false,
  alwaysShowHtmlComments = false,
  showReferencesAsLinks = false,
  theme = 'file',
  readingThemeOverrides,
  layout = 'fixed',
  enableGermanQuotes = false,
  editorId = 'file' as const,
  scrollToLine,
  scrollNonce,
  onScrollHandled,
  className,
  style,
  diffOriginal = null,
}: UnifiedMarkdownEditorProps, handleRef) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const diffCompartment = useRef(new Compartment());

  useImperativeHandle(handleRef, () => ({
    replaceExact(search, replacement) {
      const view = viewRef.current;
      if (!view || !search) return false;
      const doc = view.state.doc.toString();
      const first = doc.indexOf(search);
      if (first === -1) return false;
      // Refuse ambiguous matches: a second occurrence means we can't be sure
      // which span the comment referred to.
      if (doc.indexOf(search, first + search.length) !== -1) return false;
      view.dispatch({
        changes: { from: first, to: first + search.length, insert: replacement },
      });
      return true;
    },
  }), []);

  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCtrlLRef = useRef(onCtrlL);
  const onAltVersionRef = useRef(onAltVersion);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onCtrlLRef.current = onCtrlL;
  onAltVersionRef.current = onAltVersion;

  const buildDynamicExtensions = useCallback((): Extension[] => {
    const exts: Extension[] = [];

    if (theme === 'reading') {
      exts.push(createReadingTheme(readingThemeOverrides));
    } else if (theme === 'clean') {
      exts.push(buildCleanTheme(layout));
    } else {
      exts.push(buildFileTheme(layout));
    }

    exts.push(
      hideMarksExtension({
        hideMarkdownMarks: !alwaysShowMarkdownStylingCharacters,
        hideHtmlComments: !alwaysShowHtmlComments,
        skipWikiPrefixedLinks: showReferencesAsLinks,
      }),
    );

    if (showReferencesAsLinks) {
      exts.push(...wikiReferenceDisplayExtension());
    }

    return exts;
  }, [
    theme,
    readingThemeOverrides,
    layout,
    alwaysShowMarkdownStylingCharacters,
    alwaysShowHtmlComments,
    showReferencesAsLinks,
  ]);

  useEffect(() => {
    if (!editorRef.current) return;

    const germanQuotesRun = (view: EditorView) => {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      const insert = '„' + selected + '\u201c';
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 1 + selected.length },
      });
      return true;
    };

    const extraKeymaps = enableGermanQuotes
      ? [
          { key: 'Alt-s', preventDefault: true, run: germanQuotesRun },
          { key: 'Mod-Alt-s', run: germanQuotesRun },
        ]
      : [];

    const state = EditorState.create({
      doc: content,
      extensions: [
        drawSelection(),
        history(),
        markdown(),
        scrollLineWithoutCursorKeymap,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
          {
            key: 'Mod-l',
            run: (view) => {
              const sel = view.state.selection.main;
              if (!sel.empty && onCtrlLRef.current) {
                const text = view.state.doc.sliceString(sel.from, sel.to);
                onCtrlLRef.current(
                  { text, from: sel.from, to: sel.to, editorId },
                  (from, to, insert) => view.dispatch({ changes: { from, to, insert } }),
                );
              }
              return true;
            },
          },
          {
            key: 'Alt-w',
            run: (view) => {
              const sel = view.state.selection.main;
              if (!sel.empty && onAltVersionRef.current) {
                const text = view.state.doc.sliceString(sel.from, sel.to);
                const anchorPos = sel.from;
                onAltVersionRef.current({
                  originalText: text,
                  from: anchorPos,
                  to: sel.to,
                  editorId,
                  getAnchorCoords: () => {
                    const coords = view.coordsAtPos(anchorPos);
                    if (!coords) return null;
                    // Use the right edge of the editor scroll container so the panel
                    // appears to the right of the text column, not mid-line.
                    const editorRight = view.scrollDOM.getBoundingClientRect().right;
                    return { ...coords, right: editorRight };
                  },
                  replaceFn: (from, to, insert) => view.dispatch({ changes: { from, to, insert } }),
                });
              }
              return true;
            },
          },
          ...extraKeymaps,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        themeCompartment.current.of(buildDynamicExtensions()),
        diffCompartment.current.of(buildDiffExtensions(diffOriginal)),
      ],
    });

    const el = editorRef.current;
    const view = new EditorView({ state, parent: el });
    viewRef.current = view;

    // Capture-phase listener needed to intercept Alt+S before browser/OS handlers
    let handleAltS: ((e: KeyboardEvent) => void) | null = null;
    if (enableGermanQuotes) {
      handleAltS = (e: KeyboardEvent) => {
        if (e.altKey && (e.key === 's' || e.key === 'S') && el.contains(document.activeElement)) {
          e.preventDefault();
          e.stopPropagation();
          germanQuotesRun(view);
        }
      };
      document.addEventListener('keydown', handleAltS, { capture: true });
    }

    return () => {
      if (handleAltS) {
        document.removeEventListener('keydown', handleAltS, { capture: true });
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceKey]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(buildDynamicExtensions()),
    });
  }, [buildDynamicExtensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: diffCompartment.current.reconfigure(buildDiffExtensions(diffOriginal)),
    });
  }, [diffOriginal]);

  useEffect(() => {
    if (scrollNonce == null || scrollToLine == null) return;
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const lineNo = Math.max(1, Math.min(scrollToLine, doc.lines));
    const pos = doc.line(lineNo).from;
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    onScrollHandled?.();
  }, [scrollNonce, scrollToLine, onScrollHandled]);

  return <div ref={editorRef} className={className} style={style} />;
});

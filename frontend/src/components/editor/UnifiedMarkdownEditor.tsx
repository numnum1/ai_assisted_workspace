import { useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
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
  theme?: 'file' | 'reading';
  /** Overrides for the reading theme (only applied when theme='reading'). */
  readingThemeOverrides?: Partial<ReadingThemeConfig>;
  /** Layout mode. 'fixed' fills container height with internal scroll; 'auto' expands to content. Default: 'fixed' */
  layout?: 'fixed' | 'auto';
  /** Enable Alt+S / Mod-Alt-S German quote wrapping. Default: false */
  enableGermanQuotes?: boolean;
  /** Passed as editorId in the SelectionContext for onCtrlL. Default: 'file' */
  editorId?: 'file' | 'chapter';
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

export function UnifiedMarkdownEditor({
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
}: UnifiedMarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());

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
}

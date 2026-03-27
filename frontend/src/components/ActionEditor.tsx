import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { createReadingTheme } from './readingTheme';
import { hideMarksExtension } from './hideMarksExtension';
import { scrollLineWithoutCursorKeymap } from './codemirrorScrollLineKeymap.ts';
import type { SelectionContext } from '../types.ts';

export interface ActionEditorColors {
  bg: string;
  text: string;
  caretColor: string;
  selectionColor: string;
}

interface ActionEditorProps {
  actionId: string;
  content: string;
  colors: ActionEditorColors;
  fontSize: number;
  padding: number;
  onChange: (content: string) => void;
  onSave: () => void;
  /** Called on Ctrl+L with the selected text and a function to apply a replacement */
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
}

export function ActionEditor({ actionId, content, colors, fontSize, padding, onChange, onSave, onCtrlL }: ActionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onCtrlLRef = useRef(onCtrlL);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onCtrlLRef.current = onCtrlL;

  const buildThemeExtensions = useCallback(() => {
    return [
      createReadingTheme({
        fontSize: `${fontSize}px`,
        padding: `16px ${padding}px`,
        backgroundColor: colors.bg,
        textColor: colors.text,
        caretColor: colors.caretColor,
        selectionColor: colors.selectionColor,
      }),
      hideMarksExtension(),
    ];
  }, [fontSize, padding, colors]);

  // Create editor once per actionId — destroyed and recreated only when a different action is loaded
  useEffect(() => {
    if (!editorRef.current) return;

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
                  { text, from: sel.from, to: sel.to, editorId: 'chapter' },
                  (from, to, insert) => view.dispatch({ changes: { from, to, insert } }),
                );
              }
              return true;
            },
          },
          {
            key: 'Alt-s',
            preventDefault: true,
            run: (view) => {
              const { from, to } = view.state.selection.main;
              const selected = view.state.sliceDoc(from, to);
              const insert = '„' + selected + '“';
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + 1 + selected.length },
              });
              return true;
            },
          },
          {
            key: 'Mod-Alt-s',
            run: (view) => {
              const { from, to } = view.state.selection.main;
              const selected = view.state.sliceDoc(from, to);
              const insert = '„' + selected + '“';
              view.dispatch({
                changes: { from, to, insert },
                selection: { anchor: from + 1 + selected.length },
              });
              return true;
            },
          },
        ]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: 'auto' },
          '.cm-scroller': { overflow: 'visible' },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        themeCompartment.current.of(buildThemeExtensions()),
      ],
    });

    const el = editorRef.current;
    const view = new EditorView({ state, parent: el });
    viewRef.current = view;

    const handleAltS = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 's' || e.key === 'S') && el.contains(document.activeElement)) {
        e.preventDefault();
        e.stopPropagation();
        const { from, to } = view.state.selection.main;
        const selected = view.state.sliceDoc(from, to);
        const insert = '„' + selected + '“';
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + 1 + selected.length },
        });
      }
    };
    document.addEventListener('keydown', handleAltS, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleAltS, { capture: true });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  // Reconfigure theme in-place — no editor recreation, no double-mount risk
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(buildThemeExtensions()),
    });
  }, [buildThemeExtensions]);

  return (
    <div
      ref={editorRef}
      className="action-editor-cm-wrap"
      style={{ backgroundColor: colors.bg }}
    />
  );
}

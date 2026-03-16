import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { createReadingTheme } from './readingTheme';
import { hideMarksExtension } from './hideMarksExtension';

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
}

export function ActionEditor({ actionId, content, colors, fontSize, padding, onChange, onSave }: ActionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

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

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
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

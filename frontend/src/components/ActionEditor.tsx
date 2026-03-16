import { useEffect, useRef, useCallback } from 'react';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  const buildExtensions = useCallback(() => {
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
        ...buildExtensions(),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Re-create editor only when actionId changes (different action loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId]);

  // Update theme without recreating editor when visual settings change
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Re-create when theme settings change by destroying and recreating
    // This is acceptable since theme changes are infrequent user actions
    if (!editorRef.current) return;
    const currentDoc = view.state.doc.toString();
    view.destroy();

    const state = EditorState.create({
      doc: currentDoc,
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
        ...buildExtensions(),
      ],
    });

    const newView = new EditorView({ state, parent: editorRef.current });
    viewRef.current = newView;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildExtensions]);

  return (
    <div
      ref={editorRef}
      className="action-editor-cm-wrap"
      style={{ backgroundColor: colors.bg }}
    />
  );
}

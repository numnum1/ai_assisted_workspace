import { memo, useMemo } from 'react';
import { UnifiedMarkdownEditor } from './UnifiedMarkdownEditor';
import type { SelectionContext } from '../../types.ts';

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

export const ActionEditor = memo(function ActionEditor({ actionId, content, colors, fontSize, padding, onChange, onSave, onCtrlL }: ActionEditorProps) {
  const readingThemeOverrides = useMemo(() => ({
    fontSize: `${fontSize}px`,
    padding: `16px ${padding}px`,
    backgroundColor: colors.bg,
    textColor: colors.text,
    caretColor: colors.caretColor,
    selectionColor: colors.selectionColor,
  }), [fontSize, padding, colors.bg, colors.text, colors.caretColor, colors.selectionColor]);

  const editorStyle = useMemo(() => ({ backgroundColor: colors.bg }), [colors.bg]);

  return (
    <UnifiedMarkdownEditor
      instanceKey={actionId}
      content={content}
      onChange={onChange}
      onSave={onSave}
      onCtrlL={onCtrlL}
      theme="reading"
      readingThemeOverrides={readingThemeOverrides}
      layout="auto"
      enableGermanQuotes
      editorId="chapter"
      alwaysShowMarkdownStylingCharacters={false}
      alwaysShowHtmlComments={false}
      showReferencesAsLinks
      className="action-editor-cm-wrap"
      style={editorStyle}
    />
  );
});

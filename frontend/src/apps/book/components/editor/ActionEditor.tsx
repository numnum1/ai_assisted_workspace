import { memo, useMemo, forwardRef } from 'react';
import { UnifiedMarkdownEditor, type MarkdownEditorHandle, type CommentAnchorSpec } from './UnifiedMarkdownEditor';
import type { SelectionContext, AltVersionSession } from '../../../../shared/types.ts';

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
  lineHeight?: number;
  onChange: (content: string) => void;
  onSave: () => void;
  /** Called on Ctrl+L with the selected text and a function to apply a replacement */
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
  /** Called on Ctrl+Alt+A to open the alternative version panel */
  onAltVersion?: (session: AltVersionSession) => void;
  /** When set, shows an inline diff of this action's content against this older revision. */
  diffOriginal?: string | null;
  /** AI comment passages to underline + space out in this action's text. */
  commentAnchors?: CommentAnchorSpec[];
}

const ActionEditorImpl = forwardRef<MarkdownEditorHandle, ActionEditorProps>(function ActionEditorImpl({ actionId, content, colors, fontSize, padding, lineHeight, onChange, onSave, onCtrlL, onAltVersion, diffOriginal = null, commentAnchors }: ActionEditorProps, ref) {
  const readingThemeOverrides = useMemo(() => ({
    fontSize: `${fontSize}px`,
    padding: `16px ${padding}px`,
    ...(lineHeight != null ? { lineHeight: `${lineHeight}` } : {}),
    backgroundColor: colors.bg,
    textColor: colors.text,
    caretColor: colors.caretColor,
    selectionColor: colors.selectionColor,
  }), [fontSize, padding, lineHeight, colors.bg, colors.text, colors.caretColor, colors.selectionColor]);

  const editorStyle = useMemo(() => ({ backgroundColor: colors.bg }), [colors.bg]);

  return (
    <UnifiedMarkdownEditor
      ref={ref}
      instanceKey={actionId}
      content={content}
      onChange={onChange}
      onSave={onSave}
      onCtrlL={onCtrlL}
      onAltVersion={onAltVersion}
      theme="reading"
      readingThemeOverrides={readingThemeOverrides}
      layout="auto"
      enableGermanQuotes
      editorId="chapter"
      alwaysShowMarkdownStylingCharacters={false}
      alwaysShowHtmlComments={false}
      showReferencesAsLinks
      diffOriginal={diffOriginal}
      commentAnchors={commentAnchors}
      className="action-editor-cm-wrap"
      style={editorStyle}
    />
  );
});

/**
 * Compare only the data props. The callback props (onChange/onSave/onCtrlL/onAltVersion)
 * are recreated as fresh inline closures by the parent on every keystroke, but are
 * functionally invariant (their captured ids are constant and the underlying handlers
 * are stable). Ignoring their identity keeps this editor from re-rendering when an
 * *unrelated* action in the same chapter is edited — that defeated memoization was the
 * main cause of typing lag in chapters with many actions.
 */
export const ActionEditor = memo(ActionEditorImpl, (prev, next) =>
  prev.actionId === next.actionId &&
  prev.content === next.content &&
  prev.fontSize === next.fontSize &&
  prev.padding === next.padding &&
  prev.lineHeight === next.lineHeight &&
  prev.colors === next.colors &&
  prev.diffOriginal === next.diffOriginal &&
  prev.commentAnchors === next.commentAnchors,
);

import { EditorView, ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type EditorState } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export interface HideMarksOptions {
  /** Hide *, _, #, ` and ~ syntax marks. Default: true */
  hideMarkdownMarks?: boolean;
  /** Hide <!-- ... --> HTML comments. Default: true */
  hideHtmlComments?: boolean;
  /**
   * When true, do not hide Link/Image marks or URLs for links immediately preceded by `@`
   * (wiki refs `@[label](ref)`). Another extension should style those. Default: false
   */
  skipWikiPrefixedLinks?: boolean;
}

const HIDDEN_MARKS = new Set([
  'EmphasisMark',
  'HeaderMark',
  'CodeMark',
  'StrikethroughMark',
]);

const LINK_MARK_PARENTS = new Set(['Link', 'Image']);

function isWikiPrefixedLink(state: EditorState, linkFrom: number): boolean {
  return linkFrom > 0 && state.doc.sliceString(linkFrom - 1, linkFrom) === '@';
}

function buildMarkDecorations(view: EditorView, options: Required<HideMarksOptions>): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const cursorLine = view.hasFocus
    ? state.doc.lineAt(state.selection.main.head)
    : null;
  const hidden = Decoration.replace({});

  syntaxTree(state).iterate({
    enter(node) {
      if (cursorLine !== null) {
        const nodeLine = state.doc.lineAt(node.from);
        if (nodeLine.number === cursorLine.number) {
          return;
        }
      }

      if (options.hideMarkdownMarks && HIDDEN_MARKS.has(node.name)) {
        builder.add(node.from, node.to, hidden);
        return;
      }

      if (options.hideMarkdownMarks && (node.name === 'LinkMark' || node.name === 'ImageMark')) {
        const parent = node.node.parent;
        if (parent && LINK_MARK_PARENTS.has(parent.name)) {
          if (options.skipWikiPrefixedLinks && parent.name === 'Link' && isWikiPrefixedLink(state, parent.from)) {
            return;
          }
          builder.add(node.from, node.to, hidden);
        }
        return;
      }

      if (options.hideMarkdownMarks && node.name === 'URL') {
        const parent = node.node.parent;
        if (parent && LINK_MARK_PARENTS.has(parent.name)) {
          if (options.skipWikiPrefixedLinks && parent.name === 'Link' && isWikiPrefixedLink(state, parent.from)) {
            return;
          }
          // Extend range to include surrounding parentheses if present
          const before = state.doc.sliceString(node.from - 1, node.from);
          const after = state.doc.sliceString(node.to, node.to + 1);
          const from = before === '(' ? node.from - 1 : node.from;
          const to = after === ')' ? node.to + 1 : node.to;
          builder.add(from, to, hidden);
        }
        return;
      }

      if (options.hideHtmlComments && (node.name === 'CommentBlock' || node.name === 'Comment')) {
        builder.add(node.from, node.to, hidden);
        return false;
      }
    },
  });

  return builder.finish();
}

function createHideMarksPlugin(options: Required<HideMarksOptions>) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildMarkDecorations(view, options);
      }

      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
          this.decorations = buildMarkDecorations(update.view, options);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function hideMarksExtension(options: HideMarksOptions = {}): Extension {
  const resolved: Required<HideMarksOptions> = {
    hideMarkdownMarks: options.hideMarkdownMarks ?? true,
    hideHtmlComments: options.hideHtmlComments ?? true,
    skipWikiPrefixedLinks: options.skipWikiPrefixedLinks ?? false,
  };

  if (!resolved.hideMarkdownMarks && !resolved.hideHtmlComments) {
    return [];
  }

  return createHideMarksPlugin(resolved);
}

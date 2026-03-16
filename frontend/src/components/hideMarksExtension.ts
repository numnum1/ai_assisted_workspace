import { EditorView, ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const HIDDEN_MARKS = new Set([
  'EmphasisMark',
  'HeaderMark',
  'CodeMark',
  'StrikethroughMark',
]);

const LINK_MARK_PARENTS = new Set(['Link', 'Image']);

function buildMarkDecorations(view: EditorView): DecorationSet {
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

      if (HIDDEN_MARKS.has(node.name)) {
        builder.add(node.from, node.to, hidden);
        return;
      }

      // Inside a Link or Image: hide bracket marks and the URL part
      if (node.name === 'LinkMark' || node.name === 'ImageMark') {
        const parent = node.node.parent;
        if (parent && LINK_MARK_PARENTS.has(parent.name)) {
          builder.add(node.from, node.to, hidden);
        }
        return;
      }

      if (node.name === 'URL') {
        const parent = node.node.parent;
        if (parent && LINK_MARK_PARENTS.has(parent.name)) {
          // Extend range to include surrounding parentheses if present
          const before = state.doc.sliceString(node.from - 1, node.from);
          const after = state.doc.sliceString(node.to, node.to + 1);
          const from = before === '(' ? node.from - 1 : node.from;
          const to = after === ')' ? node.to + 1 : node.to;
          builder.add(from, to, hidden);
        }
        return;
      }

      // HTML comments: <!-- ... --> block and inline
      if (node.name === 'CommentBlock' || node.name === 'Comment') {
        builder.add(node.from, node.to, hidden);
        return false;
      }
    },
  });

  return builder.finish();
}

const hideMarksPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildMarkDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
        this.decorations = buildMarkDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function hideMarksExtension(): Extension {
  return hideMarksPlugin;
}

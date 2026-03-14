import { EditorView, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { StateField, RangeSetBuilder } from '@codemirror/state';
import type { Extension, EditorState } from '@codemirror/state';
import type { ViewUpdate, DecorationSet } from '@codemirror/view';

export interface CommentData {
  text: string;
  from: number;
  to: number;
}

export interface CommentPosition {
  text: string;
  top: number;
}

class ZeroWidthWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.style.display = 'none';
    return span;
  }
}

function parseComments(doc: string): CommentData[] {
  const comments: CommentData[] = [];
  const regex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = regex.exec(doc)) !== null) {
    const text = match[1].trim();
    // Scene markers are handled exclusively by sceneMarkerExtension
    if (text.startsWith('@scene:')) continue;
    comments.push({
      text,
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  return comments;
}

export const commentField = StateField.define<CommentData[]>({
  create(state: EditorState) {
    return parseComments(state.doc.toString());
  },
  update(comments, tr) {
    if (tr.docChanged) {
      return parseComments(tr.newDoc.toString());
    }
    return comments;
  },
});

function buildDecorations(view: EditorView): DecorationSet {
  const comments = view.state.field(commentField);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const cursorLine = view.hasFocus
    ? doc.lineAt(view.state.selection.main.head)
    : null;

  for (const comment of comments) {
    let from = comment.from;
    let to = comment.to;

    const startLine = doc.lineAt(from);
    const endLine = doc.lineAt(to);

    // Show comment on any line the cursor is on (single or multi-line)
    const cursorIsInside =
      cursorLine !== null &&
      cursorLine.number >= startLine.number &&
      cursorLine.number <= endLine.number;
    if (cursorIsInside) {
      continue;
    }

    const beforeComment = doc.sliceString(startLine.from, from).trim();
    const afterComment = doc.sliceString(to, endLine.to).trim();

    if (beforeComment === '' && afterComment === '') {
      from = startLine.from;
      to = Math.min(endLine.to + 1, doc.length);
    }

    builder.add(from, to, Decoration.replace({ widget: new ZeroWidthWidget() }));
  }

  return builder.finish();
}

const hideCommentsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function commentPositionReporter(
  callback: (positions: CommentPosition[], contentHeight: number) => void,
): Extension {
  let rafId = 0;
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        this.report(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.geometryChanged) {
          this.report(update.view);
        }
      }
      report(view: EditorView) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const comments = view.state.field(commentField);
          const positions = comments.map((c) => ({
            text: c.text,
            top: view.lineBlockAt(c.from).top,
          }));
          callback(positions, view.contentDOM.offsetHeight);
        });
      }
      destroy() {
        cancelAnimationFrame(rafId);
      }
    },
  );
}

export function createCommentExtension(
  onPositionsChange: (positions: CommentPosition[], contentHeight: number) => void,
): Extension {
  return [
    commentField,
    hideCommentsPlugin,
    commentPositionReporter(onPositionsChange),
  ];
}

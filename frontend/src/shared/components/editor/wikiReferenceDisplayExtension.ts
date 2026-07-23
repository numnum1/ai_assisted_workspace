import { EditorView, ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** `@[display](type/id)` or `@[display](shadow:path)` */
const WIKI_REF_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

const hidden = Decoration.replace({});

const wikiRefLinkMark = Decoration.mark({
  attributes: { class: 'cm-wikiRefLink' },
});

const wikiRefBaseTheme = EditorView.baseTheme({
  '.cm-wikiRefLink': {
    color: '#2a6496',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  '&dark .cm-wikiRefLink': {
    color: '#89b4fa',
  },
});

function buildWikiReferenceDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const state = view.state;
  const cursorLine = view.hasFocus
    ? state.doc.lineAt(state.selection.main.head)
    : null;

  for (let i = 1; i <= state.doc.lines; i++) {
    if (cursorLine !== null && cursorLine.number === i) {
      continue;
    }

    const line = state.doc.line(i);
    const text = line.text;
    const re = new RegExp(WIKI_REF_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = line.from + m.index;
      const atPos = start;
      const bracketOpen = start + 1;
      const displayFrom = start + 2;
      const displayTo = displayFrom + m[1].length;
      const bracketClose = displayTo;
      const parenFrom = bracketClose + 1;
      const matchEnd = start + m[0].length;

      builder.add(atPos, atPos + 1, hidden);
      builder.add(bracketOpen, bracketOpen + 1, hidden);
      builder.add(bracketClose, bracketClose + 1, hidden);
      builder.add(parenFrom, matchEnd, hidden);
      builder.add(displayFrom, displayTo, wikiRefLinkMark);
    }
  }

  return builder.finish();
}

const wikiRefPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildWikiReferenceDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
        this.decorations = buildWikiReferenceDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function wikiReferenceDisplayExtension(): Extension[] {
  return [wikiRefBaseTheme, wikiRefPlugin];
}

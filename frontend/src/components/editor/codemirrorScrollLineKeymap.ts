import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

function applyScrollTop(el: HTMLElement, delta: number): void {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + delta));
}

/** Next ancestor that actually scrolls vertically (ActionEditor uses overflow:visible on .cm-scroller). */
function findScrollableYAncestor(from: HTMLElement): HTMLElement | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') continue;
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    return el;
  }
  return null;
}

function scrollByLine(view: EditorView, dir: -1 | 1): boolean {
  const delta = view.defaultLineHeight * dir;
  const scroller = view.scrollDOM;

  if (scroller.scrollHeight > scroller.clientHeight + 1) {
    applyScrollTop(scroller, delta);
    return true;
  }

  const outer = findScrollableYAncestor(scroller);
  if (outer) {
    applyScrollTop(outer, delta);
    return true;
  }

  return false;
}

/** Ctrl+ArrowUp/Down: scroll one line; selection/cursor unchanged (VS Code–style). */
export const scrollLineWithoutCursorKeymap: Extension = Prec.high(
  keymap.of([
    { key: 'Ctrl-ArrowUp', run: (v) => scrollByLine(v, -1) },
    { key: 'Ctrl-ArrowDown', run: (v) => scrollByLine(v, 1) },
  ]),
);

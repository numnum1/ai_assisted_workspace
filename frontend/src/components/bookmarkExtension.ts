import { Decoration } from '@codemirror/view';
import { ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

const BOOKMARK_KEY = 'reading-bookmark';

export interface Bookmark {
  filePath: string;
  line: number;
}

function storageKey(projectPath: string): string {
  return projectPath || '__default';
}

export function getBookmark(projectPath: string): Bookmark | null {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { [key: string]: Bookmark };
    const b = data[storageKey(projectPath)];
    return b && typeof b.filePath === 'string' && typeof b.line === 'number' && b.line > 0 ? b : null;
  } catch {
    return null;
  }
}

export function getBookmarkLine(projectPath: string, filePath: string): number | null {
  const b = getBookmark(projectPath);
  return b && b.filePath === filePath ? b.line : null;
}

export function setBookmark(projectPath: string, filePath: string, line: number): void {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    const data: { [key: string]: Bookmark } = raw ? (JSON.parse(raw) as { [key: string]: Bookmark }) : {};
    data[storageKey(projectPath)] = { filePath, line };
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(data));
  } catch {
    /* localStorage full */
  }
}

export function removeBookmark(projectPath: string): void {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as { [key: string]: Bookmark };
    delete data[storageKey(projectPath)];
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

const bookmarkLineDecoration = Decoration.line({
  attributes: { class: 'cm-reading-bookmark' },
});

export function createBookmarkExtension(bookmarkLineParam: number | null): Extension {
  const lineNum = bookmarkLineParam != null && bookmarkLineParam >= 1 ? bookmarkLineParam : null;
  if (lineNum == null) return [];

  return ViewPlugin.define(
    (view) => {
      let decorations = Decoration.none;
      try {
        const line = view.state.doc.line(lineNum);
        decorations = Decoration.set([bookmarkLineDecoration.range(line.from)]);
      } catch {
        /* line out of range */
      }
      return {
        decorations,
        update() {
          return false;
        },
      };
    },
    { decorations: (v) => v.decorations }
  );
}

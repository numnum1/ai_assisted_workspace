/** Internal tree move payload (separate from `text/plain` for chat). */
export const FILE_TREE_INTERNAL_DRAG_MIME = 'application/x-markdown-editor-file-tree';

const FILE_TREE_NATIVE_DRAGGING_CLASS = 'file-tree-native-dragging';

function pathTrimSlashes(p: string): string {
  if (p === '.' || p === '') return '.';
  const t = p.replace(/\/+$/, '');
  return t === '' ? '.' : t;
}

export function canDropTreeItemOntoFolder(sourcePath: string, sourceIsDir: boolean, targetParentPath: string): boolean {
  const src = pathTrimSlashes(sourcePath);
  const tgt = pathTrimSlashes(targetParentPath);
  if (src === tgt) return false;
  if (sourceIsDir && (tgt === src || tgt.startsWith(`${src}/`))) return false;
  return true;
}

export function setFileTreeNativeDragCursor(active: boolean): void {
  document.body.classList.toggle(FILE_TREE_NATIVE_DRAGGING_CLASS, active);
}

import { ChapterView } from '../components/ChapterView.tsx';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';

/**
 * Fallback editor: prose chapters use {@link ChapterView}; other editor modes show a placeholder.
 * Used for user-defined workspace modes from AppData that do not register a custom view.
 */
export function DefaultMediaProjectEditor({
  editorMode,
  proseLeafAtScene,
  chapter,
  actionContents,
  scrollTarget,
  hasDirtyActions,
  onActionChange,
  onActionSave,
  onSaveAll,
  onClose,
  onScrollTargetConsumed,
  onEditorFocus,
  onCtrlL,
}: MediaProjectEditorProps) {
  if (editorMode === 'prose') {
    return (
      <ChapterView
        proseLeafAtScene={proseLeafAtScene}
        chapter={chapter}
        actionContents={actionContents}
        scrollTarget={scrollTarget}
        hasDirtyActions={hasDirtyActions}
        onActionChange={onActionChange}
        onActionSave={onActionSave}
        onSaveAll={onSaveAll}
        onClose={onClose}
        onScrollTargetConsumed={onScrollTargetConsumed}
        onEditorFocus={onEditorFocus}
        onCtrlL={onCtrlL}
      />
    );
  }
  return (
    <div className="editor-mode-placeholder editor-empty">
      <p>Kein Editor für diesen Modus</p>
    </div>
  );
}

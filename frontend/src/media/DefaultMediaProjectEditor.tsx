import { ChapterView } from '../components/editor/ChapterView.tsx';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';

/**
 * Fallback editor: prose chapters use {@link ChapterView}; other editor modes show a placeholder.
 * Used for user-defined workspace modes from AppData that do not register a custom view.
 */
export function DefaultMediaProjectEditor({
  editorMode,
  proseLeafAtScene,
  chapter,
  structureRoot,
  bookProjects,
  currentBookProjectPath,
  onSelectBookProject,
  chapterTabs,
  onSelectChapterTab,
  actionContents,
  scrollTarget,
  hasDirtyActions,
  onActionChange,
  onActionSave,
  onSaveAll,
  onScrollTargetConsumed,
  onEditorFocus,
  onCtrlL,
  onAltVersion,
  selection,
  onSelectionChange,
  onSaveChapterMeta,
  onSaveSceneMeta,
  onSaveActionMeta,
  workspaceMetaSchemas,
  onOpenFile,
}: MediaProjectEditorProps) {
  if (editorMode === 'prose') {
    return (
      <ChapterView
        proseLeafAtScene={proseLeafAtScene}
        chapter={chapter}
        structureRoot={structureRoot}
        bookProjects={bookProjects}
        currentBookProjectPath={currentBookProjectPath}
        onSelectBookProject={onSelectBookProject}
        chapterTabs={chapterTabs}
        onSelectChapterTab={onSelectChapterTab}
        actionContents={actionContents}
        scrollTarget={scrollTarget}
        hasDirtyActions={hasDirtyActions}
        onActionChange={onActionChange}
        onActionSave={onActionSave}
        onSaveAll={onSaveAll}
        onScrollTargetConsumed={onScrollTargetConsumed}
        onEditorFocus={onEditorFocus}
        onCtrlL={onCtrlL}
        onAltVersion={onAltVersion}
        selection={selection}
        onSelectionChange={onSelectionChange}
        onSaveChapterMeta={onSaveChapterMeta}
        onSaveSceneMeta={onSaveSceneMeta}
        onSaveActionMeta={onSaveActionMeta}
        workspaceMetaSchemas={workspaceMetaSchemas}
        onOpenFile={onOpenFile}
      />
    );
  }
  return (
    <div className="editor-mode-placeholder editor-empty">
      <p>Kein Editor für diesen Modus</p>
    </div>
  );
}

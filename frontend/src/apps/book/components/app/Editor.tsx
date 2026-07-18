import { memo, useState, type ComponentType } from "react";
import { EditorTabs } from "../editor/EditorTabs.tsx";
import { SearchPanel } from "../editor/SearchPanel.tsx";
import { FieldEditorPanel } from "../editor/FieldEditorPanel.tsx";
import { MetaPanel } from "../meta/MetaPanel.tsx";
import { MarkdownFileEditor } from "../editor/MarkdownFileEditor.tsx";
import { WriterOverlays } from "./WriterOverlays.tsx";
import type { MediaProjectEditorProps } from "../../mediaProjectRegistry.ts";
import type { useFileTabs } from "../../hooks/useFileTabs.ts";
import type { useChapter } from "../../hooks/useChapter.ts";
import type { MetaTypeSchema } from "../../meta/metaSchema.ts";
import type { BookProject } from "../../../../shared/utils/bookProjects.ts";
import type {
  MetaSelection,
  MetaNodeType,
  NodeMeta,
  SelectionContext,
  AltVersionSession,
  LlmPublic,
  UserChapterSelection,
  FocusedField,
  FileDiffView,
} from "../../../../shared/types.ts";

type FileEditorApi = ReturnType<typeof useFileTabs>;
type ChapterApi = ReturnType<typeof useChapter>;

export interface EditorProps {
  fileEditor: FileEditorApi;
  chapter: ChapterApi;
  MediaProjectEditor: ComponentType<MediaProjectEditorProps>;
  proseEditorMode: string;
  proseLeafAtScene: boolean;
  bookProjects: BookProject[];
  onSelectBookProject: (path: string, subprojectType: string | null) => void;
  onSelectChapterTab: (chapterId: string) => void;

  searchOpen: boolean;
  onCloseSearch: () => void;

  selectedMeta: MetaSelection | null;
  focusedField: FocusedField | null;
  showMetaChrome: boolean;
  workspaceMetaSchemas: Record<MetaNodeType, MetaTypeSchema>;
  onSaveMeta: (
    type: MetaNodeType,
    meta: NodeMeta,
    chapterId: string,
    sceneId?: string,
    actionId?: string,
  ) => Promise<void> | void;
  onFieldEditorSave: (value: string) => Promise<void> | void;
  onOpenFieldEditor: (fieldKey: string, fieldLabel: string, value: string) => void;
  onClearMeta: () => void;
  onCloseFieldEditor: () => void;

  fileDiffView: FileDiffView | null;
  setFileDiffView: (view: FileDiffView | null) => void;

  fetchGitState: () => void;
  onCtrlL?: (
    sel: SelectionContext,
    replaceFn: (from: number, to: number, text: string) => void,
  ) => void;
  onAltVersion?: (session: AltVersionSession) => void;

  quickChatOpen: boolean;
  onCloseQuickChat: () => void;
  llms: LlmPublic[];
  webSearchAvailable: boolean;
  disabledToolkits: ReadonlySet<string>;
}

export const Editor = memo(function Editor({
  fileEditor,
  chapter,
  MediaProjectEditor,
  proseEditorMode,
  proseLeafAtScene,
  bookProjects,
  onSelectBookProject,
  onSelectChapterTab,
  searchOpen,
  onCloseSearch,
  selectedMeta,
  focusedField,
  showMetaChrome,
  workspaceMetaSchemas,
  onSaveMeta,
  onFieldEditorSave,
  onOpenFieldEditor,
  onClearMeta,
  onCloseFieldEditor,
  fileDiffView,
  setFileDiffView,
  fetchGitState,
  onCtrlL,
  onAltVersion,
  quickChatOpen,
  onCloseQuickChat,
  llms,
  webSearchAvailable,
  disabledToolkits,
}: EditorProps) {
  const [userChapterSelection, setUserChapterSelection] = useState<UserChapterSelection>(null);
  const [selectionChapterId, setSelectionChapterId] = useState<string | null>(null);
  const activeChapterId = chapter.activeChapter?.id ?? null;
  if (activeChapterId !== selectionChapterId) {
    setSelectionChapterId(activeChapterId);
    setUserChapterSelection(null);
  }

  function renderBody() {
    if (focusedField && showMetaChrome) {
      return (
        <div className="field-editor-center">
          <FieldEditorPanel
            fieldLabel={focusedField.fieldLabel}
            sceneTitle={selectedMeta?.meta.title || undefined}
            value={focusedField.value}
            onSave={onFieldEditorSave}
            onClose={onCloseFieldEditor}
          />
        </div>
      );
    }
    if (selectedMeta && showMetaChrome) {
      return (
        <div className="meta-panel-center">
          <MetaPanel
            selection={selectedMeta}
            metaSchemas={workspaceMetaSchemas}
            onSave={onSaveMeta}
            onClose={onClearMeta}
            expanded={true}
            onFocusField={onOpenFieldEditor}
            onOpenFile={(path) => void fileEditor.openFile(path)}
          />
        </div>
      );
    }
    if (!chapter.activeChapter) {
      return (
        <MarkdownFileEditor
          path={fileEditor.selectedPath}
          content={fileEditor.content}
          dirty={fileEditor.dirty}
          loading={fileEditor.loading}
          error={fileEditor.error}
          onChange={fileEditor.setContent}
          onSave={() => {
            void fileEditor.save();
            fetchGitState();
          }}
          onClearError={fileEditor.clearError}
          onCloseFile={() => {
            setFileDiffView(null);
            fileEditor.closeFile();
          }}
          onCtrlL={onCtrlL}
          onAltVersion={onAltVersion}
          scrollToLine={fileEditor.pendingScroll?.line}
          scrollNonce={fileEditor.pendingScroll?.nonce}
          onScrollHandled={fileEditor.clearPendingScroll}
          diffOriginal={
            fileDiffView && fileDiffView.path === fileEditor.selectedPath
              ? fileDiffView.content
              : null
          }
          diffLabel={fileDiffView?.label}
          onExitDiff={() => setFileDiffView(null)}
        />
      );
    }
    return (
      <MediaProjectEditor
        editorMode={proseEditorMode}
        proseLeafAtScene={proseLeafAtScene}
        chapter={chapter.activeChapter}
        structureRoot={chapter.structureRoot}
        bookProjects={bookProjects}
        currentBookProjectPath={chapter.structureRoot ?? "."}
        onSelectBookProject={onSelectBookProject}
        chapterTabs={chapter.chapters}
        onSelectChapterTab={onSelectChapterTab}
        actionContents={chapter.actionContents}
        scrollTarget={chapter.scrollTarget}
        hasDirtyActions={chapter.hasDirtyActions}
        onActionChange={chapter.updateActionContent}
        onActionSave={chapter.saveAction}
        onSaveAll={() => {
          chapter.saveAllDirty();
          fetchGitState();
        }}
        onClose={chapter.closeChapter}
        onScrollTargetConsumed={chapter.clearScrollTarget}
        onEditorFocus={chapter.updateEditorPosition}
        onCtrlL={onCtrlL}
        onAltVersion={onAltVersion}
        selection={userChapterSelection}
        onSelectionChange={setUserChapterSelection}
        onSaveChapterMeta={chapter.updateChapterMeta}
        onSaveSceneMeta={chapter.updateSceneMeta}
        onSaveActionMeta={chapter.updateActionMeta}
        workspaceMetaSchemas={workspaceMetaSchemas}
      />
    );
  }

  return (
    <div className="center-editor-pane">
      <EditorTabs
        tabs={fileEditor.tabs}
        activeTabPath={fileEditor.activeTabPath}
        onSelectTab={(path) => void fileEditor.openFile(path)}
        onCloseTab={fileEditor.closeTab}
        onCloseOtherTabs={fileEditor.closeOtherTabs}
        onCloseAllTabs={fileEditor.closeAllTabs}
      />
      {searchOpen && (
        <SearchPanel
          onOpenFile={(path, line) => {
            void fileEditor.openFile(path, line);
            onCloseSearch();
          }}
          onClose={onCloseSearch}
        />
      )}
      {renderBody()}
      {chapter.activeChapter && (
        <WriterOverlays
          quickChatOpen={quickChatOpen}
          onCloseQuickChat={onCloseQuickChat}
          llms={llms}
          webSearchAvailable={webSearchAvailable}
          disabledToolkits={disabledToolkits}
        />
      )}
    </div>
  );
});

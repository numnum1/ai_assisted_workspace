import { memo, type ChangeEvent, type RefObject } from "react";
import { CommandPalette } from "../git/CommandPalette.tsx";
import type { CommandAction } from "../git/CommandPalette.tsx";
import { GitCredentialsDialog } from "../git/GitCredentialsDialog.tsx";
import { FileHistoryModal } from "../git/FileHistoryModal.tsx";
import { ProjectSettingsModal } from "../settings/ProjectSettingsModal.tsx";
import { SubprojectTypeDialog } from "../settings/SubprojectTypeDialog.tsx";
import { AppearanceModal } from "../settings/AppearanceModal.tsx";
import { ContentBrowserOverlay } from "../outliner/ContentBrowserOverlay.tsx";
import type { AppPreferences, GitStatus } from "../../types.ts";

export interface AppOverlaysProps {
  paletteOpen: boolean;
  onClosePalette: () => void;
  commandActions: CommandAction[];
  onOpenFolder: (path: string) => Promise<void>;
  onGitRefresh: () => void;
  gitStatus: GitStatus | null;
  onAuthRequired: (retry: () => void) => void;
  onOpenFileDiff: (filePath: string, originalContent: string, label: string) => void;

  contentBrowserOpen: boolean;
  projectPath: string | null;
  onCloseContentBrowser: () => void;
  onSelectFile: (path: string) => void;

  credDialogOpen: boolean;
  onCredSuccess: () => void;
  onCredCancel: () => void;

  settingsOpen: boolean;
  onCloseSettings: () => void;
  onModesChanged: () => void;
  onGeneralConfigSaved: () => void;
  onWorkspacePluginsChanged: () => void;

  subprojectDialog: { path: string; initialType?: string | null } | null;
  onCloseSubproject: () => void;
  onSubprojectSaved: () => void;

  fileHistoryPath: string | null;
  onCloseFileHistory: () => void;

  appearanceOpen: boolean;
  preferences: AppPreferences;
  onUpdatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  onCloseAppearance: () => void;

  importFileInputRef: RefObject<HTMLInputElement | null>;
  onImportChatFile: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const AppOverlays = memo(function AppOverlays({
  paletteOpen,
  onClosePalette,
  commandActions,
  onOpenFolder,
  onGitRefresh,
  gitStatus,
  onAuthRequired,
  onOpenFileDiff,
  contentBrowserOpen,
  projectPath,
  onCloseContentBrowser,
  onSelectFile,
  credDialogOpen,
  onCredSuccess,
  onCredCancel,
  settingsOpen,
  onCloseSettings,
  onModesChanged,
  onGeneralConfigSaved,
  onWorkspacePluginsChanged,
  subprojectDialog,
  onCloseSubproject,
  onSubprojectSaved,
  fileHistoryPath,
  onCloseFileHistory,
  appearanceOpen,
  preferences,
  onUpdatePreferences,
  onCloseAppearance,
  importFileInputRef,
  onImportChatFile,
}: AppOverlaysProps) {
  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onClose={onClosePalette}
        actions={commandActions}
        onOpenFolder={onOpenFolder}
        onGitRefresh={onGitRefresh}
        gitStatus={gitStatus ?? undefined}
        onAuthRequired={onAuthRequired}
        onOpenFileDiff={onOpenFileDiff}
      />

      <ContentBrowserOverlay
        open={contentBrowserOpen}
        projectPath={projectPath}
        onClose={onCloseContentBrowser}
        onSelectFile={onSelectFile}
      />

      {credDialogOpen && (
        <GitCredentialsDialog onSuccess={onCredSuccess} onCancel={onCredCancel} />
      )}

      {settingsOpen && (
        <ProjectSettingsModal
          onClose={onCloseSettings}
          onModesChanged={onModesChanged}
          onGeneralConfigSaved={onGeneralConfigSaved}
          onWorkspacePluginsChanged={onWorkspacePluginsChanged}
        />
      )}

      {subprojectDialog && (
        <SubprojectTypeDialog
          folderPath={subprojectDialog.path}
          initialTypeId={subprojectDialog.initialType}
          onClose={onCloseSubproject}
          onSaved={onSubprojectSaved}
        />
      )}

      {fileHistoryPath && (
        <FileHistoryModal
          filePath={fileHistoryPath}
          onClose={onCloseFileHistory}
          onOpenDiff={onOpenFileDiff}
        />
      )}

      {appearanceOpen && (
        <AppearanceModal
          preferences={preferences}
          onUpdate={onUpdatePreferences}
          onClose={onCloseAppearance}
        />
      )}

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onImportChatFile}
      />
    </>
  );
});

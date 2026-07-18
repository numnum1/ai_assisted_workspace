import { useState, useCallback, useEffect } from "react";
import { gitApi, AuthRequiredError } from "../../../shared/api.ts";
import type { GitStatus, GitSyncStatus } from "../../../shared/types.ts";

export function useGitState(projectPath: string | null, paletteOpen: boolean) {
  const [syncStatus, setSyncStatus] = useState<GitSyncStatus | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null);
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null);

  const showCredentialsDialog = useCallback((retry: () => void) => {
    setPendingRetry(() => retry);
    setCredDialogOpen(true);
  }, []);

  const fetchGitState = useCallback(async () => {
    try {
      const [ahead, status] = await Promise.all([
        gitApi.aheadBehind(),
        gitApi.status(),
      ]);
      setSyncStatus(ahead);
      setGitStatus(status);
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        showCredentialsDialog(fetchGitState);
      }
    }
  }, [showCredentialsDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGitRevert = useCallback(
    async (path: string, isDirectory: boolean) => {
      const label = isDirectory ? `Ordner „${path}"` : `Datei „${path}"`;
      if (
        !window.confirm(
          `Alle Änderungen in ${label} wirklich verwerfen?\nDieser Vorgang kann nicht rückgängig gemacht werden.`,
        )
      ) {
        return;
      }
      try {
        if (isDirectory) {
          await gitApi.revertDirectory(path);
        } else {
          const isUntracked = gitStatus?.untracked?.includes(path) ?? false;
          await gitApi.revertFile(path, isUntracked);
        }
        await fetchGitState();
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : "Revert fehlgeschlagen",
        );
      }
    },
    [gitStatus, fetchGitState],
  );

  useEffect(() => {
    void fetchGitState();
    const interval = setInterval(() => void fetchGitState(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchGitState, projectPath]);

  useEffect(() => {
    if (paletteOpen) void fetchGitState();
  }, [paletteOpen, fetchGitState]);

  return {
    gitStatus,
    syncStatus,
    fetchGitState,
    handleGitRevert,
    credDialogOpen,
    setCredDialogOpen,
    pendingRetry,
    setPendingRetry,
    fileHistoryPath,
    setFileHistoryPath,
    showCredentialsDialog,
  };
}

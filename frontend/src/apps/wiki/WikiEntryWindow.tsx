import { useEffect } from "react";
import { usePreferences } from "../../shared/hooks/usePreferences.ts";
import { useAppearanceCss } from "../../shared/hooks/useAppearanceCss.ts";
import { useFileEditor } from "../../shared/hooks/useFileEditor.ts";
import { MarkdownFileEditor } from "../../shared/components/editor/MarkdownFileEditor.tsx";

function entryPathFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("path");
}

/**
 * Root of a standalone Wiki-Eintrag window (`?window=wikiEntry&path=...`), one
 * per open wiki entry (see `openWindow` in electron/main.ts, keyed by
 * `wikiEntry:<path>`). Bridge/project come from the main-process singleton;
 * `path` is project-relative (e.g. `wiki/charaktere/anna.md`).
 */
export function WikiEntryWindow() {
  const { preferences } = usePreferences();
  useAppearanceCss(preferences);

  const path = entryPathFromLocation();
  const editor = useFileEditor(path);

  useEffect(() => {
    if (path) void editor.openFile(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    document.title = path ? (path.split("/").pop() ?? path) : "Wiki-Eintrag";
  }, [path]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!editor.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editor.dirty]);

  if (!path) {
    return <div style={{ padding: 24 }}>Kein Eintrag angegeben.</div>;
  }

  return (
    <MarkdownFileEditor
      path={editor.selectedPath}
      content={editor.content}
      dirty={editor.dirty}
      loading={editor.loading}
      error={editor.error}
      onChange={editor.setContent}
      onSave={() => void editor.save()}
      onClearError={editor.clearError}
      onCloseFile={() => window.close()}
    />
  );
}

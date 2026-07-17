import { useCallback, useState } from "react";
import type { MetaSelection, MetaNodeType, NodeMeta, FocusedField } from "../types.ts";
import type { useChapter } from "./useChapter.ts";
import { bookApi } from "../api.ts";

export function useMetaSelection(chapter: ReturnType<typeof useChapter>) {
  const [selectedMeta, setSelectedMeta] = useState<MetaSelection | null>(null);
  const [focusedField, setFocusedField] = useState<FocusedField | null>(null);

  const handleSaveMeta = useCallback(
    async (
      type: MetaNodeType,
      meta: NodeMeta,
      chapterId: string,
      sceneId?: string,
      actionId?: string,
    ) => {
      if (type === "book") {
        await bookApi.updateMeta(meta, chapter.structureRoot ?? undefined);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "chapter") {
        await chapter.updateChapterMeta(chapterId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "scene" && sceneId) {
        await chapter.updateSceneMeta(chapterId, sceneId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      } else if (type === "action" && sceneId && actionId) {
        await chapter.updateActionMeta(chapterId, sceneId, actionId, meta);
        setSelectedMeta((prev) => (prev ? { ...prev, meta } : null));
      }
    },
    [chapter],
  );

  const handleApplyFieldUpdate = useCallback(
    async (field: string, value: string) => {
      if (
        !selectedMeta ||
        selectedMeta.type !== "scene" ||
        !selectedMeta.sceneId
      )
        return;
      const curr = selectedMeta.meta;
      const newMeta: NodeMeta =
        field === "title"
          ? { ...curr, title: value }
          : field === "description"
            ? { ...curr, description: value }
            : { ...curr, extras: { ...(curr.extras ?? {}), [field]: value } };
      await handleSaveMeta(
        "scene",
        newMeta,
        selectedMeta.chapterId,
        selectedMeta.sceneId,
      );
      setFocusedField((prev) =>
        prev?.fieldKey === field ? { ...prev, value } : prev,
      );
    },
    [selectedMeta, handleSaveMeta],
  );

  const handleOpenFieldEditor = useCallback(
    (fieldKey: string, fieldLabel: string, value: string) => {
      setFocusedField({ fieldKey, fieldLabel, value });
    },
    [],
  );

  const handleFieldEditorSave = useCallback(
    async (value: string) => {
      if (!focusedField) return;
      await handleApplyFieldUpdate(focusedField.fieldKey, value);
    },
    [focusedField, handleApplyFieldUpdate],
  );

  const handleCloseFieldEditor = useCallback(() => {
    setFocusedField(null);
  }, []);

  const handleClearMeta = useCallback(() => {
    setSelectedMeta(null);
    setFocusedField(null);
  }, []);

  return {
    selectedMeta,
    focusedField,
    handleSaveMeta,
    handleApplyFieldUpdate,
    handleOpenFieldEditor,
    handleFieldEditorSave,
    handleCloseFieldEditor,
    handleClearMeta,
  };
}

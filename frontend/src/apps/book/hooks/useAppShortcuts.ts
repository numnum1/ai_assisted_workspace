import { useCallback, useEffect, useRef, useState } from "react";
import type { AppPreferences } from "../../../shared/types.ts";
import type { useChapter } from "./useChapter.ts";
import { getAppBridge, isRunningInElectron } from "../../../shared/electron/bridge.ts";

interface UseAppShortcutsParams {
  activeChapter: ReturnType<typeof useChapter>["activeChapter"];
  chatFontSizePx: number | undefined;
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
  onTogglePalette: () => void;
  onToggleSearch: () => void;
  onToggleArcs: () => void;
  onToggleStoryboard: () => void;
  onToggleContentBrowser: () => void;
}

export function useAppShortcuts({
  activeChapter,
  chatFontSizePx,
  updatePreferences,
  onTogglePalette,
  onToggleSearch,
  onToggleArcs,
  onToggleStoryboard,
  onToggleContentBrowser,
}: UseAppShortcutsParams) {
  const [quickChatOpen, setQuickChatOpen] = useState(false);

  const chatFontSizePxRef = useRef(chatFontSizePx ?? 14);
  useEffect(() => {
    chatFontSizePxRef.current = chatFontSizePx ?? 14;
  }, [chatFontSizePx]);

  const activeChapterRef = useRef(activeChapter);
  useEffect(() => {
    activeChapterRef.current = activeChapter;
  }, [activeChapter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        return;
      }
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        e.preventDefault();
        onTogglePalette();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        onToggleSearch();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "B") {
        e.preventDefault();
        onToggleArcs();
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        onToggleStoryboard();
      }
      if (e.ctrlKey && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        onToggleContentBrowser();
      }
      if (e.key === "F12" && isRunningInElectron()) {
        e.preventDefault();
        void getAppBridge()?.shell?.openDevTools?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onTogglePalette, onToggleSearch, onToggleArcs, onToggleStoryboard, onToggleContentBrowser]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.code.startsWith("Numpad")) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) return;

      if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        if (activeChapterRef.current) setQuickChatOpen((v) => !v);
        return;
      }

      if ((e.code === "NumpadAdd" || e.code === "Equal") && !e.shiftKey) {
        e.preventDefault();
        updatePreferences({
          appearance: {
            chatFontSizePx: Math.min(22, chatFontSizePxRef.current + 1),
          },
        });
        return;
      }
      if ((e.code === "NumpadSubtract" || e.code === "Minus") && !e.shiftKey) {
        e.preventDefault();
        updatePreferences({
          appearance: {
            chatFontSizePx: Math.max(10, chatFontSizePxRef.current - 1),
          },
        });
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- single global shortcut registration
  }, []);

  useEffect(() => {
    if (!activeChapter) setQuickChatOpen(false);
  }, [activeChapter]);

  const onCloseQuickChat = useCallback(() => {
    setQuickChatOpen(false);
  }, []);

  return { quickChatOpen, onCloseQuickChat };
}

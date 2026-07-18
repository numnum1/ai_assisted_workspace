import { useEffect } from "react";
import type { AppPreferences } from "../types.ts";

export function useAppearanceCss(preferences: AppPreferences) {
  useEffect(() => {
    const a = preferences.appearance;
    if (a.fontFamily) {
      document.documentElement.style.setProperty(
        "--pref-font-family",
        a.fontFamily,
      );
    }
    if (a.chatFontSizePx) {
      document.documentElement.style.setProperty(
        "--pref-chat-font-size",
        `${a.chatFontSizePx}px`,
      );
    }
    document.body.classList.toggle("theme-light", a.theme === "light");
  }, [preferences]);
}

import type { Layout } from "react-resizable-panels";
import { CHAT_TOOLKIT_IDS, type ReasoningEffort } from "../types.ts";

const REASONING_EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

const LLM_PREFS_KEY = "chat-llm-prefs";
const CHAT_DISABLED_TOOLKITS_KEY = "chat-disabled-toolkits";
const CHAT_RULES_ENABLED_KEY = "chat-rules-enabled";
export const MAIN_PANEL_LAYOUT_KEY = "assistant-main-panel-layout";
export const MAIN_PANEL_IDS = [
  "far-left",
  "outliner",
  "editor",
  "chat",
  "far-right",
] as const;

export function loadInitialDisabledToolkits(): Set<string> {
  try {
    const raw = localStorage.getItem(CHAT_DISABLED_TOOLKITS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === "string"));
      }
    }
    if (localStorage.getItem("chat-tools-disabled") === "true") {
      localStorage.removeItem("chat-tools-disabled");
      return new Set(CHAT_TOOLKIT_IDS);
    }
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveDisabledToolkits(s: Set<string>) {
  try {
    localStorage.setItem(CHAT_DISABLED_TOOLKITS_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function loadInitialRulesEnabled(): boolean {
  try {
    const raw = localStorage.getItem(CHAT_RULES_ENABLED_KEY);
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return true;
}

export function saveRulesEnabled(enabled: boolean) {
  try {
    localStorage.setItem(CHAT_RULES_ENABLED_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}

export function loadLlmPrefs(): {
  llmId: string | null;
  useReasoning: boolean;
  reasoningEffort: ReasoningEffort;
} | null {
  try {
    const raw = localStorage.getItem(LLM_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      llmId: string | null;
      useReasoning: boolean;
      useWebSearch?: boolean;
      reasoningEffort?: ReasoningEffort;
    };
    const reasoningEffort = REASONING_EFFORTS.includes(parsed.reasoningEffort as ReasoningEffort)
      ? (parsed.reasoningEffort as ReasoningEffort)
      : "medium";
    return { llmId: parsed.llmId, useReasoning: parsed.useReasoning, reasoningEffort };
  } catch {
    return null;
  }
}

export function saveLlmPrefs(
  llmId: string | undefined,
  useReasoning: boolean,
  reasoningEffort: ReasoningEffort,
) {
  try {
    localStorage.setItem(
      LLM_PREFS_KEY,
      JSON.stringify({ llmId: llmId ?? null, useReasoning, reasoningEffort }),
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadMainPanelLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(MAIN_PANEL_LAYOUT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return undefined;
    const rec = parsed as Record<string, unknown>;
    const layout: Layout = {};
    for (const id of MAIN_PANEL_IDS) {
      const v = rec[id];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        return undefined;
      layout[id] = v;
    }
    const sum = MAIN_PANEL_IDS.reduce((acc, id) => acc + layout[id], 0);
    if (sum < 99 || sum > 101) return undefined;
    return layout;
  } catch {
    return undefined;
  }
}

export function saveMainPanelLayout(layout: Layout) {
  try {
    const payload: Layout = {};
    for (const id of MAIN_PANEL_IDS) {
      const v = layout[id];
      if (typeof v !== "number" || !Number.isFinite(v)) return;
      payload[id] = v;
    }
    localStorage.setItem(MAIN_PANEL_LAYOUT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

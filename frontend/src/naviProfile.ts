import type { NaviState } from "./naviStateMachine.ts";
import type { NaviTip } from "./naviTips.ts";
import type { NaviPersonaConfig } from "./naviPersona.ts";
import type { NaviUseCase } from "./naviUseCases.ts";
import type { NaviTool } from "./naviTools.ts";

/**
 * The built-in, read-only profile. It has no directory on disk — when it is active every
 * loader falls through to the DEFAULT_NAVI_* constants in the source, and every save is
 * rejected (the renderer forks into a fresh profile instead).
 */
export const NAVI_BUILTIN_PROFILE_ID = "marc";
export const NAVI_BUILTIN_PROFILE_NAME = "Marc";

/** Everything a profile owns. The improvement-LLM config is deliberately NOT part of it — it holds an API key and must not travel in a shared export file. */
export interface NaviProfileBundle {
  states: NaviState[];
  tips: NaviTip[];
  persona: NaviPersonaConfig;
  useCases: NaviUseCase[];
  tools: NaviTool[];
}

export interface NaviProfileMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** True only for NAVI_BUILTIN_PROFILE_ID. */
  builtIn?: boolean;
}

export interface NaviProfileIndex {
  activeProfileId: string;
  profiles: NaviProfileMeta[];
}

export const NAVI_PROFILE_FILE_KIND = "navi-profile";
export const NAVI_PROFILE_FILE_VERSION = 1;

/** The on-disk exchange format written by "Exportieren" and accepted by "Importieren". */
export interface NaviProfileFile extends NaviProfileBundle {
  kind: typeof NAVI_PROFILE_FILE_KIND;
  version: typeof NAVI_PROFILE_FILE_VERSION;
  name: string;
}

/** Outcome of a native import/export dialog. `cancelled` means the user dismissed it — no error, nothing to report. */
export interface NaviProfileTransferResult {
  cancelled: boolean;
  profiles?: NaviProfileIndex;
  fileName?: string;
}

export function isBuiltInProfile(id: string): boolean {
  return id === NAVI_BUILTIN_PROFILE_ID;
}

/** Filename-safe slug for the export dialog's suggested name. */
export function slugifyProfileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[c] ?? c)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "profil"
  );
}

/** "Mein Profil" + ["Mein Profil"] → "Mein Profil (2)". Used on import and on fork. */
export function uniqueProfileName(desired: string, taken: string[]): string {
  const base = desired.trim() || "Profil";
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base} (${Date.now()})`;
}

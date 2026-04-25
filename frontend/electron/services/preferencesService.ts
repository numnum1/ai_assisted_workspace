import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AppPreferences, AppearancePreferences } from "../../src/types.js";

const APP_DIR_NAME = ".writing-assistant";
const PREFERENCES_FILE_NAME = "preferences.json";

function getAppDataDir(): string {
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  return path.join(os.homedir(), APP_DIR_NAME);
}

function getPreferencesFilePath(): string {
  return path.join(getAppDataDir(), PREFERENCES_FILE_NAME);
}

async function ensureAppDataDir(): Promise<void> {
  await fs.mkdir(getAppDataDir(), { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

const DEFAULT_APPEARANCE: Required<AppearancePreferences> = {
  fontFamily: "system-ui",
  chatFontSizePx: 14,
  theme: "dark",
};

const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  appearance: { ...DEFAULT_APPEARANCE },
};

function mergeWithDefaults(raw: Partial<AppPreferences>): AppPreferences {
  return {
    version: 1,
    appearance: {
      ...DEFAULT_APPEARANCE,
      ...(raw.appearance ?? {}),
    },
  };
}

export async function getPreferences(): Promise<AppPreferences> {
  const filePath = getPreferencesFilePath();
  try {
    if (!(await pathExists(filePath))) {
      return { ...DEFAULT_PREFERENCES, appearance: { ...DEFAULT_APPEARANCE } };
    }
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.error("[preferencesService] Failed to read preferences:", err);
    return { ...DEFAULT_PREFERENCES, appearance: { ...DEFAULT_APPEARANCE } };
  }
}

export async function patchPreferences(
  patch: Partial<AppPreferences>,
): Promise<AppPreferences> {
  await ensureAppDataDir();
  const current = await getPreferences();
  const updated: AppPreferences = {
    version: 1,
    appearance: {
      ...current.appearance,
      ...(patch.appearance ?? {}),
    },
  };
  await fs.writeFile(
    getPreferencesFilePath(),
    JSON.stringify(updated, null, 2),
    "utf-8",
  );
  return updated;
}

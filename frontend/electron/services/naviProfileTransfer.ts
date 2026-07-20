import * as fs from "fs";
import { dialog, type BrowserWindow } from "electron";
import {
  NAVI_PROFILE_FILE_KIND,
  NAVI_PROFILE_FILE_VERSION,
  slugifyProfileName,
  type NaviProfileFile,
  type NaviProfileIndex,
  type NaviProfileTransferResult,
} from "../../src/naviProfile.js";
import {
  NaviProfileError,
  createNaviProfile,
  getNaviProfileMeta,
  listNaviProfiles,
  loadNaviProfileBundle,
} from "./naviProfileStore.js";
import { validatePersona, validateStates, validateTips } from "./naviStateConfigService.js";
import { validateTools, validateUseCases } from "./naviKnowledgeBase.js";

/** Writes the profile as a self-contained JSON bundle the user can hand to someone else. */
export async function exportNaviProfile(
  id: string,
  win: BrowserWindow | null,
): Promise<NaviProfileTransferResult> {
  const meta = getNaviProfileMeta(id);
  const bundle = loadNaviProfileBundle(id);
  const payload: NaviProfileFile = {
    kind: NAVI_PROFILE_FILE_KIND,
    version: NAVI_PROFILE_FILE_VERSION,
    name: meta.name,
    ...bundle,
  };

  const options = {
    title: "Navi-Profil exportieren",
    defaultPath: `navi-profil-${slugifyProfileName(meta.name)}.json`,
    filters: [{ name: "Navi-Profil", extensions: ["json"] }],
  };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { cancelled: true };

  await fs.promises.writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf-8");
  return { cancelled: false, fileName: result.filePath };
}

/**
 * Reads a bundle written by `exportNaviProfile` and turns it into a new local profile.
 * Every domain goes through the same validators the editor's Save buttons use, so a corrupt
 * or hand-edited file is rejected before anything is written.
 */
export async function importNaviProfile(
  win: BrowserWindow | null,
): Promise<NaviProfileTransferResult> {
  const options = {
    title: "Navi-Profil importieren",
    properties: ["openFile" as const],
    filters: [{ name: "Navi-Profil", extensions: ["json"] }],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

  const filePath = result.filePaths[0];
  let parsed: NaviProfileFile;
  try {
    parsed = JSON.parse(await fs.promises.readFile(filePath, "utf-8")) as NaviProfileFile;
  } catch {
    throw new NaviProfileError("Die Datei enthält kein gültiges JSON.");
  }

  if (parsed?.kind !== NAVI_PROFILE_FILE_KIND) {
    throw new NaviProfileError("Das ist keine Navi-Profildatei.");
  }
  if (parsed.version !== NAVI_PROFILE_FILE_VERSION) {
    throw new NaviProfileError(
      `Diese Profildatei hat Version ${parsed.version}, unterstützt wird nur Version ${NAVI_PROFILE_FILE_VERSION}.`,
    );
  }

  validateStates(parsed.states);
  validateTips(parsed.tips);
  validatePersona(parsed.persona);
  validateUseCases(parsed.useCases);
  validateTools(parsed.tools);

  const profiles = createNaviProfile({
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Importiertes Profil",
    bundle: {
      states: parsed.states,
      tips: parsed.tips,
      persona: parsed.persona,
      useCases: parsed.useCases,
      tools: parsed.tools,
    },
  });
  return { cancelled: false, profiles, fileName: filePath };
}

export function listProfilesForRenderer(): NaviProfileIndex {
  return listNaviProfiles();
}

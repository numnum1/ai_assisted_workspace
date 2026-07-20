import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomUUID } from "node:crypto";
import { DEFAULT_NAVI_STATES } from "../../src/naviStateMachine.js";
import { DEFAULT_NAVI_TIPS } from "../../src/naviTips.js";
import { DEFAULT_NAVI_PERSONA } from "../../src/naviPersona.js";
import { DEFAULT_NAVI_USE_CASES } from "../../src/naviUseCases.js";
import { DEFAULT_NAVI_TOOLS } from "../../src/naviTools.js";
import {
  NAVI_BUILTIN_PROFILE_ID,
  NAVI_BUILTIN_PROFILE_NAME,
  isBuiltInProfile,
  uniqueProfileName,
  type NaviProfileBundle,
  type NaviProfileIndex,
  type NaviProfileMeta,
} from "../../src/naviProfile.js";

const NAVI_DATA_DIR = path.join(os.homedir(), ".writing-assistant", "navi");
const PROFILES_INDEX_FILE = path.join(NAVI_DATA_DIR, "profiles.json");
const PROFILES_DIR = path.join(NAVI_DATA_DIR, "profiles");

export const STATES_FILE_NAME = "states.json";
export const TIPS_FILE_NAME = "tips.json";
export const PERSONA_FILE_NAME = "persona.json";
export const USE_CASES_FILE_NAME = "use-cases.json";
export const TOOLS_FILE_NAME = "tools.json";

/** The five files a profile directory may contain. Absent file ⇒ the coded default applies. */
const PROFILE_FILE_NAMES = [
  STATES_FILE_NAME,
  TIPS_FILE_NAME,
  PERSONA_FILE_NAME,
  USE_CASES_FILE_NAME,
  TOOLS_FILE_NAME,
];

export class NaviProfileError extends Error {}

const BUILTIN_META: NaviProfileMeta = {
  id: NAVI_BUILTIN_PROFILE_ID,
  name: NAVI_BUILTIN_PROFILE_NAME,
  createdAt: "",
  updatedAt: "",
  builtIn: true,
};

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Before profiles existed, the five config files lived directly in `navi/`. If they are still
 * there, move them into a real profile so nobody silently loses their edits — the built-in
 * "Marc" profile must stay pristine.
 */
function migrateLegacyFiles(): NaviProfileIndex {
  const legacy = PROFILE_FILE_NAMES.filter((name) =>
    fs.existsSync(path.join(NAVI_DATA_DIR, name)),
  );

  const index: NaviProfileIndex = {
    activeProfileId: NAVI_BUILTIN_PROFILE_ID,
    profiles: [],
  };

  if (legacy.length > 0) {
    const id = randomUUID();
    const dir = path.join(PROFILES_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const name of legacy) {
      fs.renameSync(path.join(NAVI_DATA_DIR, name), path.join(dir, name));
    }
    index.profiles.push({
      id,
      name: "Eigenes Profil",
      createdAt: now(),
      updatedAt: now(),
    });
    index.activeProfileId = id;
  }

  writeJson(PROFILES_INDEX_FILE, index);
  return index;
}

function readIndex(): NaviProfileIndex {
  const stored = readJson<NaviProfileIndex>(PROFILES_INDEX_FILE);
  if (!stored || !Array.isArray(stored.profiles)) {
    return migrateLegacyFiles();
  }
  // A profile whose directory was deleted by hand must not stay selectable.
  const profiles = stored.profiles.filter(
    (p) => p && typeof p.id === "string" && !isBuiltInProfile(p.id),
  );
  const activeExists =
    isBuiltInProfile(stored.activeProfileId) ||
    profiles.some((p) => p.id === stored.activeProfileId);
  return {
    activeProfileId: activeExists ? stored.activeProfileId : NAVI_BUILTIN_PROFILE_ID,
    profiles,
  };
}

function writeIndex(index: NaviProfileIndex): void {
  writeJson(PROFILES_INDEX_FILE, index);
}

function profileDir(id: string): string {
  return path.join(PROFILES_DIR, id);
}

function requireProfile(index: NaviProfileIndex, id: string): NaviProfileMeta {
  const meta = index.profiles.find((p) => p.id === id);
  if (!meta) throw new NaviProfileError(`Unbekanntes Profil "${id}".`);
  return meta;
}

function touch(index: NaviProfileIndex, id: string): void {
  const meta = index.profiles.find((p) => p.id === id);
  if (meta) {
    meta.updatedAt = now();
    writeIndex(index);
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/** "Marc" first, then the user's own profiles in creation order. */
export function listNaviProfiles(): NaviProfileIndex {
  const index = readIndex();
  return {
    activeProfileId: index.activeProfileId,
    profiles: [BUILTIN_META, ...index.profiles],
  };
}

export function getActiveProfileId(): string {
  return readIndex().activeProfileId;
}

/**
 * Where the active profile stores `fileName`, or `null` when the read-only built-in profile is
 * active — callers then fall through to their DEFAULT_NAVI_* constant.
 */
export function profileFilePath(fileName: string): string | null {
  const activeId = getActiveProfileId();
  if (isBuiltInProfile(activeId)) return null;
  return path.join(profileDir(activeId), fileName);
}

/** Guard for every write path. The built-in profile is the pristine shipped configuration. */
export function assertActiveProfileWritable(): void {
  if (isBuiltInProfile(getActiveProfileId())) {
    throw new NaviProfileError(
      `Das Profil "${NAVI_BUILTIN_PROFILE_NAME}" ist schreibgeschützt. Lege ein eigenes Profil an, um Änderungen zu speichern.`,
    );
  }
}

/** Records that the active profile's content changed, so the dropdown can show a fresh timestamp. */
export function touchActiveProfile(): void {
  const index = readIndex();
  touch(index, index.activeProfileId);
}

export function loadNaviProfileBundle(id: string): NaviProfileBundle {
  if (isBuiltInProfile(id)) {
    return {
      states: DEFAULT_NAVI_STATES,
      tips: DEFAULT_NAVI_TIPS,
      persona: DEFAULT_NAVI_PERSONA,
      useCases: DEFAULT_NAVI_USE_CASES,
      tools: DEFAULT_NAVI_TOOLS,
    };
  }
  const dir = profileDir(id);
  const states = readJson<NaviProfileBundle["states"]>(path.join(dir, STATES_FILE_NAME));
  const tips = readJson<NaviProfileBundle["tips"]>(path.join(dir, TIPS_FILE_NAME));
  const persona = readJson<NaviProfileBundle["persona"]>(path.join(dir, PERSONA_FILE_NAME));
  const useCases = readJson<NaviProfileBundle["useCases"]>(path.join(dir, USE_CASES_FILE_NAME));
  const tools = readJson<NaviProfileBundle["tools"]>(path.join(dir, TOOLS_FILE_NAME));
  return {
    states: Array.isArray(states) && states.length > 0 ? states : DEFAULT_NAVI_STATES,
    tips: Array.isArray(tips) ? tips : DEFAULT_NAVI_TIPS,
    persona: persona && typeof persona.roleIntro === "string" ? persona : DEFAULT_NAVI_PERSONA,
    useCases: Array.isArray(useCases) && useCases.length > 0 ? useCases : DEFAULT_NAVI_USE_CASES,
    tools: Array.isArray(tools) && tools.length > 0 ? tools : DEFAULT_NAVI_TOOLS,
  };
}

function writeBundle(id: string, bundle: NaviProfileBundle): void {
  const dir = profileDir(id);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, STATES_FILE_NAME), bundle.states);
  writeJson(path.join(dir, TIPS_FILE_NAME), bundle.tips);
  writeJson(path.join(dir, PERSONA_FILE_NAME), bundle.persona);
  writeJson(path.join(dir, USE_CASES_FILE_NAME), bundle.useCases);
  writeJson(path.join(dir, TOOLS_FILE_NAME), bundle.tools);
}

/**
 * Creates a profile seeded from `bundle` (or, when omitted, from a copy of `fromId` — which is
 * how the auto-fork off the read-only "Marc" profile works) and makes it active.
 */
export function createNaviProfile(options: {
  name: string;
  fromId?: string;
  bundle?: NaviProfileBundle;
}): NaviProfileIndex {
  const index = readIndex();
  const taken = index.profiles.map((p) => p.name).concat(NAVI_BUILTIN_PROFILE_NAME);
  const name = uniqueProfileName(options.name, taken);
  const bundle = options.bundle ?? loadNaviProfileBundle(options.fromId ?? index.activeProfileId);

  const id = randomUUID();
  writeBundle(id, bundle);
  index.profiles.push({ id, name, createdAt: now(), updatedAt: now() });
  index.activeProfileId = id;
  writeIndex(index);
  return listNaviProfiles();
}

export function renameNaviProfile(id: string, name: string): NaviProfileIndex {
  if (isBuiltInProfile(id)) {
    throw new NaviProfileError(`Das Profil "${NAVI_BUILTIN_PROFILE_NAME}" kann nicht umbenannt werden.`);
  }
  const index = readIndex();
  const meta = requireProfile(index, id);
  const trimmed = name.trim();
  if (!trimmed) throw new NaviProfileError("Der Profilname darf nicht leer sein.");
  const taken = index.profiles
    .filter((p) => p.id !== id)
    .map((p) => p.name)
    .concat(NAVI_BUILTIN_PROFILE_NAME);
  meta.name = uniqueProfileName(trimmed, taken);
  meta.updatedAt = now();
  writeIndex(index);
  return listNaviProfiles();
}

export function deleteNaviProfile(id: string): NaviProfileIndex {
  if (isBuiltInProfile(id)) {
    throw new NaviProfileError(`Das Profil "${NAVI_BUILTIN_PROFILE_NAME}" kann nicht gelöscht werden.`);
  }
  const index = readIndex();
  requireProfile(index, id);
  fs.rmSync(profileDir(id), { recursive: true, force: true });
  index.profiles = index.profiles.filter((p) => p.id !== id);
  if (index.activeProfileId === id) index.activeProfileId = NAVI_BUILTIN_PROFILE_ID;
  writeIndex(index);
  return listNaviProfiles();
}

export function setActiveNaviProfile(id: string): NaviProfileIndex {
  const index = readIndex();
  if (!isBuiltInProfile(id)) requireProfile(index, id);
  index.activeProfileId = id;
  writeIndex(index);
  return listNaviProfiles();
}

export function getNaviProfileMeta(id: string): NaviProfileMeta {
  if (isBuiltInProfile(id)) return BUILTIN_META;
  return requireProfile(readIndex(), id);
}

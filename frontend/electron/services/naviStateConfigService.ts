import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_NAVI_STATES,
  NAVI_INITIAL_STATE_ID,
  type NaviState,
} from "../../src/naviStateMachine.js";
import { DEFAULT_NAVI_TIPS, type NaviTip } from "../../src/naviTips.js";

const NAVI_DATA_DIR = path.join(os.homedir(), ".writing-assistant", "navi");
const STATES_FILE_NAME = "states.json";
const TIPS_FILE_NAME = "tips.json";

async function ensureNaviDataDir(): Promise<void> {
  await fs.mkdir(NAVI_DATA_DIR, { recursive: true });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    if (!(await pathExists(filePath))) return null;
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureNaviDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class NaviConfigValidationError extends Error {}

function validateStates(states: NaviState[]): void {
  if (!Array.isArray(states) || states.length === 0) {
    throw new NaviConfigValidationError("Die State Machine braucht mindestens einen Zustand.");
  }

  const seenIds = new Set<string>();
  for (const state of states) {
    const id = typeof state?.id === "string" ? state.id.trim() : "";
    if (!id) {
      throw new NaviConfigValidationError("Jeder Zustand braucht eine nicht-leere ID.");
    }
    if (seenIds.has(id)) {
      throw new NaviConfigValidationError(`Zustands-ID "${id}" ist mehrfach vergeben.`);
    }
    seenIds.add(id);
  }

  if (!seenIds.has(NAVI_INITIAL_STATE_ID)) {
    throw new NaviConfigValidationError(
      `Der Startzustand "${NAVI_INITIAL_STATE_ID}" muss vorhanden sein.`,
    );
  }

  for (const state of states) {
    const transitions = Array.isArray(state.transitions) ? state.transitions : [];
    for (const t of transitions) {
      if (!seenIds.has(t.to)) {
        throw new NaviConfigValidationError(
          `Übergang in "${state.id}" verweist auf unbekannten Zustand "${t.to}".`,
        );
      }
    }
    const isGatedNarrow = state.persona === "narrow" && Array.isArray(state.workPlan) && state.workPlan.length > 0;
    if (isGatedNarrow && transitions.length === 0) {
      throw new NaviConfigValidationError(
        `"${state.id}" hat eine Checkliste, aber keinen Übergang — der automatische Weiterschritt bräuchte ein Ziel.`,
      );
    }
  }
}

function validateTips(tips: NaviTip[]): void {
  if (!Array.isArray(tips)) {
    throw new NaviConfigValidationError("Die Hinweisliste muss ein Array sein.");
  }
  const seenIds = new Set<string>();
  for (const tip of tips) {
    const id = typeof tip?.id === "string" ? tip.id.trim() : "";
    if (!id) {
      throw new NaviConfigValidationError("Jeder Hinweis braucht eine nicht-leere ID.");
    }
    if (seenIds.has(id)) {
      throw new NaviConfigValidationError(`Hinweis-ID "${id}" ist mehrfach vergeben.`);
    }
    seenIds.add(id);
  }
}

export async function loadNaviStates(): Promise<NaviState[]> {
  const filePath = path.join(NAVI_DATA_DIR, STATES_FILE_NAME);
  const override = await readJsonFile<NaviState[]>(filePath);
  return Array.isArray(override) && override.length > 0 ? override : DEFAULT_NAVI_STATES;
}

export async function saveNaviStates(states: NaviState[]): Promise<NaviState[]> {
  validateStates(states);
  await writeJsonFile(path.join(NAVI_DATA_DIR, STATES_FILE_NAME), states);
  return states;
}

export async function resetNaviStates(): Promise<NaviState[]> {
  const filePath = path.join(NAVI_DATA_DIR, STATES_FILE_NAME);
  try {
    await fs.unlink(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return DEFAULT_NAVI_STATES;
}

export async function loadNaviTips(): Promise<NaviTip[]> {
  const filePath = path.join(NAVI_DATA_DIR, TIPS_FILE_NAME);
  const override = await readJsonFile<NaviTip[]>(filePath);
  return Array.isArray(override) ? override : DEFAULT_NAVI_TIPS;
}

export async function saveNaviTips(tips: NaviTip[]): Promise<NaviTip[]> {
  validateTips(tips);
  await writeJsonFile(path.join(NAVI_DATA_DIR, TIPS_FILE_NAME), tips);
  return tips;
}

export async function resetNaviTips(): Promise<NaviTip[]> {
  const filePath = path.join(NAVI_DATA_DIR, TIPS_FILE_NAME);
  try {
    await fs.unlink(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return DEFAULT_NAVI_TIPS;
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_NAVI_STATES,
  NAVI_INITIAL_STATE_ID,
  type NaviState,
} from "../../src/naviStateMachine.js";
import { DEFAULT_NAVI_TIPS, type NaviTip } from "../../src/naviTips.js";
import { DEFAULT_NAVI_PERSONA, type NaviPersonaConfig } from "../../src/naviPersona.js";
import type {
  NaviImprovementLlmPublic,
  NaviImprovementLlmInput,
} from "../../src/naviImprovement.js";

const NAVI_DATA_DIR = path.join(os.homedir(), ".writing-assistant", "navi");
const STATES_FILE_NAME = "states.json";
const TIPS_FILE_NAME = "tips.json";
const PERSONA_FILE_NAME = "persona.json";
const IMPROVEMENT_LLM_FILE_NAME = "improvement-llm.json";
const SIMULATIONS_DIR_NAME = "simulations";

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

/** Snapshots the current file into NAVI_DATA_DIR/backups before it gets overwritten, so a bad save (human or LLM-proposed) can be recovered by hand. */
async function backupIfExists(filePath: string): Promise<void> {
  if (!(await pathExists(filePath))) return;
  const backupsDir = path.join(NAVI_DATA_DIR, "backups");
  await fs.mkdir(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `${path.basename(filePath)}.${stamp}.bak`);
  await fs.copyFile(filePath, backupPath);
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureNaviDataDir();
  await backupIfExists(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export class NaviConfigValidationError extends Error {}

export function validateStates(states: NaviState[]): void {
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

export function validateTips(tips: NaviTip[]): void {
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

export function validatePersona(persona: NaviPersonaConfig): void {
  if (typeof persona?.roleIntro !== "string" || !persona.roleIntro.trim()) {
    throw new NaviConfigValidationError("Die Rollenbeschreibung (roleIntro) darf nicht leer sein.");
  }
  if (!Array.isArray(persona.fullPersonaRules) || persona.fullPersonaRules.some((r) => typeof r !== "string" || !r.trim())) {
    throw new NaviConfigValidationError("Alle Full-Persona-Regeln müssen nicht-leere Texte sein.");
  }
  if (!Array.isArray(persona.narrowPersonaRules) || persona.narrowPersonaRules.some((r) => typeof r !== "string" || !r.trim())) {
    throw new NaviConfigValidationError("Alle Narrow-Persona-Regeln müssen nicht-leere Texte sein.");
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

export async function loadNaviPersona(): Promise<NaviPersonaConfig> {
  const filePath = path.join(NAVI_DATA_DIR, PERSONA_FILE_NAME);
  const override = await readJsonFile<NaviPersonaConfig>(filePath);
  return override && typeof override.roleIntro === "string" ? override : DEFAULT_NAVI_PERSONA;
}

export async function saveNaviPersona(persona: NaviPersonaConfig): Promise<NaviPersonaConfig> {
  validatePersona(persona);
  await writeJsonFile(path.join(NAVI_DATA_DIR, PERSONA_FILE_NAME), persona);
  return persona;
}

export async function resetNaviPersona(): Promise<NaviPersonaConfig> {
  const filePath = path.join(NAVI_DATA_DIR, PERSONA_FILE_NAME);
  try {
    await fs.unlink(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return DEFAULT_NAVI_PERSONA;
}

interface NaviImprovementLlmRaw {
  apiUrl: string;
  apiKey: string;
  model: string;
}

const EMPTY_IMPROVEMENT_LLM: NaviImprovementLlmRaw = { apiUrl: "", apiKey: "", model: "" };

function toPublicImprovementLlm(raw: NaviImprovementLlmRaw): NaviImprovementLlmPublic {
  return { apiUrl: raw.apiUrl, model: raw.model, apiKeySet: raw.apiKey.trim().length > 0 };
}

/** Main-process-only: includes the raw API key. Used by naviImprovementService to make the actual LLM call. */
export async function loadNaviImprovementLlmRaw(): Promise<NaviImprovementLlmRaw> {
  const filePath = path.join(NAVI_DATA_DIR, IMPROVEMENT_LLM_FILE_NAME);
  const override = await readJsonFile<NaviImprovementLlmRaw>(filePath);
  return override ?? EMPTY_IMPROVEMENT_LLM;
}

export async function loadNaviImprovementLlm(): Promise<NaviImprovementLlmPublic> {
  return toPublicImprovementLlm(await loadNaviImprovementLlmRaw());
}

export async function saveNaviImprovementLlm(
  input: NaviImprovementLlmInput,
): Promise<NaviImprovementLlmPublic> {
  const apiUrl = (input.apiUrl ?? "").trim();
  const model = (input.model ?? "").trim();
  const existing = await loadNaviImprovementLlmRaw();
  const apiKey = input.apiKey !== undefined ? input.apiKey.trim() : existing.apiKey;

  const anySet = !!(apiUrl || model || apiKey);
  const allSet = !!(apiUrl && model && apiKey);
  if (anySet && !allSet) {
    throw new NaviConfigValidationError(
      "Für das Verbesserungs-LLM müssen API-URL, Modell und API-Key entweder alle gesetzt sein oder alle leer bleiben (dann wird das normale Chat-Modell verwendet).",
    );
  }

  const next: NaviImprovementLlmRaw = { apiUrl, apiKey, model };
  await writeJsonFile(path.join(NAVI_DATA_DIR, IMPROVEMENT_LLM_FILE_NAME), next);
  return toPublicImprovementLlm(next);
}

export async function resetNaviImprovementLlm(): Promise<NaviImprovementLlmPublic> {
  const filePath = path.join(NAVI_DATA_DIR, IMPROVEMENT_LLM_FILE_NAME);
  try {
    await fs.unlink(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return toPublicImprovementLlm(EMPTY_IMPROVEMENT_LLM);
}

/** Persisted record of one finished Navi simulation run, for later review/comparison. */
export interface NaviSimulationRunRecord {
  id: string;
  createdAt: string;
  personaId?: string;
  personaName?: string;
  persona: string;
  transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
  finalStateId?: string;
  finalFacts?: unknown;
  score: number;
  report: string;
  llmId?: string | null;
}

/** Writes a finished simulation run to NAVI_DATA_DIR/simulations/<id>.json so runs can be compared later instead of only existing as a transient chat message. */
export async function saveNaviSimulationRun(run: NaviSimulationRunRecord): Promise<void> {
  const dir = path.join(NAVI_DATA_DIR, SIMULATIONS_DIR_NAME);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${run.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
}

export async function listNaviSimulationRuns(): Promise<NaviSimulationRunRecord[]> {
  const dir = path.join(NAVI_DATA_DIR, SIMULATIONS_DIR_NAME);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const runs: NaviSimulationRunRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const record = await readJsonFile<NaviSimulationRunRecord>(path.join(dir, entry));
    if (record) runs.push(record);
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

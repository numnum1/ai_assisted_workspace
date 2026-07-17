import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DEFAULT_NAVI_USE_CASES, type NaviUseCase } from "../../src/naviUseCases.js";
import { DEFAULT_NAVI_TOOLS, naviToolUrl, naviCategoryUrl, type NaviTool } from "../../src/naviTools.js";
import type { NaviState } from "../../src/naviStateMachine.js";

const NAVI_DATA_DIR = path.join(os.homedir(), ".writing-assistant", "navi");
const USE_CASES_FILE_NAME = "use-cases.json";
const TOOLS_FILE_NAME = "tools.json";

export class NaviKnowledgeValidationError extends Error {}

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Snapshots the current file into NAVI_DATA_DIR/backups before it gets overwritten, so a bad save (human or LLM-proposed) can be recovered by hand. */
function backupIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const backupsDir = path.join(NAVI_DATA_DIR, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupsDir, `${path.basename(filePath)}.${stamp}.bak`);
  fs.copyFileSync(filePath, backupPath);
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(NAVI_DATA_DIR, { recursive: true });
  backupIfExists(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function validateUseCases(useCases: NaviUseCase[]): void {
  if (!Array.isArray(useCases) || useCases.length === 0) {
    throw new NaviKnowledgeValidationError("Es muss mindestens ein Use-Case vorhanden sein.");
  }
  const seenNames = new Set<string>();
  for (const uc of useCases) {
    const name = typeof uc?.name === "string" ? uc.name.trim() : "";
    if (!name) throw new NaviKnowledgeValidationError("Jeder Use-Case braucht einen nicht-leeren Namen.");
    if (seenNames.has(name)) throw new NaviKnowledgeValidationError(`Use-Case-Name "${name}" ist mehrfach vergeben.`);
    seenNames.add(name);
    if (!Array.isArray(uc.categories) || uc.categories.length === 0 || uc.categories.some((c) => typeof c !== "string" || !c.trim())) {
      throw new NaviKnowledgeValidationError(`Use-Case "${name}" braucht mindestens eine Kategorie.`);
    }
  }
}

export function validateTools(tools: NaviTool[]): void {
  if (!Array.isArray(tools)) {
    throw new NaviKnowledgeValidationError("Die Tool-Liste muss ein Array sein.");
  }
  for (const tool of tools) {
    if (typeof tool?.name !== "string" || !tool.name.trim()) {
      throw new NaviKnowledgeValidationError("Jedes Tool braucht einen nicht-leeren Namen.");
    }
    if (typeof tool.category !== "string" || !tool.category.trim()) {
      throw new NaviKnowledgeValidationError(`Tool "${tool.name}" braucht eine Kategorie.`);
    }
    if (typeof tool.beschreibung !== "string" || !tool.beschreibung.trim()) {
      throw new NaviKnowledgeValidationError(`Tool "${tool.name}" braucht eine Beschreibung.`);
    }
  }
}

/**
 * Synchronous by design: called from within `buildNaviSystemPrompt`, which is itself
 * synchronous (no await boundary in the prompt-assembly path in `naviChat.ts`). Also the
 * public read API for the `navi:getUseCases`/`navi:getTools` IPC handlers.
 */
export function loadUseCases(): NaviUseCase[] {
  const override = readJsonFile<NaviUseCase[]>(
    path.join(NAVI_DATA_DIR, USE_CASES_FILE_NAME),
  );
  return Array.isArray(override) && override.length > 0
    ? override
    : DEFAULT_NAVI_USE_CASES;
}

export function loadTools(): NaviTool[] {
  const override = readJsonFile<NaviTool[]>(
    path.join(NAVI_DATA_DIR, TOOLS_FILE_NAME),
  );
  return Array.isArray(override) && override.length > 0 ? override : DEFAULT_NAVI_TOOLS;
}

export function saveUseCases(useCases: NaviUseCase[]): NaviUseCase[] {
  validateUseCases(useCases);
  writeJsonFile(path.join(NAVI_DATA_DIR, USE_CASES_FILE_NAME), useCases);
  return useCases;
}

export function resetUseCases(): NaviUseCase[] {
  const filePath = path.join(NAVI_DATA_DIR, USE_CASES_FILE_NAME);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return DEFAULT_NAVI_USE_CASES;
}

export function saveTools(tools: NaviTool[]): NaviTool[] {
  validateTools(tools);
  writeJsonFile(path.join(NAVI_DATA_DIR, TOOLS_FILE_NAME), tools);
  return tools;
}

export function resetTools(): NaviTool[] {
  const filePath = path.join(NAVI_DATA_DIR, TOOLS_FILE_NAME);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already absent — nothing to reset.
  }
  return DEFAULT_NAVI_TOOLS;
}

function buildUseCaseSection(useCases: NaviUseCase[]): string {
  const lines = useCases.map(
    (uc) =>
      `- ${uc.name}: ${uc.description} (Kategorien: ${uc.categories.join(", ")})`,
  );
  return [
    "Bekannte Beratungs-Use-Cases:",
    "Ordne das Problem des Händlers einem dieser Use Cases zu, wenn es sinnvoll passt.",
    "Wenn keiner passt, sag das ehrlich – eine fehlende Zuordnung ist besser als eine erzwungene.",
    ...lines,
  ].join("\n");
}

function buildToolsSection(useCases: NaviUseCase[], tools: NaviTool[]): string {
  const allCategories = new Set(useCases.flatMap((uc) => uc.categories));
  const relevantTools = tools.filter((t) => allCategories.has(t.category));

  const byCategory = new Map<string, NaviTool[]>();
  for (const tool of relevantTools) {
    const list = byCategory.get(tool.category) ?? [];
    list.push(tool);
    byCategory.set(tool.category, list);
  }

  const lines: string[] = ["Verfügbare KI-Tools nach Kategorie (mit Link auf die Tool-Seite):"];
  for (const [cat, catTools] of byCategory) {
    lines.push(`[${cat}] (Kategorie-Übersicht: ${naviCategoryUrl(cat)})`);
    for (const t of catTools) {
      lines.push(`  - ${t.name}: ${t.beschreibung} → Link: ${naviToolUrl(t)}`);
    }
  }
  lines.push(
    "Empfehle nur Tools, die zum genannten Use Case und zum Software-Stack des Händlers passen.",
  );
  lines.push(
    "PFLICHT – Link mitgeben: Sobald du ein konkretes KI-Tool empfiehlst, füge den zugehörigen Link als klickbaren Markdown-Link in deine Antwort ein, z.B. [PostPilot ansehen](https://www.ki-navi.net/post-pilot). Nutze ausschließlich die oben angegebenen Links – erfinde keine eigenen URLs.",
    "Wenn du keinem einzelnen Tool den Vorzug gibst, sondern auf eine ganze Kategorie passender Tools verweist, nutze stattdessen den Kategorie-Link der jeweiligen Kategorie (z.B. [Social-Media-Tools ansehen](" + naviCategoryUrl("social_media") + ")).",
  );
  return lines.join("\n");
}

export function buildNaviKnowledgePrompt(state: NaviState): string {
  if (!state.showUseCases) return "";

  const useCases = loadUseCases();
  const parts: string[] = [buildUseCaseSection(useCases)];

  if (state.showTools) {
    const tools = loadTools();
    parts.push(buildToolsSection(useCases, tools));
  }

  return parts.join("\n\n");
}

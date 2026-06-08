import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { NAVI_USE_CASES, type NaviUseCase } from "../../src/naviUseCases.js";
import { NAVI_TOOLS, naviToolUrl, naviCategoryUrl, type NaviTool } from "../../src/naviTools.js";

const NAVI_DATA_DIR = path.join(os.homedir(), ".writing-assistant", "navi");

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadUseCases(): NaviUseCase[] {
  const override = readJsonFile<NaviUseCase[]>(
    path.join(NAVI_DATA_DIR, "use-cases.json"),
  );
  return Array.isArray(override) && override.length > 0
    ? override
    : NAVI_USE_CASES;
}

function loadTools(): NaviTool[] {
  const override = readJsonFile<NaviTool[]>(
    path.join(NAVI_DATA_DIR, "tools.json"),
  );
  return Array.isArray(override) && override.length > 0 ? override : NAVI_TOOLS;
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

const STATES_WITH_USE_CASES = new Set([
  "assess_situation",
  "give_recommendation",
  "refine_recommendation",
  "explore_ai_solutions",
]);

const STATES_WITH_TOOLS = new Set([
  "give_recommendation",
  "refine_recommendation",
  "explore_ai_solutions",
]);

export function buildNaviKnowledgePrompt(stateId: string): string {
  if (!STATES_WITH_USE_CASES.has(stateId)) return "";

  const useCases = loadUseCases();
  const parts: string[] = [buildUseCaseSection(useCases)];

  if (STATES_WITH_TOOLS.has(stateId)) {
    const tools = loadTools();
    parts.push(buildToolsSection(useCases, tools));
  }

  return parts.join("\n\n");
}

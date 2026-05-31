import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { Persona } from "../../src/types.js";

// Personas are stored globally (shared across all projects), mirroring how
// preferences / AI providers / git credentials are kept in the app data dir.
const APP_DIR_NAME = ".writing-assistant";
const PERSONAS_DIR_NAME = "personas";

function getAppDataDir(): string {
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  return path.join(os.homedir(), APP_DIR_NAME);
}

function getPersonasDir(): string {
  return path.join(getAppDataDir(), PERSONAS_DIR_NAME);
}

/** Slugify a persona name into a safe, stable file id. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "persona"
  );
}

function resolvePersonaPath(id: string): string {
  return path.join(getPersonasDir(), `${slugify(id)}.md`);
}

async function ensurePersonasDir(): Promise<void> {
  await fs.mkdir(getPersonasDir(), { recursive: true });
}

/**
 * Persona file format: a leading `# <Name>` heading followed by the description.
 * The heading is the display name; everything after it is the description body.
 */
function parsePersona(id: string, raw: string): Persona {
  const lines = raw.split(/\r?\n/);
  let name = id;
  let bodyStart = 0;
  const headingIdx = lines.findIndex((l) => /^#\s+/.test(l));
  if (headingIdx !== -1) {
    name = lines[headingIdx].replace(/^#\s+/, "").trim() || id;
    bodyStart = headingIdx + 1;
  }
  const description = lines.slice(bodyStart).join("\n").trim();
  return { id, name, description };
}

function serializePersona(name: string, description: string): string {
  return `# ${name.trim()}\n\n${description.trim()}\n`;
}

export async function listPersonas(): Promise<Persona[]> {
  const dir = getPersonasDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const personas: Persona[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const id = entry.replace(/\.md$/, "");
    try {
      const raw = await fs.readFile(path.join(dir, entry), "utf8");
      personas.push(parsePersona(id, raw));
    } catch {
      continue;
    }
  }
  personas.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return personas;
}

export async function readPersona(
  id: string,
): Promise<{ persona: Persona | null }> {
  try {
    const raw = await fs.readFile(resolvePersonaPath(id), "utf8");
    return { persona: parsePersona(slugify(id), raw) };
  } catch {
    return { persona: null };
  }
}

export async function writePersona(
  name: string,
  description: string,
): Promise<{ persona: Persona }> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Persona name is required");
  await ensurePersonasDir();
  const id = slugify(trimmedName);
  await fs.writeFile(
    resolvePersonaPath(id),
    serializePersona(trimmedName, description),
    "utf8",
  );
  return { persona: { id, name: trimmedName, description: description.trim() } };
}

export async function deletePersona(
  id: string,
): Promise<{ deleted: boolean }> {
  try {
    await fs.unlink(resolvePersonaPath(id));
    return { deleted: true };
  } catch {
    return { deleted: false };
  }
}

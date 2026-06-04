import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  JournalData,
  JournalDay,
  JournalEntry,
  JournalConflict,
} from "../../src/types.js";

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return projectRoot;
}

function getJournalDir(projectRoot: string): string {
  return path.join(projectRoot, ".assistant", "journal");
}

function getJournalFilePath(projectRoot: string, date: string): string {
  return path.join(getJournalDir(projectRoot), `${date}.md`);
}

function getConflictsFilePath(projectRoot: string): string {
  return path.join(getJournalDir(projectRoot), "_conflicts.md");
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Append a timestamped bullet to the daily journal file.
 * Creates the file with a header if it does not exist yet.
 *
 * @param type  KANON | NEU | WIDERSPRUCH | IDEE
 */
export async function appendJournalEntry(
  projectRoot: string | null,
  type: string,
  text: string,
): Promise<string> {
  const root = ensureProjectRoot(projectRoot);
  const date = currentDate();
  const journalPath = getJournalFilePath(root, date);
  const time = currentTime();

  await fs.mkdir(getJournalDir(root), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(journalPath, "utf8");
  } catch {
    // file does not exist yet — add header below
  }

  const header = `# Journal ${date}\n`;
  const bullet = `- [${time}] ${type.toUpperCase()}: ${text}`;

  const next = existing
    ? `${existing.trimEnd()}\n${bullet}\n`
    : `${header}\n${bullet}\n`;

  await fs.writeFile(journalPath, next, "utf8");
  return `journal_log:success:${date}:${type.toUpperCase()}`;
}

/**
 * Append a timestamped conflict note to _conflicts.md.
 * The wiki is never modified — the conflict is only flagged here.
 */
export async function appendConflict(
  projectRoot: string | null,
  description: string,
): Promise<string> {
  const root = ensureProjectRoot(projectRoot);
  const conflictsPath = getConflictsFilePath(root);
  const date = currentDate();
  const time = currentTime();

  await fs.mkdir(getJournalDir(root), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(conflictsPath, "utf8");
  } catch {
    // file does not exist yet
  }

  const header = `# Widersprüche\n`;
  const bullet = `- [${date} ${time}] ${description}`;

  const next = existing
    ? `${existing.trimEnd()}\n${bullet}\n`
    : `${header}\n${bullet}\n`;

  await fs.writeFile(conflictsPath, next, "utf8");
  return `flag_conflict:success:${date}`;
}

const ENTRY_RE = /^-\s*\[(\d{1,2}:\d{2})\]\s*([A-Za-zÄÖÜäöü]+)\s*:\s*(.*)$/;
const CONFLICT_RE = /^-\s*\[([^\]]+)\]\s*(.*)$/;
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Read the project journal into a structured, newest-first form for display.
 * Parses daily files (.assistant/journal/<date>.md) and _conflicts.md.
 * Missing journal directory yields empty data (not an error).
 */
export async function readJournal(
  projectRoot: string | null,
): Promise<JournalData> {
  const root = ensureProjectRoot(projectRoot);
  const journalDir = getJournalDir(root);

  let fileNames: string[];
  try {
    fileNames = await fs.readdir(journalDir);
  } catch {
    return { days: [], conflicts: [] };
  }

  const days: JournalDay[] = [];
  for (const fileName of fileNames) {
    const match = DATE_FILE_RE.exec(fileName);
    if (!match) continue;
    const date = match[1];
    const raw = await fs.readFile(path.join(journalDir, fileName), "utf8");
    const entries: JournalEntry[] = [];
    for (const line of raw.split(/\r\n|\r|\n/)) {
      const m = ENTRY_RE.exec(line.trim());
      if (!m) continue;
      entries.push({ time: m[1], type: m[2].toUpperCase(), text: m[3].trim() });
    }
    if (entries.length > 0) days.push({ date, entries });
  }
  // Newest day first; newest entry first within a day.
  days.sort((a, b) => b.date.localeCompare(a.date));
  for (const day of days) day.entries.reverse();

  const conflicts: JournalConflict[] = [];
  try {
    const raw = await fs.readFile(getConflictsFilePath(root), "utf8");
    for (const line of raw.split(/\r\n|\r|\n/)) {
      const m = CONFLICT_RE.exec(line.trim());
      if (!m) continue;
      conflicts.push({ when: m[1].trim(), text: m[2].trim() });
    }
  } catch {
    // no conflicts file
  }
  conflicts.reverse();

  return { days, conflicts };
}

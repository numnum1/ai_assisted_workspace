import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { EventRecord, EventStatus } from "../../src/shared/types.js";

function ensureProjectRoot(projectRoot: string | null): string {
  if (!projectRoot) {
    throw new Error("No project is currently open.");
  }
  return projectRoot;
}

function getEventsDir(projectRoot: string): string {
  return path.join(projectRoot, "events");
}

function getEventFilePath(projectRoot: string, id: string): string {
  return path.join(getEventsDir(projectRoot), `${id}.md`);
}

function newEventId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Minimal YAML-frontmatter extraction — no external dependency (mirrors wikiService). */
function parseEventFile(content: string): {
  fm: Record<string, string>;
  body: string;
} {
  const stripped =
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const match = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/.exec(
    stripped,
  );
  if (!match) return { fm: {}, body: content.trim() };
  const [, block, rest] = match;
  const fm: Record<string, string> = {};
  for (const line of block.split(/\r\n|\r|\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    fm[kv[1].toLowerCase()] = kv[2].trim();
  }
  return { fm, body: rest.trim() };
}

function serializeEvent(record: EventRecord): string {
  return [
    "---",
    `id: ${record.id}`,
    `title: ${record.title}`,
    `status: ${record.status}`,
    `createdAt: ${record.createdAt}`,
    `updatedAt: ${record.updatedAt}`,
    "---",
    "",
    record.summary,
    "",
  ].join("\n");
}

function toEventRecord(id: string, fm: Record<string, string>, body: string): EventRecord {
  return {
    id,
    title: fm.title ?? "",
    summary: body,
    status: fm.status === "kanon" ? "kanon" : "idee",
    createdAt: fm.createdat ?? "",
    updatedAt: fm.updatedat ?? "",
  };
}

/** List every event, oldest first. A missing `events/` folder yields an empty list. */
export async function listEvents(
  projectRoot: string | null,
): Promise<EventRecord[]> {
  const root = ensureProjectRoot(projectRoot);
  const dir = getEventsDir(root);
  let filenames: string[];
  try {
    filenames = await fs.readdir(dir);
  } catch {
    return [];
  }

  const records: EventRecord[] = [];
  for (const filename of filenames) {
    if (!filename.endsWith(".md")) continue;
    const raw = await fs.readFile(path.join(dir, filename), "utf8");
    const { fm, body } = parseEventFile(raw);
    const id = fm.id ?? filename.slice(0, -3);
    records.push(toEventRecord(id, fm, body));
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return records;
}

export async function createEvent(
  projectRoot: string | null,
  title: string,
  summary: string,
): Promise<EventRecord> {
  const root = ensureProjectRoot(projectRoot);
  const dir = getEventsDir(root);
  await fs.mkdir(dir, { recursive: true });

  const now = new Date().toISOString();
  const record: EventRecord = {
    id: newEventId(),
    title: title.trim() || "Unbenanntes Ereignis",
    summary: summary.trim(),
    status: "idee",
    createdAt: now,
    updatedAt: now,
  };
  await fs.writeFile(
    getEventFilePath(root, record.id),
    serializeEvent(record),
    "utf8",
  );
  return record;
}

export async function updateEvent(
  projectRoot: string | null,
  id: string,
  patch: { title?: string; summary?: string; status?: EventStatus },
): Promise<EventRecord> {
  const root = ensureProjectRoot(projectRoot);
  const filePath = getEventFilePath(root, id);
  const raw = await fs.readFile(filePath, "utf8");
  const { fm, body } = parseEventFile(raw);
  const current = toEventRecord(id, fm, body);

  const record: EventRecord = {
    id,
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    summary: patch.summary !== undefined ? patch.summary.trim() : current.summary,
    status: patch.status ?? current.status,
    createdAt: current.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(filePath, serializeEvent(record), "utf8");
  return record;
}

/**
 * Delete an event's canonical file. Reserved for the standalone Ereignisse
 * window — the app's only place where this is exposed; other workspaces
 * (Storyboard etc.) may only unplace a reference, never call this.
 */
export async function deleteEvent(
  projectRoot: string | null,
  id: string,
): Promise<{ status: string }> {
  const root = ensureProjectRoot(projectRoot);
  await fs.rm(getEventFilePath(root, id), { force: true });
  return { status: "ok" };
}

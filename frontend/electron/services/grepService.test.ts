import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { grepProject, formatGrepResult } from "./grepService.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grep-test-"));

  await fs.mkdir(path.join(root, "wiki", "characters"), { recursive: true });
  await fs.mkdir(path.join(root, "wiki", "locations"), { recursive: true });
  await fs.mkdir(path.join(root, "node_modules", "junk"), { recursive: true });

  await fs.writeFile(
    path.join(root, "wiki", "characters", "wilhelm-von-allstedt.md"),
    [
      "---",
      "id: wilhelm-von-allstedt",
      "type: character",
      "aliases: [Will, Willy]",
      "---",
      "# Wilhelm von Allstedt",
      "Ein Ritter aus dem Norden.",
    ].join("\n"),
    "utf8",
  );

  await fs.writeFile(
    path.join(root, "wiki", "locations", "allstedt.md"),
    ["---", "id: allstedt", "type: location", "---", "# Allstedt"].join("\n"),
    "utf8",
  );

  // A noise file that must be skipped (lives under node_modules).
  await fs.writeFile(
    path.join(root, "node_modules", "junk", "index.md"),
    "aliases: [Will]",
    "utf8",
  );
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("grepProject", () => {
  it("resolves an alias to the defining wiki file (content mode)", async () => {
    const result = await grepProject(root, "\\bWill\\b", {
      glob: "wiki/**/*.md",
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].path).toBe("wiki/characters/wilhelm-von-allstedt.md");
    expect(result.matches[0].line).toBe(4);
    expect(result.matches[0].text).toContain("aliases");
  });

  it("skips node_modules", async () => {
    const result = await grepProject(root, "Will", { outputMode: "files_with_matches" });
    expect(result.files.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("supports files_with_matches mode", async () => {
    const result = await grepProject(root, "type: location", {
      outputMode: "files_with_matches",
    });
    expect(result.files).toEqual(["wiki/locations/allstedt.md"]);
  });

  it("supports count mode", async () => {
    const result = await grepProject(root, "Allstedt", { outputMode: "count" });
    const total = result.counts.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("honors case sensitivity", async () => {
    const sensitive = await grepProject(root, "will", { glob: "wiki/**/*.md" });
    expect(sensitive.matches).toHaveLength(0);
    const insensitive = await grepProject(root, "will", {
      glob: "wiki/**/*.md",
      caseInsensitive: true,
    });
    expect(insensitive.matches.length).toBeGreaterThan(0);
  });

  it("includes context lines", async () => {
    const result = await grepProject(root, "# Wilhelm", {
      glob: "wiki/**/*.md",
      contextLines: 1,
    });
    // match line plus one before and one after
    expect(result.matches.length).toBe(3);
  });

  it("rejects an empty pattern", async () => {
    await expect(grepProject(root, "  ")).rejects.toThrow();
  });

  it("reports invalid regex clearly", async () => {
    await expect(grepProject(root, "[unterminated")).rejects.toThrow(/Invalid regular expression/);
  });

  it("formats content results as path:line: text", () => {
    const formatted = formatGrepResult({
      mode: "content",
      matches: [{ path: "wiki/a.md", line: 4, text: "aliases: [Will]" }],
      files: [],
      counts: [],
      truncated: false,
    });
    expect(formatted).toBe("wiki/a.md:4: aliases: [Will]");
  });
});

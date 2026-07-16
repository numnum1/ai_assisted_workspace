import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { computeArcCoverage } from "./arcService.js";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "arc-test-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

async function writeJson(rel: string, data: unknown): Promise<void> {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(data, null, 2), "utf8");
}

describe("computeArcCoverage", () => {
  it("finds arc mentions nested inside the structure.json manifest", async () => {
    // Manifest: scene extras carry an arcRefs mention (post-migration layout).
    await writeJson(".project/structure.json", {
      version: 1,
      chapters: [
        {
          id: "c1",
          title: "K1",
          description: "",
          scenes: [
            {
              id: "s1",
              title: "S1",
              description: "",
              extras: { arcRefs: "@[Wende](arcpoint:p1) @[Hauptbogen](arc:a1)" },
              actions: [{ id: "a-1", title: "Inhalt", description: "" }],
            },
          ],
        },
      ],
    });

    const coverage = await computeArcCoverage(root);
    expect(coverage.points).toContain("p1");
    expect(coverage.arcs).toContain("a1");
  });

  it("still finds mentions in legacy top-level sidecar extras", async () => {
    await writeJson(".project/chapter/c1/s1.json", {
      title: "S1",
      description: "",
      sortOrder: 0,
      extras: { arcRefs: "@[Wende](arcpoint:legacy-p)" },
    });

    const coverage = await computeArcCoverage(root);
    expect(coverage.points).toContain("legacy-p");
  });
});

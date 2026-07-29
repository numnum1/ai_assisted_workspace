import { describe, expect, it } from "vitest";
import type { ChatRequest } from "../../../src/shared/types.js";
import { buildSystemPrompt, getActiveToolDefinitions } from "./systemPrompt.js";
import type { PreviewBuildContext } from "./projectContext.js";

function makeRequest(disabledToolkits: string[] = []): ChatRequest {
  return {
    message: "Wer ist Mara?",
    mode: "buchentwicklung",
    referencedFiles: [],
    history: [],
    disabledToolkits,
  };
}

const context: PreviewBuildContext = {
  projectPath: "/projekt",
  projectConfig: null,
  wikiIndex: "wiki/characters/mara-voss.md — Mara Voss, Kapitänin",
  chapterIndex: 'Kapitel "Ankunft" — Mara erreicht den Hafen',
};

describe("buildSystemPrompt / wiki toolkit", () => {
  it("mentions the wiki nowhere once the wiki toolkit is off", () => {
    const request = makeRequest(["wiki"]);
    const prompt = buildSystemPrompt(request, context, "");
    const tools = JSON.stringify(getActiveToolDefinitions(request));

    expect(prompt).not.toMatch(/wiki/i);
    expect(tools).not.toMatch(/wiki/i);
  });

  it("keeps the wiki inventory and persistence rules while the toolkit is on", () => {
    const request = makeRequest();
    const prompt = buildSystemPrompt(request, context, "");

    expect(prompt).toContain("WIKI-BESTAND");
    expect(prompt).toContain("mara-voss.md");
    expect(prompt).toContain("Dauerhaftes gehört ins Wiki");
    expect(JSON.stringify(getActiveToolDefinitions(request))).toMatch(/wiki/i);
  });

  it("drops the wiki inventory but keeps the chapter index when the wiki is off", () => {
    const prompt = buildSystemPrompt(makeRequest(["wiki"]), context, "");

    expect(prompt).toContain("BUCHSTRUKTUR");
    expect(prompt).toContain("Ankunft");
    expect(prompt).not.toContain("WIKI-BESTAND");
    expect(prompt).not.toContain("Metafile");
  });

  it("does not instruct file writes when the dateisystem toolkit is off", () => {
    const prompt = buildSystemPrompt(makeRequest(["dateisystem"]), context, "");

    expect(prompt).not.toContain("edit_file");
    expect(prompt).not.toContain("write_file");
    expect(prompt).toContain("Lege keine Dateien an");
  });
});

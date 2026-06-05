import type { ChatRequest } from "../../../src/types.js";
import { getProjectModes } from "../projectConfigService.js";
import { normalizeText, type PreviewBuildContext } from "./projectContext.js";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const TOOLKIT_TOOL_DEFINITIONS: Record<string, ToolDefinition[]> = {
  dateisystem: [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a project file by relative path.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "semantic_search",
        description:
          "Search project files and wiki by meaning, not just exact keywords. " +
          "Finds thematically relevant content even if the exact words differ. " +
          "Use scope='wiki' to limit to wiki files, 'project' for project files only, " +
          "or 'all' (default) to search everything.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            scope: {
              type: "string",
              enum: ["all", "project", "wiki"],
            },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "write_file",
        description:
          "Create or overwrite a file inside the current project (full content). " +
          "For small targeted changes to an existing file, prefer edit_file. " +
          "Works on any path, including wiki/ entries.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "edit_file",
        description:
          "Make a targeted edit to an existing project file by replacing an exact string. " +
          "Safer than write_file for small changes — only touches what you specify. " +
          "'old' must appear EXACTLY ONCE in the file (copy verbatim from read_file output). " +
          "Works on any file, including wiki/ entries.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            old: {
              type: "string",
              description: "Exact string to replace (must be unique in the file).",
            },
            new: { type: "string", description: "Replacement string." },
          },
          required: ["path", "old", "new"],
        },
      },
    },
  ],
  glossary: [
    {
      type: "function",
      function: {
        name: "glossary_add",
        description: "Add a term to the local glossary.",
        parameters: {
          type: "object",
          properties: {
            term: { type: "string" },
            definition: { type: "string" },
          },
          required: ["term", "definition"],
        },
      },
    },
  ],
  chronist: [
    {
      type: "function",
      function: {
        name: "journal_log",
        description:
          "Record a canonical story fact immediately and without asking the user. " +
          "Use type KANON for confirmed decisions, NEU for newly mentioned entities (characters, places, items), " +
          "WIDERSPRUCH for contradictions with existing wiki content, IDEE for speculative ideas that are NOT canon yet. " +
          "Call this proactively whenever a durable fact emerges in the conversation.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["KANON", "NEU", "WIDERSPRUCH", "IDEE"],
              description: "Category of the journal entry.",
            },
            text: {
              type: "string",
              description: "Short, precise description of the fact or entity.",
            },
          },
          required: ["type", "text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "flag_conflict",
        description:
          "Flag a contradiction between a new fact and the existing wiki. " +
          "Writes the conflict to .assistant/journal/_conflicts.md WITHOUT modifying the wiki. " +
          "Always call this instead of silently overwriting canon when facts disagree.",
        parameters: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Clear description of the conflict (what differs and where).",
            },
          },
          required: ["description"],
        },
      },
    },
  ],
  artifacts: [
    {
      type: "function",
      function: {
        name: "create_artifact",
        description:
          "Create a temporary working note that appears as an inline card in the chat. " +
          "Use for structured analysis (character motivations, scene breakdowns, comparisons) " +
          "that is NOT canon and should NOT go to the wiki. " +
          "Lives in the conversation history, not on disk.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short title shown in the card header.",
            },
            content: {
              type: "string",
              description: "Full markdown content of the working note.",
            },
            id: {
              type: "string",
              description: "Optional stable identifier in kebab-case (e.g. 'motivations-shalltear').",
            },
          },
          required: ["title", "content"],
        },
      },
    },
  ],
  assistant: [
    {
      type: "function",
      function: {
        name: "ask_clarification",
        description:
          "Ask the user one or more clarifying questions before proceeding.",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                },
                required: ["question", "options"],
              },
            },
          },
          required: ["questions"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "propose_guided_thread",
        description:
          "Propose a guided follow-up thread with a steering plan for structured work.",
        parameters: {
          type: "object",
          properties: {
            steeringPlanMarkdown: { type: "string" },
            threadTitle: { type: "string" },
            summary: { type: "string" },
            modeId: { type: "string" },
            agentPresetId: { type: "string" },
          },
          required: ["steeringPlanMarkdown"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "report_thread_result",
        description:
          "Report the completed work of this guided subthread back to the parent conversation. " +
          "Call this when all steering plan steps are done. Provide a concise markdown summary of what was accomplished.",
        parameters: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Concise markdown summary of what was accomplished in this subthread.",
            },
            threadTitle: {
              type: "string",
              description: "Display title of this subthread (for the parent's reference).",
            },
            updatedFiles: {
              type: "array",
              items: { type: "string" },
              description: "Relative paths of files created or modified during this subthread.",
            },
          },
          required: ["summary"],
        },
      },
    },
  ],
};

export function getActiveToolDefinitions(
  request: ChatRequest,
): ToolDefinition[] {
  if (request.quickChat) return [];
  const disabled = new Set(
    Array.isArray(request.disabledToolkits)
      ? request.disabledToolkits.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  );
  const isGuided = request.sessionKind === "guided";
  const isGuidedThread = isGuided && request.isThread === true;
  return Object.entries(TOOLKIT_TOOL_DEFINITIONS)
    .filter(([toolkitId]) => !disabled.has(toolkitId))
    .flatMap(([, tools]) => tools)
    .filter(
      (tool) =>
        !(isGuided && tool.function.name === "propose_guided_thread") &&
        !(tool.function.name === "report_thread_result" && !isGuidedThread),
    );
}

export async function resolveModeSystemPrompt(
  projectPath: string | null,
  modeId: string,
): Promise<string> {
  const id = normalizeText(modeId);
  if (!id) return "";
  const modes = await getProjectModes(projectPath);
  const found = modes.find((m) => m.id === id);
  return normalizeText(found?.systemPrompt ?? "");
}

export function buildSystemPrompt(
  request: ChatRequest,
  context: PreviewBuildContext,
  modeSystemPrompt: string,
): string {
  const sections: string[] = [];

  // 1. Core mode instructions
  const modeGuidance = normalizeText(modeSystemPrompt);
  if (modeGuidance) {
    sections.push(modeGuidance);
  } else if (request.quickChat) {
    sections.push(
      "Du bist ein hilfreicher Assistent. Antworte präzise und sachlich.",
    );
  } else {
    sections.push(
      "Du arbeitest in einer lokalen Electron-Anwendung mit bereitgestelltem Projektkontext. Antworte sachlich und hilfreich.",
    );
  }

  // 1b. Working method — baseline persistence behavior, independent of the chosen mode.
  // The mode only personalizes the persona/task framing; HOW the app works (chat is
  // disposable, durable facts go to files) is defined here for every writing session.
  // Skipped for quick chat (ephemeral) and navi (customer-consulting) sessions.
  if (!request.quickChat && request.sessionKind !== "navi") {
    sections.push(
      "ARBEITSWEISE (gilt unabhängig vom gewählten Modus):\n" +
        "- Der Chat ist flüchtig und KEIN Wissensspeicher. Dauerhaftes gehört in Dateien: das Wiki (Markdown unter wiki/) und das Journal.\n" +
        "- Sobald ein dauerhafter Fakt, eine Entscheidung oder eine neue Entität entsteht: sofort journal_log() aufrufen (type KANON oder NEU) — ohne zu fragen.\n" +
        "- Reine Idee/Spekulation: journal_log(type=IDEE) optional, aber NICHT ins Wiki schreiben.\n" +
        "- Widerspruch zu bestehendem Wiki-Inhalt: flag_conflict() aufrufen, das Wiki NICHT überschreiben.\n" +
        "- Sobald ein Thema rund ist: Kanon in die passenden Wiki-Dateien übertragen — edit_file für gezielte Änderungen an bestehenden Einträgen, write_file für neue Einträge/Stubs.\n" +
        "- Wiki-Format: pro Entität eine Markdown-Datei in der passenden Kategorie (z. B. wiki/characters/, wiki/locations/, wiki/organizations/), Dateiname kebab-case. Frontmatter mit id, type, aliases, tags und einer einsätzigen summary. Falls vorhanden, orientiere dich vor dem Anlegen am Format in wiki/<kategorie>/README.md (einmal read_file genügt).\n" +
        "- Analysen oder Zwischenstände, die (noch) kein Kanon sind: create_artifact() — bleibt im Chat, geht NICHT ins Wiki.\n" +
        "- Falls in einer Antwort etwas persistiert wurde, schließe mit einer kurzen Transparenz-Zeile: \"📝 Gesichert: <was>\" — oder \"⚠️ Konflikt: <kurz>\". Wurde nichts persistiert, lass die Zeile weg.",
    );
  }

  // 2. Current date
  sections.push(`Heutiges Datum: ${new Date().toISOString().slice(0, 10)}`);

  // 2b. KI-Regeln (project-level rules, like Cursor rules)
  if (!request.rulesDisabled && !request.quickChat) {
    const rules = (context.projectConfig?.rules ?? []).filter((r) => r?.name);
    if (rules.length > 0) {
      const ruleBlocks = rules.map((r) => `### ${r.name}\n${r.body}`).join("\n\n");
      sections.push(`KI-Regeln:\n\n${ruleBlocks}`);
    }
  }

  // 3. Project context (non-quickChat only)
  if (!request.quickChat) {
    const projectLines: string[] = [];
    if (context.projectPath) {
      projectLines.push(`Projektpfad: ${context.projectPath}`);
    }
    if (context.projectConfig?.name) {
      projectLines.push(`Projektname: ${context.projectConfig.name}`);
    }
    if (context.projectConfig?.description) {
      projectLines.push(`Beschreibung: ${context.projectConfig.description}`);
    }
    if (context.projectConfig?.workspaceMode) {
      projectLines.push(
        `Workspace-Modus: ${context.projectConfig.workspaceMode}`,
      );
    }
    const alwaysInclude = context.projectConfig?.alwaysInclude ?? [];
    if (alwaysInclude.length > 0) {
      projectLines.push(
        `Immer-enthaltene Dateien: ${alwaysInclude.join(", ")}`,
      );
    }
    const mode = normalizeText(request.mode);
    if (mode) {
      projectLines.push(`Aktiver Modus: ${mode}`);
    }
    const referencedFiles = Array.isArray(request.referencedFiles)
      ? request.referencedFiles
          .map((value) => normalizeText(value))
          .filter(Boolean)
      : [];
    if (referencedFiles.length > 0) {
      projectLines.push(`Referenzierte Dateien: ${referencedFiles.join(", ")}`);
    }
    if (projectLines.length > 0) {
      sections.push(projectLines.join("\n"));
    }
  }

  // 4. Active tools
  if (!request.quickChat) {
    const activeTools = getActiveToolDefinitions(request);
    if (activeTools.length > 0) {
      const toolNames = activeTools.map((t) => t.function.name).join(", ");
      sections.push(`Verfügbare Werkzeuge: ${toolNames}`);
    }
  }

  // 4b. yes_no UI hint
  if (!request.quickChat) {
    sections.push(
      "UI-Tipp: Wenn du eine echte Ja/Nein-Frage stellst, gib zusätzlich einen ```yes_no-Block aus — " +
      "die App rendert daraus zwei Schaltflächen (Ja / Nein).\n" +
      "Format:\n" +
      "```yes_no\n" +
      "{\"question\": \"<deine Frage>\"}\n" +
      "```\n" +
      "Verwende diesen Block NUR bei echten Ja/Nein-Entscheidungen, nicht bei Fragen mit mehr als zwei sinnvollen Antworten.",
    );
  }

  // 5. Guided session & steering plan
  if (request.sessionKind === "guided") {
    const guidedLines = [
      "Sitzungstyp: Geführte Sitzung (guided). Führe den Nutzer aktiv durch die Aufgabe und halte dich an den Steuerungsplan.",
      "Wichtig: Du befindest dich bereits in einer geführten Sitzung. Fange sofort an zu arbeiten – stelle keine Rückfragen und biete keinen neuen Thread an. Handle direkt.",
    ];
    if (request.isThread) {
      guidedLines.push(
        "Du befindest dich in einem **Subthread**. Wenn alle Schritte des Steuerungsplans abgeschlossen sind, " +
        "rufe das Werkzeug `report_thread_result` auf, um das Ergebnis an den übergeordneten Chat zu übermitteln. " +
        "Gib im `summary`-Feld eine präzise Markdown-Zusammenfassung aller durchgeführten Arbeiten an.",
      );
    }
    const steeringPlan = normalizeText(request.steeringPlan ?? "");
    if (steeringPlan) {
      guidedLines.push(`Steuerungsplan:\n${steeringPlan}`);
    }
    sections.push(guidedLines.join("\n"));
  }

  // 6. Reasoning hint
  if (request.useReasoning) {
    sections.push(
      "Reasoning ist aktiviert. Denke Schritt für Schritt nach, bevor du antwortest.",
    );
  }

  // 7. Simulation context
  if (request.simulationConfig) {
    const sim = request.simulationConfig;
    const lines: string[] = ["Simulations-Umgebung:"];
    lines.push(`Ziel: ${sim.goal}`);
    if (sim.baseFileLabel || sim.baseFilePath) {
      lines.push(`Basis: ${sim.baseFileLabel ?? sim.baseFilePath}`);
    }
    if (sim.characters.length > 0) {
      const confirmed = sim.characters.filter((c) => c.wikiPath);
      const wip = sim.characters.filter((c) => !c.wikiPath);
      const charLines: string[] = [];
      if (confirmed.length > 0) {
        charLines.push("Bestätigte Charaktere:");
        confirmed.forEach((c) => charLines.push(`- ${c.name} (${c.wikiPath})`));
      }
      if (wip.length > 0) {
        charLines.push("Mögliche / in Bearbeitung:");
        wip.forEach((c) => charLines.push(`- ${c.name} (noch kein Wiki-Eintrag)`));
      }
      lines.push(`Charaktere in dieser Umgebung:\n${charLines.join("\n")}`);
      lines.push(
        "Du kannst diese Charaktere befragen, indem du ihre Perspektive und Motivation aus ihren Wiki-Einträgen ableitest. " +
        "Nutze read_file um den vollständigen Eintrag (Pfad wiki/…) zu lesen, wenn nötig. " +
        "Charaktere ohne Wiki-Eintrag sind noch in Entwicklung — behandle sie explorativ.",
      );
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

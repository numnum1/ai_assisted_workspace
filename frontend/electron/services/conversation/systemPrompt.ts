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
        description: "Write a file inside the current project.",
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
  ],
  wiki: [
    {
      type: "function",
      function: {
        name: "wiki_read",
        description: "Read a wiki markdown file by relative path inside wiki/.",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
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
  ],
};

export function getActiveToolDefinitions(request: ChatRequest): ToolDefinition[] {
  if (request.quickChat) return [];
  const disabled = new Set(
    Array.isArray(request.disabledToolkits)
      ? request.disabledToolkits.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  );
  return Object.entries(TOOLKIT_TOOL_DEFINITIONS)
    .filter(([toolkitId]) => !disabled.has(toolkitId))
    .flatMap(([, tools]) => tools);
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

  // 2. Current date
  sections.push(`Heutiges Datum: ${new Date().toISOString().slice(0, 10)}`);

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

  // 5. Guided session & steering plan
  if (request.sessionKind === "guided") {
    const guidedLines = [
      "Sitzungstyp: Geführte Sitzung (guided). Führe den Nutzer aktiv durch die Aufgabe und halte dich an den Steuerungsplan.",
    ];
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

  return sections.join("\n\n");
}

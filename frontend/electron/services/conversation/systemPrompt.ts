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
        description:
          "Read a project file by relative path. " +
          "Optionally pass offset (1-based start line) and limit (number of lines) " +
          "to read only a slice — e.g. after grep reports a hit at a specific line.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            offset: {
              type: "number",
              description: "1-based line number to start reading from.",
            },
            limit: {
              type: "number",
              description: "Maximum number of lines to read from offset.",
            },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "grep",
        description:
          "Exact regular-expression search across project files. Returns WHERE a " +
          "pattern occurs (path:line: text), not whole files — then use read_file " +
          "with offset/limit to read just that slice. " +
          "Deterministic and exact: the right tool for resolving a name or alias to " +
          "the wiki file that defines it (e.g. grep '\\\\bWill\\\\b' in wiki/), where " +
          "semantic_search would be unreliable. " +
          "output_mode 'files_with_matches' (default-ish) lists matching files, " +
          "'content' lists matching lines, 'count' lists match counts per file. " +
          "Use glob to restrict files (e.g. 'wiki/**/*.md' or '*.md').",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Regular expression to search for.",
            },
            glob: {
              type: "string",
              description:
                "Optional path glob filter, e.g. '*.md' or 'wiki/**/*.md'. A pattern without '/' matches the file name in any directory.",
            },
            output_mode: {
              type: "string",
              enum: ["content", "files_with_matches", "count"],
              description:
                "content = matching lines, files_with_matches = file paths, count = matches per file. Defaults to content.",
            },
            case_insensitive: {
              type: "boolean",
              description: "Match case-insensitively. Defaults to false.",
            },
            context_lines: {
              type: "number",
              description: "Lines of context before and after each match (content mode), 0–10.",
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return.",
            },
          },
          required: ["pattern"],
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
  assistant: [
    {
      type: "function",
      function: {
        name: "ask_clarification",
        description:
          "Ask the user one or more clarifying questions before proceeding. " +
          "Set allow_multiple: true on a question to let the user select multiple options at once (e.g. 'which of these do you use?' where several may apply).",
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
                  allow_multiple: {
                    type: "boolean",
                    description:
                      "If true, the user may select multiple options. Use when several answers can apply simultaneously (e.g. which channels does the user use).",
                  },
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
        name: "ask_yes_no",
        description:
          "MANDATORY: Call this tool whenever you want to ask the user any yes/no question. " +
          "NEVER ask a yes/no question as plain text — ALWAYS use this tool instead. " +
          "The app renders two buttons (Ja / Nein) for the user to click. " +
          "Only use this for decisions with exactly two options (yes or no). " +
          "For questions with more than two options, use ask_clarification instead.",
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The yes/no question to display to the user.",
            },
          },
          required: ["question"],
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

  // 1b. Language — always respond in German regardless of the LLM's training defaults.
  sections.push("Antworte immer auf Deutsch, unabhängig von der Sprache dieser Anweisung oder des Nutzers.");

  // 1c. Working method — baseline persistence behavior, independent of the chosen mode.
  // The mode only personalizes the persona/task framing; HOW the app works (chat is
  // disposable, durable facts go to files) is defined here for every writing session.
  // Skipped for quick chat (ephemeral) sessions.
  if (!request.quickChat) {
    sections.push(
      "ARBEITSWEISE (gilt unabhängig vom gewählten Modus):\n" +
        "- Der Chat ist flüchtig und KEIN Wissensspeicher. Dauerhaftes gehört ins Wiki (Markdown unter wiki/).\n" +
        "- Sobald ein dauerhafter Fakt, eine Entscheidung oder eine neue Entität entsteht: sofort ins Wiki schreiben — ohne zu fragen. edit_file für gezielte Änderungen an bestehenden Einträgen, write_file für neue Einträge/Stubs.\n" +
        "- Bevor du anlegst oder änderst: mit grep/semantic_search prüfen, ob die Entität (auch unter einem Alias) schon existiert — keine Dubletten. Bei Bedarf den bestehenden Eintrag mit edit_file ergänzen.\n" +
        "- Wiki-Format: pro Entität eine Markdown-Datei in der passenden Kategorie (z. B. wiki/characters/, wiki/locations/, wiki/organizations/), Dateiname kebab-case. Frontmatter mit id, type, aliases, tags und einer einsätzigen summary. Aliase/Spitznamen gehören in das aliases-Feld (so sind sie per grep auflösbar). Falls vorhanden, orientiere dich vor dem Anlegen am Format in wiki/<kategorie>/README.md (einmal read_file genügt).\n" +
        "- Reine Idee/Spekulation, die noch nicht Kanon ist: NICHT ins Wiki schreiben.\n" +
        "- Analysen oder Zwischenstände, die (noch) kein Kanon sind: einfach im Chat als Prosa beantworten — NICHT ins Wiki schreiben und keine Datei anlegen.\n" +
        "- Falls in einer Antwort etwas ins Wiki geschrieben wurde, schließe mit einer kurzen Transparenz-Zeile: \"📝 Gesichert: <was>\". Wurde nichts geschrieben, lass die Zeile weg.",
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

  // 3b. Wiki inventory — the structural overview that lets the AI work like a
  // coding agent: it sees what already exists before creating or editing, so it
  // avoids duplicates and notices contradictions instead of forking canon.
  if (!request.quickChat) {
    const wikiIndex = normalizeText(context.wikiIndex ?? "");
    if (wikiIndex) {
      sections.push(
        "WIKI-BESTAND (bereits vorhandene Einträge — verschaffe dir hiermit einen Überblick, BEVOR du anlegst oder änderst):\n" +
          wikiIndex +
          "\n\nLege KEINE Dublette an, wenn ein Eintrag (auch unter einem Alias) bereits existiert — bearbeite stattdessen den bestehenden mit edit_file. " +
          "Diese Liste ist nur eine Übersicht; für den vollständigen Inhalt eines Eintrags read_file nutzen.",
      );
    }
  }

  // 3c. Book chapter index — maps chapter/scene titles to the exact UUID-based file paths.
  // Without this the AI can only find .json metadata but not the .md prose content.
  if (!request.quickChat) {
    const chapterIndex = normalizeText(context.chapterIndex ?? "");
    if (chapterIndex) {
      sections.push(
        "BUCHSTRUKTUR (Kapitel und Szenen mit Inhaltspfaden für read_file):\n" +
          chapterIndex +
          "\n\nDer Text nach '—' ist die hinterlegte Beschreibung/Absicht des Abschnitts — nutze sie, " +
          "um den Inhalt einzuordnen, ohne die Prosa lesen zu müssen. " +
          "Eine '↳ Metafile'-Zeile verweist auf einen ausführlicheren, verlinkten Wiki-Eintrag zu diesem " +
          "Abschnitt (Absicht, Notizen); lies ihn bei Bedarf mit read_file und pflege ihn mit edit_file/write_file. " +
          "Um den Prosa-Inhalt einer Szene zu lesen: read_file mit dem angegebenen Pfad aufrufen. " +
          "Leere Szenen ('(leer)') enthalten noch keinen Text.",
      );
    }
  }

  // 4. Active tools
  if (!request.quickChat) {
    const activeTools = getActiveToolDefinitions(request);
    if (activeTools.length > 0) {
      const toolNames = activeTools.map((t) => t.function.name).join(", ");
      const hasYesNo = activeTools.some((t) => t.function.name === "ask_yes_no");
      const hasAskClarification = activeTools.some((t) => t.function.name === "ask_clarification");
      const lines = [`Verfügbare Werkzeuge: ${toolNames}`];
      if (hasYesNo || hasAskClarification) {
        lines.push(
          "REGEL – Rückfragen:\n" +
          (hasYesNo
            ? "- Ja/Nein-Fragen: IMMER ask_yes_no() aufrufen, NIE als Fließtext stellen.\n"
            : "") +
          (hasAskClarification
            ? "- Mehrfach-Auswahlentscheidungen: ask_clarification() mit passenden Optionen aufrufen.\n"
            : "") +
          "- Rückfragen niemals als reinen Text formulieren, wenn ein passendes Tool vorhanden ist.",
        );
      }
      sections.push(lines.join("\n"));
    }
  }

  // 5. Reasoning hint
  if (request.useReasoning) {
    sections.push(
      "Reasoning ist aktiviert. Denke Schritt für Schritt nach, bevor du antwortest.",
    );
  }

  return sections.join("\n\n");
}

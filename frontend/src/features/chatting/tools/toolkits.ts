import type { Toolkit, ToolkitId } from "./toolkit";
import { FolderOpen, Book, CircleHelp } from 'lucide-react';

export function findToolkitById(id: ToolkitId): Toolkit | null {
  return TOOLKITS.find((toolkit) => toolkit.id === id) || null;
}

export const TOOLKITS: Toolkit[] = [
  {
    id: "filesystem",
    label: "Dateisystem",
    icon: FolderOpen,
    tools: [
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
  },
  {
    id: "wiki",
    label: "Wiki",
    icon: Book,
    tools: [
      {
        type: "function",
        function: {
          name: "wiki_read",
          description:
            "Read a wiki markdown file by relative path inside wiki/.",
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
          },
        },
      },
    ],
  },
  {
    id: "glossary",
    label: "Glossar",
    icon: Book,
    tools: [
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
  },
  {
    id: "multipleChoice",
    label: "Multiple Choice",
    icon: CircleHelp,
    tools: [
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
  },
];

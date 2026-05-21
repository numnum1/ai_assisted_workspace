import type { LLMVersion } from "../project/project-types";
import type { ToolkitId } from "../tools/toolkit";
import type { Chat } from "./Chat";

export type ChatViewModel = {
  streaming: boolean;
  send: () => void;
  cancel: () => void;
  setUseReasoning: (newUseReasoning: boolean) => void;
  enableToolById: (id: ToolkitId) => void;
  disableToolById: (id: ToolkitId) => void;
  rename: (newName: string) => void;
  selectMode: (newSelectedModeId: string) => void;
  selectLLM: (newSelectedLLM: string) => void;
  context: ChatContext;
  selectedLLMVersion: LLMVersion | null;
  // Conversation Utils
  fork: (turnIndex: number) => void;
  cut: (turnIndex: number) => void;
  deleteTurn: (turnIndex: number) => void;
  startNewThread: (turnIndex: number) => void;
  summarizeFromTurn: (turnIndex: number) => void;
} & Omit<Chat, "userMessage">;

// TODO: Add other stuff or rework when needed
export type FileInContext = {
  path: string;
  useReference: boolean;
  length: number;
};

export type ChatContext = {
  estimatedTokens: number;
  maxTokens: number | null;
  percent: number | null;
  includedFiles: FileInContext[];
  systemPrompt: string;
};

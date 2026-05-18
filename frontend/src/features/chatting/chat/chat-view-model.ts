import type { Chat } from "./Chat";

export type ChatViewModel = {
  streaming: boolean;
  send: () => void;
  cancel: () => void;
  setUserMessage: (newUserMessage: string) => void;
  setUseReasoning: (newUseReasoning: boolean) => void;
  enableToolById: (id: string) => void;
  disableToolById: (id: string) => void;
  rename: (newName: string) => void;
  selectMode: (newSelectedModeId: string) => void;
  selectLLM: (newSelectedLLM: string) => void;
  context: ChatContext;
} & Chat;


// TODO: Add other stuff or rework when needed
export type FileInContext = {
  path: string;
  useReference: boolean;
  length: number;
}

export type ChatContext = {
  estimatedTokens: number;
  maxTokens: number | null;
  percent: number | null;
  includedFiles: FileInContext[];
  systemPrompt: string;
}
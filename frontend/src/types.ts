export interface FileNode {
  name: string;
  path: string;
  directory: boolean;
  children: FileNode[] | null;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  autoIncludes: string[];
  color: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  modeColor?: string;
}

export interface ChatRequest {
  message: string;
  activeFile: string | null;
  mode: string;
  referencedFiles: string[];
  history: ChatMessage[];
}

export interface ContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
}

export interface GitStatus {
  isRepo: boolean;
  added?: string[];
  modified?: string[];
  removed?: string[];
  untracked?: string[];
  changed?: string[];
  isClean?: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

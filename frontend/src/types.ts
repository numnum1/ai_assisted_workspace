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
  missing?: string[];
  isClean?: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitSyncStatus {
  ahead: number;
  behind: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  mode: string;
}

export interface ProjectConfig {
  name: string;
  description: string;
  alwaysInclude: string[];
  globalRules: string[];
  features: string[];
}

export interface WikiEntry {
  path: string;
  name: string;
  type: string | null;
  summary: string | null;
  aliases: string | null;
  tags: string | null;
}

export interface PlanningNode {
  path: string;
  type: string | null;
  title: string | null;
  status: string | null;
  source: string | null;
  children: PlanningNode[];
}
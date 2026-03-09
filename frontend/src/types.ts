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
}

// ─── Type Definition System ────────────────────────────────────────────────

export interface TypeField {
  key: string;
  label: string;
  type: 'text' | 'longtext';
  hint?: string;
}

export interface TypeSection {
  key: string;
  label: string;
  repeatable: boolean;
  fields: TypeField[];
}

export interface TypeDefinition {
  id: string;
  name: string;
  fileExtension: string;
  fields: TypeField[];
  sections: TypeSection[];
}

// ─── Outliner ─────────────────────────────────────────────────────────────

export interface OutlinerScene {
  path: string;
  name: string;
  hasText: boolean;
  hasMetadata: boolean;
  textPath: string;
  metaPath: string;
  summary?: string;
}

export interface OutlinerChapter {
  path: string;
  name: string;
  hasMetadata: boolean;
  metaPath: string;
  summary?: string;
  scenes: OutlinerScene[];
}

export interface OutlinerTree {
  chapters: OutlinerChapter[];
}
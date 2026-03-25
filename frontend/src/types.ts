export interface FileNode {
  name: string;
  path: string;
  directory: boolean;
  children: FileNode[] | null;
  /** Workspace mode id from `.subproject.json` when this directory is a subproject */
  subprojectType?: string | null;
  /** True if a shadow meta-note file exists under `.wiki/files/` for this file */
  hasShadow?: boolean;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  autoIncludes: string[];
  color: string;
  rules?: string[];
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
  /** Mode id; empty means client uses review or first available mode */
  defaultMode?: string;
  /** Built-in workspace mode: book, game, music (classpath workspace-modes) */
  workspaceMode?: string;
}

/** Persisted browser tab: folder + display metadata */
export interface WorkspaceEntry {
  id: string;
  path: string;
  name: string;
  /** Mirrors last known project workspaceMode (book, game, music) */
  mode: string;
}

export interface WorkspaceLevelConfig {
  key: string;
  label: string;
  labelNew: string;
  icon: string;
}

export interface WorkspaceMetaFieldDef {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  defaultValue: string;
  options?: string[];
}

export interface WorkspaceMetaTypeSchema {
  filename: string;
  fields: WorkspaceMetaFieldDef[];
}

/** API: GET /api/project-config/workspace-mode */
export interface WorkspaceModeSchema {
  id: string;
  name: string;
  /** 'prose' | 'standard' | 'none' | future modes */
  editorMode: string;
  rootMetaLabel: string;
  rootMetaIcon?: string;
  levels: WorkspaceLevelConfig[];
  metaSchemas: Record<string, WorkspaceMetaTypeSchema>;
}

/** Entry from GET /project-config/workspace-modes (built-in + user AppData plugins). */
export interface WorkspaceModeInfo {
  id: string;
  name: string;
  source: 'builtin' | 'user';
}

/** Resolved labels/icons for the three structure levels + root meta button */
export interface OutlinerLevelConfig {
  chapter: { label: string; labelNew: string; icon: string };
  scene: { label: string; labelNew: string; icon: string };
  action: { label: string; labelNew: string; icon: string };
  rootMetaLabel: string;
  rootMetaIcon: string;
}

export interface NodeMeta {
  title: string;
  description: string;
  sortOrder: number;
  extras?: Record<string, string>;
}

export interface ChapterSummary {
  id: string;
  meta: NodeMeta;
}

export interface ActionNode {
  id: string;
  meta: NodeMeta;
}

export interface SceneNode {
  id: string;
  meta: NodeMeta;
  actions: ActionNode[];
}

export interface ChapterNode {
  id: string;
  meta: NodeMeta;
  scenes: SceneNode[];
}

export interface ScrollTarget {
  sceneId?: string;
  actionId?: string;
}

export type MetaNodeType = 'book' | 'chapter' | 'scene' | 'action';

export interface MetaSelection {
  type: MetaNodeType;
  chapterId: string;
  sceneId?: string;
  actionId?: string;
  meta: NodeMeta;
}

// ─── Wiki ─────────────────────────────────────────────────────────────────────

export interface WikiFieldDef {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  defaultValue: string;
  config?: Record<string, unknown>;
}

export interface WikiType {
  id: string;
  name: string;
  fields: WikiFieldDef[];
  /** When true, omit from @-mention picker */
  excludeFromMentions?: boolean;
}

export interface WikiEntry {
  id: string;
  typeId: string;
  values: Record<string, string>;
}
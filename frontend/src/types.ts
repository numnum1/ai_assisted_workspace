/** Ids match backend {@code ToolkitIds}; used for {@link ChatRequest#disabledToolkits}. */
export const CHAT_TOOLKIT_IDS = ['web', 'wiki', 'dateisystem', 'assistant', 'glossary'] as const;

/** Chat session kind: standard chat vs. AI-led guided session with steering plan. */
export type ChatSessionKind = 'standard' | 'guided';
export type ChatToolkitId = (typeof CHAT_TOOLKIT_IDS)[number];

export interface FileNode {
  name: string;
  path: string;
  directory: boolean;
  children: FileNode[] | null;
  /** Workspace mode id from `.subproject.json` when this directory is a subproject */
  subprojectType?: string | null;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  autoIncludes: string[];
  color: string;
  useReasoning?: boolean;
  /** When true, only agent presets / guided chats use this mode — hidden from the main chat mode menu. */
  agentOnly?: boolean;
  llmId?: string;
}

/** Project-scoped guided chat agent template (`.assistant/agents.json`). */
export interface AgentPreset {
  id: string;
  name: string;
  modeId: string;
  llmId?: string | null;
  /** Optional LLM for fork/thread chats when the parent chat uses this preset (see conversation agentPresetId). */
  threadLlmId?: string | null;
  useReasoning: boolean;
  disabledToolkits: ChatToolkitId[];
  initialSteeringPlan?: string | null;
}

export interface SelectionContext {
  text: string;
  from: number;
  to: number;
  /** Which editor the selection came from */
  editorId: 'file' | 'chapter';
}

export interface AltVersionSession {
  originalText: string;
  from: number;
  to: number;
  editorId: 'file' | 'chapter';
  /** Returns current viewport-relative coordinates of the selection anchor, or null when off-screen */
  getAnchorCoords: () => { top: number; bottom: number; left: number; right: number } | null;
  replaceFn: (from: number, to: number, insert: string) => void;
}

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  mode?: string;
  modeColor?: string;
  /** Present on assistant messages when the user sent this via Ctrl+L selection */
  selectionContext?: SelectionContext;
  /** Present on assistant messages that preceded a tool call loop */
  toolCalls?: ToolCall[];
  /** Present on tool result messages */
  toolCallId?: string;
  /** When true, the message is a tool-chain message: stored in history but not shown in the UI */
  hidden?: boolean;
  /** Present on user messages: the expanded content with file data prepended, used as history content */
  resolvedContent?: string;
}

export interface ChatRequest {
  message: string;
  activeFile: string | null;
  activeFieldKey?: string | null;
  mode: string;
  referencedFiles: string[];
  history: ChatMessage[];
  useReasoning?: boolean;
  /** Quick Chat: minimal context, web search only, no project tools. */
  quickChat?: boolean;
  /**
   * Toolkit ids (see {@link CHAT_TOOLKIT_IDS}) whose tools are omitted for this request.
   * Empty or omitted means all toolkits enabled (subject to server Quick Chat / main-chat rules).
   */
  disabledToolkits?: string[];
  llmId?: string;
  /** Default standard; guided injects steering behaviour and optional steeringPlan. */
  sessionKind?: ChatSessionKind;
  /** Persisted plan text for guided sessions; sent each request when set. */
  steeringPlan?: string | null;
}

export interface ContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
  maxContextTokens?: number;
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
  /**
   * When true on a root chat, it is written to `.assistant/chat-history.json` for Git sync.
   * For {@link isThread} threads this flag is ignored; pinning follows the parent chain.
   */
  savedToProject?: boolean;
  /** Omitted or standard = normal chat; guided = AI-led session with optional steeringPlan */
  sessionKind?: ChatSessionKind;
  /** Project agent template id when this guided chat was started from a preset (fork/thread preset resolution). */
  agentPresetId?: string;
  /** Markdown steering plan maintained by the model (guided sessions) */
  steeringPlan?: string;
  /** True when this conversation was started as a thread from another chat (project pin follows parent). */
  isThread?: boolean;
  /** Parent conversation id when {@link isThread} is true */
  parentConversationId?: string;
  /**
   * When set: this guided (or other) conversation uses this LLM for sends instead of the global selector.
   * Snapshot when starting an „Agent“ session from the new-chat dialog.
   */
  agentLlmId?: string;
  /** When set: overrides global reasoning toggle for this conversation. */
  agentUseReasoning?: boolean;
  /** When set: fixed disabled toolkits for this conversation (same ids as global). */
  agentDisabledToolkits?: ChatToolkitId[];
}

/** Optional toggles under `.assistant/project.yaml` → `extraFeatures` */
export interface ProjectExtraFeatures {
  /** Show per-chat download in chat history (client-side Markdown export). */
  chatDownload?: boolean;
}

export interface ProjectConfig {
  name: string;
  description: string;
  alwaysInclude: string[];
  /** Mode id; empty means client uses review or first available mode */
  defaultMode?: string;
  /** Built-in workspace mode: book, music, default, … (classpath workspace-modes) */
  workspaceMode?: string;
  /** LLM id for Alt+E Quick Chat; empty = first configured LLM */
  quickChatLlmId?: string;
  extraFeatures?: ProjectExtraFeatures;
}

/** API: GET /api/llms — one entry per LLM configuration (fast + reasoning sub-configs). Keys are never exposed. */
export interface LlmPublic {
  id: string;
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKeySet: boolean;
  reasoningApiUrl: string;
  reasoningModel: string;
  reasoningApiKeySet: boolean;
  maxTokens?: number;
}

export interface LlmsListResponse {
  providers: LlmPublic[];
  /** True when the server has a Tavily API key (chat can use web_search). */
  webSearchAvailable?: boolean;
}

/** Persisted browser tab: folder + display metadata */
export interface WorkspaceEntry {
  id: string;
  path: string;
  name: string;
  /** Mirrors last known project workspaceMode (e.g. book, music) */
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
  /** Lucide icon name for subproject folder in the file tree */
  icon?: string;
  /** When true, the mode can be chosen when creating a media subproject */
  mediaType?: boolean;
  /** 'prose' | 'standard' | 'none' | future modes */
  editorMode: string;
  /** When `scene`, prose body is edited per scene; outliner hides the action level. */
  proseLeafLevel?: 'scene' | 'action' | string;
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
  icon: string;
  mediaType: boolean;
}

/** Resolved labels/icons for the three structure levels + root meta button */
export interface OutlinerLevelConfig {
  chapter: { label: string; labelNew: string; icon: string };
  scene: { label: string; labelNew: string; icon: string };
  action: { label: string; labelNew: string; icon: string };
  /** True when workspace mode stores prose on scenes only (no visible action tier). */
  proseLeafAtScene: boolean;
  rootMetaLabel: string;
  rootMetaIcon: string;
  /** Path from media-project root, e.g. `.project/book.json` (for drag-to-chat). */
  rootMetaRelativePath: string;
  /** Icon for subproject folder rows in the file tree */
  folderIcon: string;
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


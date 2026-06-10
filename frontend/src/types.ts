/**
 * Accumulated structured facts about the merchant, extracted and updated at each state transition.
 * Single source of truth — replaces all per-state summaries (naviResults).
 * Injected as a concise overview into every state's system prompt.
 */
export interface NaviContext {
  /** Laden-Typ, Branche, Standort, Kontext */
  laden?: string;
  /** Das konkrete Problem oder der Wunsch des Händlers */
  problem?: string;
  /** Die praktische Lücke – der konkrete fehlende Schritt */
  luecke?: string;
  /** Software-Stack in einem Satz (Kasse, Online-Shop, Kommunikation, …) */
  stack?: string;
  /** Bereitschaft für Zeit- und Geldinvestition in einem Satz */
  investition?: string;
  /** Gemachter Lösungsvorschlag */
  empfehlung?: string;
  /** Granulare Zusatzfakten die nicht in die Hauptfelder passen (Tools, Abläufe, Spezifika) */
  details?: string;
}

/** Ids match backend {@code ToolkitIds}; used for {@link ChatRequest#disabledToolkits}. */
export const CHAT_TOOLKIT_IDS = ['web', 'dateisystem', 'assistant', 'glossary', 'chronist'] as const;

/** A character entry in a simulation environment. */
export interface SimulationCharacter {
  /** Relative wiki path, e.g. `wiki/characters/char-a.md` */
  wikiPath: string;
  /** Display name derived from the wiki path or overridden by the user. */
  name: string;
}

/** A reusable simulated-user persona stored in `.assistant/personas/<id>.md`. */
export interface Persona {
  /** Slug derived from the name; matches the markdown filename. */
  id: string;
  /** Display name, e.g. "Technikscheuer Bäcker". */
  name: string;
  /** Full description fed to the simulated user (shop, tech level, budget, pain points). */
  description: string;
}

/** Configuration for a simulation session (goal + cast derived from a base file). */
export interface SimulationConfig {
  /** The "dramatische Leitfrage": what the user wants to work out. */
  goal: string;
  /** Relative path to the base file (scene/chapter/book JSON). */
  baseFilePath: string;
  /** Human-readable label for the base file. */
  baseFileLabel?: string;
  /** Selected characters for this simulation. */
  characters: SimulationCharacter[];
  /** Result file name slug (maps to `.assistant/simulations/<resultFile>.md`). */
  resultFile: string;
  /** Id of the selected persona library entry, if any. */
  personaId?: string;
  /** Display name of the selected persona. */
  personaName?: string;
  /** Full persona description driving the simulated user (overrides goal for the merchant). */
  personaPrompt?: string;
}

/** Chat session kind: standard chat vs. AI-led guided session with steering plan. */
export type ChatSessionKind = 'standard' | 'guided' | 'navi';
export type ChatToolkitId = (typeof CHAT_TOOLKIT_IDS)[number];

/** A single journal bullet captured by the assistant (journal_log). */
export interface JournalEntry {
  /** HH:MM */
  time: string;
  /** KANON | NEU | WIDERSPRUCH | IDEE (uppercased; unknown values pass through). */
  type: string;
  text: string;
}

/** All journal bullets for one calendar day (file .assistant/journal/<date>.md). */
export interface JournalDay {
  /** YYYY-MM-DD */
  date: string;
  entries: JournalEntry[];
}

/** A flagged contradiction (flag_conflict → .assistant/journal/_conflicts.md). */
export interface JournalConflict {
  /** Free-form timestamp string as written (e.g. "2026-06-04 14:30"). */
  when: string;
  text: string;
}

/** Structured contents of the project journal, newest day first. */
export interface JournalData {
  days: JournalDay[];
  conflicts: JournalConflict[];
}

/** Kind of arc — defines its lane identity and which wiki entity it tracks. */
export type ArcKind = "story" | "character" | "relationship";

/** A single tracked thread (story / character / relationship), drawn as one lane. */
export interface Arc {
  id: string;
  kind: ArcKind;
  title: string;
  /** Wiki entry this arc tracks (story/character). Absent for free-standing arcs. */
  wikiRef?: string;
  /** Wiki entries that form a relationship arc (typically two). */
  members?: string[];
  /** Hex lane color; falls back to a kind default when absent. */
  color?: string;
  /** Vertical lane order, ascending top-to-bottom. */
  order: number;
}

/** A key moment on an arc, positioned by story-time (`at`). */
export interface Beat {
  id: string;
  arcId: string;
  /** Story-time position on the shared timeline (unit defined by Timeline). */
  at: number;
  title: string;
  /** Optional anchor to the scene/file where this beat is narrated. */
  sceneRef?: string;
  note?: string;
}

/** Typed cause→effect edge between two beats. */
export type ArcLinkType = "enables" | "forces" | "prevents" | "triggers";

export interface ArcLink {
  id: string;
  /** Source beat id (the cause). */
  from: string;
  /** Target beat id (the effect). */
  to: string;
  type: ArcLinkType;
  note?: string;
}

/** Story-time axis definition for the arc workspace. */
export interface Timeline {
  /** Axis unit label, e.g. "Tag", "Jahr". */
  unit: string;
  start: number;
  end: number;
  /** Named fixed points rendered as vertical guides. */
  markers: Array<{ at: number; label: string }>;
}

/** Full contents of the arc workspace (.assistant/arcs/). */
export interface ArcData {
  timeline: Timeline;
  arcs: Arc[];
  beats: Beat[];
  links: ArcLink[];
}

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
  /** Legacy; LLM comes from {@link Mode} via modeId. */
  llmId?: string | null;
  /** Legacy fork/thread LLM override (prefer threadModeId). */
  threadLlmId?: string | null;
  /** Optional mode for fork/thread when the parent chat uses this preset (see conversation agentPresetId). */
  threadModeId?: string | null;
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

export interface ThreadSummaryMeta {
  fromThreadId: string;
  fromThreadTitle: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  /** Groups all messages belonging to one conversational exchange (user prompt + AI response + tool calls). */
  turnId?: string;
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
  /** File/wiki paths attached when this message was sent */
  attachedFiles?: string[];
  /** Special message kinds for non-standard rendering */
  kind?: 'thread-summary';
  /** Present when kind === 'thread-summary' */
  threadSummaryMeta?: ThreadSummaryMeta;
  /** Present on user messages that are answers to a clarification multiple-choice */
  clarificationData?: {
    questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>;
    selected: Record<number, string[]>;
  };
}

export interface ChatRequest {
  message: string;
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
  /** When true, this request originates from a thread conversation (not root). */
  isThread?: boolean;
  /** When true, project-level KI-Regeln are not injected into the system prompt. */
  rulesDisabled?: boolean;
  /** Current state id for navi sessions; sent each request. */
  naviStateId?: string | null;
  /** Structured fact sheet accumulated across state transitions; injected into every state's prompt. */
  naviContext?: NaviContext;
  /** When set, the generated question plan for the clarify_problem state is re-sent each turn. */
  naviPlan?: string | null;
  /** Ids of tips that have already been covered in this session; excluded from subsequent prompts. */
  naviCoveredTips?: string[];
  /** The problem currently being addressed in the clarify_problem cycle. */
  naviCurrentProblem?: string;
  /**
   * Semantic interpretation of the current problem: what it really means and in which direction
   * the solution should go. Injected into all state instructions as a semantic frame.
   */
  naviCurrentProblemInterpretation?: string;
  /** Problems mentioned by the merchant that have not yet been addressed, in order of priority. */
  naviProblemQueue?: string[];
  /** When set, injects simulation context (goal + cast) into the system prompt. */
  simulationConfig?: SimulationConfig;
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
  /** True when this thread has been closed (soft-delete). It stays visible in the branch graph but is no longer selectable. */
  isClosed?: boolean;
  /**
   * When set: this guided (or other) conversation uses this LLM for sends instead of the global selector.
   * Snapshot when starting an „Agent“ session from the new-chat dialog.
   */
  agentLlmId?: string;
  /** When set: overrides global reasoning toggle for this conversation. */
  agentUseReasoning?: boolean;
  /** When set: fixed disabled toolkits for this conversation (same ids as global). */
  agentDisabledToolkits?: ChatToolkitId[];
  /**
   * Settled state per snapshotId. Populated when the user accepts or rejects a write_file change.
   * Persisted so the "Pending changes" bar does not reappear after an app restart.
   * Key = snapshotId, value = 'applied' | 'reverted'.
   */
  writeFileSettled?: Record<string, 'applied' | 'reverted'>;
  /** Current navi state id; persisted for navi sessions and sent with each request. */
  naviStateId?: string | null;
  /** Structured fact sheet accumulated across state transitions. */
  naviContext?: NaviContext;
  /** Generated question plan for the clarify_problem state; persisted and re-sent each turn. */
  naviPlan?: string | null;
  /** Ids of tips already covered in this conversation; excluded from subsequent prompts. */
  naviCoveredTips?: string[];
  /** The problem currently being addressed in the clarify_problem cycle. */
  naviCurrentProblem?: string;
  /** Semantic interpretation of the current problem: what it means and solution direction. */
  naviCurrentProblemInterpretation?: string;
  /** Problems mentioned by the merchant that have not yet been addressed, in order of priority. */
  naviProblemQueue?: string[];
  /** When set, this conversation is a simulation session with a goal and cast. */
  simulationConfig?: SimulationConfig;
}

/** Optional toggles under `.assistant/project.yaml` → `extraFeatures` */
export interface ProjectExtraFeatures {
  /** Show per-chat download in chat history (client-side Markdown export). */
  chatDownload?: boolean;
}

/** A named AI rule injected into the system prompt (like a Cursor rule file). */
export interface ProjectRule {
  name: string;
  body: string;
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
  /** LLM id for generating thread summaries; empty = first configured LLM */
  threadSummaryLlmId?: string;
  /** Max number of tool-call rounds before the loop exits (default: 6). */
  maxToolRounds?: number;
  /** Project-level AI rules injected into every system prompt (like Cursor rules). */
  rules?: ProjectRule[];
  /** Per-state instruction overrides for Navi sessions. Key = state id, value = instruction text. */
  naviInstructions?: Record<string, string>;
  /** Per-state workPlan overrides for Navi sessions. Key = state id, value = checklist items. */
  naviWorkPlans?: Record<string, string[]>;
  /** Per-state hints for the question-plan (Frageplan) LLM call.
   *  Key = state id. include = Pflicht-Themen (Whitelist), exclude = verbotene Themen (Blacklist). */
  naviPlanHints?: Record<string, { include?: string[]; exclude?: string[] }>;
  /** Mode id used for Navi sessions; empty = current toolbar/default mode. */
  naviModeId?: string;
  /** LLM id used for Navi sessions; empty = mode/global default. */
  naviLlmId?: string;
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

/** Global appearance preferences (stored in ~/.writing-assistant/preferences.json). */
export interface AppearancePreferences {
  fontFamily?: string;
  chatFontSizePx?: number;
  theme?: 'dark' | 'light';
}

export interface AppPreferences {
  version: 1;
  appearance: AppearancePreferences;
}


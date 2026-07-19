/** Ids match backend {@code ToolkitIds}; used for {@link ChatRequest#disabledToolkits}. */
export const CHAT_TOOLKIT_IDS = ['web', 'dateisystem', 'assistant'] as const;

/** One character in an ensemble scene run (played by its own LLM agent). */
export interface EnsembleCharacterInput {
  /** Relative wiki path, e.g. `wiki/characters/mara-voss.md`. */
  wikiPath: string;
  /** Speaker label shown in the transcript. */
  name: string;
}

/** Scene context handed to the director + character agents. */
export interface EnsembleSceneContext {
  title?: string;
  location?: string;
  time?: string;
  initialSituation?: string;
  goal?: string;
  tone?: string;
  pov?: string;
}

/** Request to play out a scene as a director-orchestrated multi-agent ensemble. */
export interface EnsembleRunRequest {
  scene: EnsembleSceneContext;
  characters: EnsembleCharacterInput[];
  /** Result file name slug (maps to `.assistant/ensembles/<resultFile>.md`). */
  resultFile: string;
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
  /** Hard cap on beats (director may end earlier). */
  maxBeats?: number;
}

/** A single beat in an ensemble transcript. */
export interface EnsembleBeat {
  kind: "dialogue" | "narration";
  /** Character name, or `Erzähler` for narration. */
  speaker: string;
  content: string;
  /** Optional stage direction / action beat. */
  action?: string;
}

/** Result of a finished ensemble run: raw screenplay + prose rewrite. */
export interface EnsembleRunResult {
  beats: EnsembleBeat[];
  screenplay: string;
  prose: string;
  /** Relative path of the written result file, if persisted. */
  path?: string;
}

/** Live progress event streamed while a scene is played out. */
export type EnsembleProgressEvent =
  | { phase: "beat"; index: number; beat: EnsembleBeat }
  | { phase: "prose" }
  | { phase: "done"; result: EnsembleRunResult }
  | { phase: "error"; message: string };

export type ChatToolkitId = (typeof CHAT_TOOLKIT_IDS)[number];

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

/**
 * A user-placed marker on an arc, positioned by story-time (`at`) — "here
 * something important happens". This is the planning unit of the arc workspace,
 * deliberately *not* a narrative "beat": the story plan (declaration) never
 * references the prose that realizes it; book structure points back to it.
 * UI label: „Punkt".
 */
export interface ArcPoint {
  id: string;
  arcId: string;
  /** Story-time position on the shared timeline (unit defined by Timeline). */
  at: number;
  title: string;
  note?: string;
}

/** Typed cause→effect edge between two arc points. */
export type ArcLinkType = "enables" | "forces" | "prevents" | "triggers";

export interface ArcLink {
  id: string;
  /** Source arc-point id (the cause). */
  from: string;
  /** Target arc-point id (the effect). */
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
  points: ArcPoint[];
  links: ArcLink[];
}

/**
 * Which arcs/points are realized by the book — the computed "coverage" of the
 * plan. Derived by scanning structure metadata for references back to the arc
 * workspace (never stored on the arc side). Ids absent here are unrealized,
 * like an unimplemented header method.
 */
export interface ArcCoverage {
  /** Arc ids referenced by at least one structure node. */
  arcs: string[];
  /** Arc-point ids referenced by at least one structure node. */
  points: string[];
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
  /** Short human-facing explanation of when to use this mode; shown as a tooltip in the mode selector. */
  description?: string;
  autoIncludes: string[];
  color: string;
  useReasoning?: boolean;
  llmId?: string;
}

export interface SelectionContext {
  text: string;
  from: number;
  to: number;
  /** Which editor the selection came from */
  editorId: 'file' | 'chapter';
}

export interface ClarificationData {
  questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>;
  selected: Record<number, string[]>;
}

/**
 * Steering context for inline AI generation, derived from the action unit
 * ("Handlungseinheit") the cursor was in when the panel opened. The full text is
 * always sent to the AI on every request so it can write in-place with the whole
 * unit in view; description/extras convey the author's intent for the unit.
 */
export interface InlineUnitContext {
  /** Full text content of the action unit — always included in every AI request. */
  fullText: string;
  /** The unit's meta.description (author intent for this unit), if any. */
  description?: string;
  /** The unit's meta.extras — free-form steering fields (goal/beat, tone, boundaries…). */
  extras?: Record<string, string>;
  /** Human label of the structural level, e.g. "Handlungseinheit". */
  unitLabel?: string;
  /** Title of the unit / scene for orientation. */
  title?: string;
}

export interface AltVersionSession {
  originalText: string;
  from: number;
  to: number;
  editorId: 'file' | 'chapter';
  /** Returns current viewport-relative coordinates of the selection anchor, or null when off-screen */
  getAnchorCoords: () => { top: number; bottom: number; left: number; right: number } | null;
  replaceFn: (from: number, to: number, insert: string) => void;
  /** Full document text of the source editor (the action unit's content) at open time. */
  fullText?: string;
  /** Inline-AI steering context; present when the selection came from an action unit. */
  inlineContext?: InlineUnitContext;
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

/** Beta-test feedback attached by a human reviewer to an assistant answer. */
export interface MessageFeedback {
  rating: 'up' | 'down';
  comment?: string;
  timestamp: number;
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
  /** Present on assistant messages that a human reviewer has rated (beta-test feedback) */
  feedback?: MessageFeedback;
}

/** Reasoning effort level passed to the API as `reasoning_effort` when reasoning is active. */
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ChatRequest {
  message: string;
  activeFieldKey?: string | null;
  mode: string;
  referencedFiles: string[];
  history: ChatMessage[];
  useReasoning?: boolean;
  /** Effort hint for the reasoning model; only applied when {@link useReasoning} is true. */
  reasoningEffort?: ReasoningEffort;
  /** Quick Chat: minimal context, web search only, no project tools. */
  quickChat?: boolean;
  /**
   * Toolkit ids (see {@link CHAT_TOOLKIT_IDS}) whose tools are omitted for this request.
   * Empty or omitted means all toolkits enabled (subject to server Quick Chat / main-chat rules).
   */
  disabledToolkits?: string[];
  llmId?: string;
  /** When true, project-level KI-Regeln are not injected into the system prompt. */
  rulesDisabled?: boolean;
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

export interface FileDiffView {
  path: string;
  content: string;
  label: string;
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
  /** True when this conversation was started as a thread from another chat (project pin follows parent). */
  isThread?: boolean;
  /** Parent conversation id when {@link isThread} is true */
  parentConversationId?: string;
  /** True when this thread has been closed (soft-delete). It stays visible in the branch graph but is no longer selectable. */
  isClosed?: boolean;
  /**
   * Settled state per snapshotId. Populated when the user accepts or rejects a write_file change.
   * Persisted so the "Pending changes" bar does not reappear after an app restart.
   * Key = snapshotId, value = 'applied' | 'reverted'.
   */
  writeFileSettled?: Record<string, 'applied' | 'reverted'>;
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

/**
 * Category id of an AI-generated chapter comment. Free-form: besides the
 * built-in defaults, projects can define their own via CommentCategoryDef
 * (see ProjectSettingsModal's "Kommentar-Kategorien" tab).
 */
export type CommentCategory = string;

/** A project-configurable comment category, toggled as a chip before commenting. */
export interface CommentCategoryDef {
  id: string;
  /** User-facing label shown on the toggle chip and comment card. */
  label: string;
  /** Accent colour (hex) used for the chip and the card's left border. */
  color: string;
  /** Instruction fragment injected into the LLM prompt when this category is active. */
  promptFragment: string;
}

/** A single AI-generated comment anchored to a quote in the chapter text. */
export interface ChapterComment {
  id: string;
  /** Verbatim quote from the chapter text, used to anchor the comment card. */
  quote: string;
  /** The AI's remark about the quoted passage. */
  comment: string;
  category: CommentCategory;
  /**
   * Optional concrete rewrite of the quoted passage that the user can accept.
   * Only set when the AI proposes a replacement; a plain remark leaves it empty.
   */
  suggestion?: string;
  /**
   * True once the user has accepted the suggestion (its text was applied to the
   * chapter). Accepted comments stay visible but struck through.
   */
  accepted?: boolean;
}

export interface ChapterActionFilePath {
  sceneId: string;
  actionId: string;
  relPath: string;
}

export interface ChapterFilePaths {
  chapterDirRelPath: string;
  actions: ChapterActionFilePath[];
}

export interface ScrollTarget {
  sceneId?: string;
  actionId?: string;
}

/**
 * The chapter, scene, or action the user currently has selected in the
 * chapter editor (via the outline panel or by focusing its text). Drives the
 * metadata editor and the AI context panel — `null` when nothing is selected.
 * Scoped to whichever chapter is currently open; not persisted.
 */
export type UserChapterSelection = { type: 'chapter' | 'scene' | 'action'; id: string } | null;

export type MetaNodeType = 'book' | 'chapter' | 'scene' | 'action';

export interface MetaSelection {
  type: MetaNodeType;
  chapterId: string;
  sceneId?: string;
  actionId?: string;
  meta: NodeMeta;
}

export interface FocusedField {
  fieldKey: string;
  fieldLabel: string;
  value: string;
}

/** Global appearance preferences (stored in ~/.writing-assistant/preferences.json). */
export interface AppearancePreferences {
  fontFamily?: string;
  chatFontSizePx?: number;
  theme?: 'dark' | 'light';
  /** Show scene names as headings above each scene. Default true. */
  showSceneHeadings?: boolean;
}

export interface AppPreferences {
  version: 1;
  appearance: AppearancePreferences;
}


/**
 * Lifecycle of a storyboard card. Material starts as a loose `idea`, may be
 * `active` while being worked out, `graduated` once its content has moved on to
 * a wiki entry / scene / arc point, and `discarded` when set aside (kept, not
 * deleted, so it can resurface in a later book of the series).
 */
export type StoryboardCardStatus = "idea" | "active" | "graduated" | "discarded";

/**
 * A free-floating story idea on the pinboard — the pre-canon workspace. Cards
 * carry no structural position; spatial placement (`x`/`y`) and optional frame
 * membership are the only grouping. A card belongs to the series, optionally
 * assigned to one or more books via `bookPaths` (empty = series-wide).
 */
export interface StoryboardCard {
  id: string;
  title: string;
  note?: string;
  /** Free canvas position. */
  x: number;
  y: number;
  /** Hex card color; falls back to a default when absent. */
  color?: string;
  /** Free-form labels, no fixed vocabulary. */
  tags?: string[];
  /** BookProject.path per assignment; empty/absent = series-wide. */
  bookPaths?: string[];
  /** Enclosing frame id, or null/absent when loose on the canvas. */
  frameId?: string | null;
  /**
   * Id of the {@link EventRecord} this card places on the board. When set,
   * `title`/`note` are ignored for display — the card mirrors the live event
   * (title, summary) instead of holding its own copy. Removing such a card
   * only removes this placement; the event's canonical file is untouched
   * (deleting an event is only possible from the Ereignisse window).
   */
  eventId?: string;
  status?: StoryboardCardStatus;
  /** Optional explicit card size; falls back to the default when absent. */
  w?: number;
  h?: number;
}

/** A named region on the canvas that groups the cards placed inside it. */
export interface StoryboardFrame {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

/**
 * An undirected connection between two cards. Direction carries no meaning
 * (`a`/`b` are interchangeable); the optional `label` names the relationship
 * ("hängt zusammen", "Kontrast", "gleiches Motiv").
 */
export interface StoryboardEdge {
  id: string;
  a: string;
  b: string;
  label?: string;
  color?: string;
}

/** Full contents of the pinboard workspace (.assistant/storyboard/). */
export interface StoryboardData {
  cards: StoryboardCard[];
  frames: StoryboardFrame[];
  edges: StoryboardEdge[];
}

/**
 * `idee` = not yet settled, may still change or be discarded; `kanon` =
 * settled fact other workspaces (storyboard nodes, scenes, arcs) may safely
 * reference.
 */
export type EventStatus = "idee" | "kanon";

/**
 * The canonical unit of "what happens" in the story world — the source-of-truth
 * atom that other workspaces only reference, never duplicate. Wiki, Timeline,
 * Storyboard and Buch are all projections of the same underlying events; this
 * record is managed exclusively through the standalone Ereignisse window
 * (CRUD), never created or deleted implicitly by a projection. Stored as one
 * Markdown file per event under `events/<id>.md` (front-matter + `summary` as
 * body) — sichtbar and git-trackable, unlike the `.assistant/` caches.
 */
export interface EventRecord {
  id: string;
  title: string;
  /** The kanon fact: what happens. Plain text/Markdown body of the file. */
  summary: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Live, in-turn-maintained fact sheet for a Navi consultation. Single source of truth —
 * replaces the former naviContext + naviPlan + naviCurrentProblem(Interpretation) + naviProblemQueue
 * split. Updated by the model itself (via the `update_facts` tool) on every turn, not just on
 * state transitions — so it never lags behind what was actually said.
 */
export interface NaviFacts {
  /**
   * slotId -> filled value. Slot ids are derived from each Navi phase's `workPlan` entries
   * (see slugifySlotLabel in electron/services/naviStateMachine.ts) and accumulate across ALL
   * phases visited so far — never reset on a phase change.
   */
  slots: Record<string, string>;
  /** Short restatement of the problem currently being addressed — keeps every phase focused on one thing. */
  currentProblem?: string;
  /** What the problem really means / which direction the solution should go. */
  hypothesis?: string;
  /** Further problems mentioned by the merchant that have not yet been addressed, in priority order. */
  problemQueue: string[];
  /** Gemachter Lösungsvorschlag */
  recommendation?: string;
  /** Free-form extra facts that don't fit any defined slot. */
  notes?: string;
}

/**
 * Debugging/observability record for one Navi turn — answers "why did it just ask that?".
 * Emitted after every turn (`navi_trace` event), independent of NaviFacts itself so it can carry
 * a decision history without bloating the fact sheet that's actually sent back to the model.
 */
export interface NaviTraceEntry {
  at: number;
  /** The phase this turn's visible reply was generated in (after any redirect/advance_phase). */
  stateId: string;
  /** Slot labels still open in {@link stateId} at the moment the visible reply was produced. */
  openSlots: string[];
  /** Slot values newly set or changed by update_facts this turn. */
  factsChanged: { label: string; value: string }[];
  currentProblem?: string;
  hypothesis?: string;
  recommendation?: string;
  /** Every advance_phase call this turn, in order, with the deterministic gate's verdict. */
  advancePhaseAttempts?: { target: string; accepted: boolean; openSlots: string[] }[];
  /** Set when the redirect/safety-net classifier moved the phase before generating the reply. */
  redirectTo?: string;
}

/** Ids match backend {@code ToolkitIds}; used for {@link ChatRequest#disabledToolkits}. */
export const CHAT_TOOLKIT_IDS = ['web', 'dateisystem', 'assistant'] as const;

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

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  /** Short human-facing explanation of when to use this mode; shown as a tooltip in the mode selector. */
  description?: string;
  autoIncludes: string[];
  color: string;
  useReasoning?: boolean;
  /** When true, only agent presets / guided chats use this mode — hidden from the main chat mode menu. */
  agentOnly?: boolean;
  llmId?: string;
}

export interface SelectionContext {
  text: string;
  from: number;
  to: number;
  /** Which editor the selection came from */
  editorId: 'file' | 'chapter';
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

/** Beta-test feedback attached by a human reviewer to a Navi assistant answer. */
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
  /** Live fact sheet (slots, hypothesis, problem queue, recommendation); sent + updated each turn. */
  naviFacts?: NaviFacts;
  /** Ids of tips that have already been covered in this session; excluded from subsequent prompts. */
  naviCoveredTips?: string[];
  /** When set, injects simulation context (goal + cast) into the system prompt. */
  simulationConfig?: SimulationConfig;
}

export interface ContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
  maxContextTokens?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  mode: string;
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
  /** Live fact sheet (slots, hypothesis, problem queue, recommendation); persisted, updated each turn. */
  naviFacts?: NaviFacts;
  /** Ids of tips already covered in this conversation; excluded from subsequent prompts. */
  naviCoveredTips?: string[];
  /** Per-turn decision trace (debugging aid — why did Navi ask/advance the way it did). Capped, most recent last. */
  naviTrace?: NaviTraceEntry[];
  /** When set, this conversation is a simulation session with a goal and cast. */
  simulationConfig?: SimulationConfig;
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


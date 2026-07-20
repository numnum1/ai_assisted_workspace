import type {
  AppPreferences,
  ChatMessage,
  ChatRequest,
  LlmsListResponse,
  LlmPublic,
  NaviFacts,
  Persona,
} from "../types.ts";
import { DEFAULT_NAVI_STATES, type NaviState } from "../naviStateMachine.ts";
import { DEFAULT_NAVI_TIPS, type NaviTip } from "../naviTips.ts";
import { DEFAULT_NAVI_PERSONA, type NaviPersonaConfig } from "../naviPersona.ts";
import { DEFAULT_NAVI_USE_CASES, type NaviUseCase } from "../naviUseCases.ts";
import { DEFAULT_NAVI_TOOLS, type NaviTool } from "../naviTools.ts";
import type {
  NaviImprovementProposal,
  NaviImprovementLlmPublic,
  NaviImprovementLlmInput,
} from "../naviImprovement.ts";

export interface ChatContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
  maxContextTokens?: number;
}

export type ChatStreamEvent =
  | { type: "context"; payload: ChatContextInfo }
  | { type: "token"; payload: string }
  | { type: "tool_call"; payload: string }
  | { type: "tool_history"; payload: ChatMessage[] }
  | { type: "resolved_user_message"; payload: string }
  | { type: "context_update"; payload: { estimatedTokens: number } }
  | { type: "done"; payload: { fullAssistantText: string } }
  | { type: "error"; payload: { message: string } }
  | { type: "navi_state"; payload: { stateId: string; completedStateId?: string; summary?: string } }
  | { type: "navi_tips_covered"; payload: { coveredIds: string[] } }
  | { type: "navi_step"; payload: { label: string | null } }
  | { type: "navi_facts"; payload: import("../types.js").NaviFacts }
  | { type: "navi_trace"; payload: import("../types.js").NaviTraceEntry };

export interface ChatStreamStartResult {
  streamId: string;
}

export interface ChatStreamSubscription {
  unsubscribe: () => void;
}

export interface LlmCreateRequest {
  name: string;
  fastApiUrl: string;
  fastModel: string;
  fastApiKey: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export interface LlmUpdateRequest {
  name?: string;
  fastApiUrl?: string;
  fastModel?: string;
  fastApiKey?: string;
  reasoningApiUrl?: string;
  reasoningModel?: string;
  reasoningApiKey?: string;
  maxTokens?: number;
}

export interface AppBridge {
  platform: NodeJS.Platform;
  isElectron: boolean;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  chat?: {
    startStream: (body: ChatRequest) => Promise<ChatStreamStartResult>;
    stopStream: (streamId: string) => Promise<{ status: string }>;
    onStreamEvent: (
      streamId: string,
      listener: (event: ChatStreamEvent) => void,
    ) => ChatStreamSubscription;
  };
  llms?: {
    list: () => Promise<LlmsListResponse>;
    create: (body: LlmCreateRequest) => Promise<LlmPublic>;
    update: (id: string, body: LlmUpdateRequest) => Promise<LlmPublic>;
    remove: (id: string) => Promise<{ status: string }>;
  };
  simulation?: {
    generateUserReply: (req: {
      goal: string;
      characterNames?: string[];
      transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
      llmId?: string | null;
    }) => Promise<{ reply: string }>;
    evaluateRun: (req: {
      persona: string;
      personaName?: string;
      personaId?: string;
      transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
      llmId?: string | null;
      finalStateId?: string;
      finalFacts?: NaviFacts;
      resultFile?: string;
    }) => Promise<{ score: number; report: string }>;
  };
  persona?: {
    list: () => Promise<Persona[]>;
    read: (id: string) => Promise<{ persona: Persona | null }>;
    write: (name: string, description: string) => Promise<{ persona: Persona }>;
    delete: (id: string) => Promise<{ deleted: boolean }>;
  };
  preferences?: {
    get: () => Promise<AppPreferences>;
    set: (patch: Partial<AppPreferences>) => Promise<AppPreferences>;
  };
  navi?: {
    getStates: () => Promise<NaviState[]>;
    setStates: (states: NaviState[]) => Promise<NaviState[]>;
    resetStates: () => Promise<NaviState[]>;
    getTips: () => Promise<NaviTip[]>;
    setTips: (tips: NaviTip[]) => Promise<NaviTip[]>;
    resetTips: () => Promise<NaviTip[]>;
    getPersona: () => Promise<NaviPersonaConfig>;
    setPersona: (persona: NaviPersonaConfig) => Promise<NaviPersonaConfig>;
    resetPersona: () => Promise<NaviPersonaConfig>;
    getUseCases: () => Promise<NaviUseCase[]>;
    setUseCases: (useCases: NaviUseCase[]) => Promise<NaviUseCase[]>;
    resetUseCases: () => Promise<NaviUseCase[]>;
    getTools: () => Promise<NaviTool[]>;
    setTools: (tools: NaviTool[]) => Promise<NaviTool[]>;
    resetTools: () => Promise<NaviTool[]>;
    proposeImprovement: (
      conversationMarkdown: string,
      llmId?: string,
    ) => Promise<NaviImprovementProposal>;
    getImprovementLlm: () => Promise<NaviImprovementLlmPublic>;
    setImprovementLlm: (input: NaviImprovementLlmInput) => Promise<NaviImprovementLlmPublic>;
    resetImprovementLlm: () => Promise<NaviImprovementLlmPublic>;
  };
  shell?: {
    openDevTools: () => Promise<void>;
  };
  spellcheck?: {
    fixAtCursor: () => Promise<{ status: string }>;
  };
}

export function getAppBridge(): AppBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.appBridge ?? null;
}

export function isRunningInElectron(): boolean {
  return getAppBridge()?.isElectron === true;
}

const PREFS_STORAGE_KEY = "app-preferences";

const DEFAULT_PREFERENCES: AppPreferences = {
  version: 1,
  appearance: {
    fontFamily: "system-ui",
    chatFontSizePx: 14,
  },
};

function loadPrefsFromLocalStorage(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      version: 1,
      appearance: {
        ...DEFAULT_PREFERENCES.appearance,
        ...(parsed.appearance ?? {}),
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePrefsToLocalStorage(prefs: AppPreferences): AppPreferences {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage full or unavailable
  }
  return prefs;
}

const NAVI_STATES_STORAGE_KEY = "navi-states-override";
const NAVI_TIPS_STORAGE_KEY = "navi-tips-override";
const NAVI_PERSONA_STORAGE_KEY = "navi-persona-override";
const NAVI_USE_CASES_STORAGE_KEY = "navi-use-cases-override";
const NAVI_TOOLS_STORAGE_KEY = "navi-tools-override";
const NAVI_IMPROVEMENT_LLM_STORAGE_KEY = "navi-improvement-llm-override";

function loadFromLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveToLocalStorage<T>(key: string, value: T): T {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable
  }
  return value;
}

function loadObjectFromLocalStorage<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<T>;
    return parsed && typeof parsed === "object" ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Dev-web fallback only (no Electron main process to persist to or to influence an actual LLM
 * call). In Electron builds this always goes through `bridge.navi`, backed by
 * `electron/services/naviStateConfigService.ts`.
 */
export const naviConfigApi = {
  getStates: async (): Promise<NaviState[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getStates();
    return loadFromLocalStorage(NAVI_STATES_STORAGE_KEY, DEFAULT_NAVI_STATES);
  },
  setStates: async (states: NaviState[]): Promise<NaviState[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setStates(states);
    return saveToLocalStorage(NAVI_STATES_STORAGE_KEY, states);
  },
  resetStates: async (): Promise<NaviState[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetStates();
    try {
      localStorage.removeItem(NAVI_STATES_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_NAVI_STATES;
  },
  getTips: async (): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getTips();
    return loadFromLocalStorage(NAVI_TIPS_STORAGE_KEY, DEFAULT_NAVI_TIPS);
  },
  setTips: async (tips: NaviTip[]): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setTips(tips);
    return saveToLocalStorage(NAVI_TIPS_STORAGE_KEY, tips);
  },
  resetTips: async (): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetTips();
    try {
      localStorage.removeItem(NAVI_TIPS_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_NAVI_TIPS;
  },
  getPersona: async (): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getPersona();
    return loadObjectFromLocalStorage(NAVI_PERSONA_STORAGE_KEY, DEFAULT_NAVI_PERSONA);
  },
  setPersona: async (persona: NaviPersonaConfig): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setPersona(persona);
    return saveToLocalStorage(NAVI_PERSONA_STORAGE_KEY, persona);
  },
  resetPersona: async (): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetPersona();
    try {
      localStorage.removeItem(NAVI_PERSONA_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_NAVI_PERSONA;
  },
  getUseCases: async (): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getUseCases();
    return loadFromLocalStorage(NAVI_USE_CASES_STORAGE_KEY, DEFAULT_NAVI_USE_CASES);
  },
  setUseCases: async (useCases: NaviUseCase[]): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setUseCases(useCases);
    return saveToLocalStorage(NAVI_USE_CASES_STORAGE_KEY, useCases);
  },
  resetUseCases: async (): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetUseCases();
    try {
      localStorage.removeItem(NAVI_USE_CASES_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_NAVI_USE_CASES;
  },
  getTools: async (): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getTools();
    return loadFromLocalStorage(NAVI_TOOLS_STORAGE_KEY, DEFAULT_NAVI_TOOLS);
  },
  setTools: async (tools: NaviTool[]): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setTools(tools);
    return saveToLocalStorage(NAVI_TOOLS_STORAGE_KEY, tools);
  },
  resetTools: async (): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetTools();
    try {
      localStorage.removeItem(NAVI_TOOLS_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return DEFAULT_NAVI_TOOLS;
  },
  proposeImprovement: async (
    conversationMarkdown: string,
    llmId?: string,
  ): Promise<NaviImprovementProposal> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.proposeImprovement(conversationMarkdown, llmId);
    throw new Error("Die Auto-Verbesserung ist nur in der Desktop-App verfügbar.");
  },
  getImprovementLlm: async (): Promise<NaviImprovementLlmPublic> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getImprovementLlm();
    const raw = loadObjectFromLocalStorage<NaviImprovementLlmInput & { apiKey: string }>(
      NAVI_IMPROVEMENT_LLM_STORAGE_KEY,
      { apiUrl: "", model: "", apiKey: "" },
    );
    return { apiUrl: raw.apiUrl, model: raw.model, apiKeySet: raw.apiKey.trim().length > 0 };
  },
  setImprovementLlm: async (
    input: NaviImprovementLlmInput,
  ): Promise<NaviImprovementLlmPublic> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setImprovementLlm(input);
    const existing = loadObjectFromLocalStorage<NaviImprovementLlmInput & { apiKey: string }>(
      NAVI_IMPROVEMENT_LLM_STORAGE_KEY,
      { apiUrl: "", model: "", apiKey: "" },
    );
    const next = {
      apiUrl: input.apiUrl.trim(),
      model: input.model.trim(),
      apiKey: input.apiKey !== undefined ? input.apiKey.trim() : existing.apiKey,
    };
    saveToLocalStorage(NAVI_IMPROVEMENT_LLM_STORAGE_KEY, next);
    return { apiUrl: next.apiUrl, model: next.model, apiKeySet: next.apiKey.length > 0 };
  },
  resetImprovementLlm: async (): Promise<NaviImprovementLlmPublic> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetImprovementLlm();
    try {
      localStorage.removeItem(NAVI_IMPROVEMENT_LLM_STORAGE_KEY);
    } catch {
      // localStorage unavailable
    }
    return { apiUrl: "", model: "", apiKeySet: false };
  },
};

export const preferencesApi = {
  get: async (): Promise<AppPreferences> => {
    const bridge = getAppBridge();
    if (bridge?.preferences) {
      return bridge.preferences.get();
    }
    return loadPrefsFromLocalStorage();
  },
  set: async (patch: Partial<AppPreferences>): Promise<AppPreferences> => {
    const bridge = getAppBridge();
    if (bridge?.preferences) {
      return bridge.preferences.set(patch);
    }
    const current = loadPrefsFromLocalStorage();
    const updated: AppPreferences = {
      version: 1,
      appearance: {
        ...current.appearance,
        ...(patch.appearance ?? {}),
      },
    };
    return savePrefsToLocalStorage(updated);
  },
};

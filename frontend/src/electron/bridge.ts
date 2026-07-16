import type {
  AppPreferences,
  ChatMessage,
  ChatRequest,
  LlmsListResponse,
  LlmPublic,
  Persona,
} from "../types.ts";
import { DEFAULT_NAVI_STATES, type NaviState } from "../naviStateMachine.ts";
import { DEFAULT_NAVI_TIPS, type NaviTip } from "../naviTips.ts";

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
      transcript: Array<{ speaker: "navi" | "merchant"; content: string }>;
      llmId?: string | null;
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

import type {
  AppPreferences,
  ChatMessage,
  ChatRequest,
  LlmsListResponse,
  LlmPublic,
  Persona,
} from "../types.ts";

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

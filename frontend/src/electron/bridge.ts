import type {
  AppPreferences,
  ChatMessage,
  ChatRequest,
  LlmsListResponse,
  LlmPublic,
  NaviFacts,
  NaviSimulationRunRecord,
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
import {
  NAVI_BUILTIN_PROFILE_ID,
  NAVI_BUILTIN_PROFILE_NAME,
  isBuiltInProfile,
  uniqueProfileName,
  type NaviProfileIndex,
  type NaviProfileTransferResult,
} from "../naviProfile.ts";

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
    listRuns: () => Promise<NaviSimulationRunRecord[]>;
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
    listProfiles: () => Promise<NaviProfileIndex>;
    setActiveProfile: (id: string) => Promise<NaviProfileIndex>;
    createProfile: (name: string, fromId?: string) => Promise<NaviProfileIndex>;
    renameProfile: (id: string, name: string) => Promise<NaviProfileIndex>;
    deleteProfile: (id: string) => Promise<NaviProfileIndex>;
    exportProfile: (id: string) => Promise<NaviProfileTransferResult>;
    importProfile: () => Promise<NaviProfileTransferResult>;
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

/** The per-profile override keys — the improvement LLM is deliberately absent: it is global. */
const NAVI_PROFILE_STORAGE_KEYS = [
  NAVI_STATES_STORAGE_KEY,
  NAVI_TIPS_STORAGE_KEY,
  NAVI_PERSONA_STORAGE_KEY,
  NAVI_USE_CASES_STORAGE_KEY,
  NAVI_TOOLS_STORAGE_KEY,
];

const NAVI_PROFILE_INDEX_STORAGE_KEY = "navi-profile-index";

/**
 * Dev-web mirror of `electron/services/naviProfileStore.ts`: the six override keys above are
 * base names, namespaced per profile. The built-in profile owns no keys at all, so reads fall
 * through to the DEFAULT_NAVI_* constants and writes are rejected — exactly as in Electron.
 */
function loadProfileIndexLocal(): NaviProfileIndex {
  const fallback: NaviProfileIndex = {
    activeProfileId: NAVI_BUILTIN_PROFILE_ID,
    profiles: [],
  };
  try {
    const raw = localStorage.getItem(NAVI_PROFILE_INDEX_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as NaviProfileIndex;
    return parsed && Array.isArray(parsed.profiles) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveProfileIndexLocal(index: NaviProfileIndex): NaviProfileIndex {
  try {
    localStorage.setItem(NAVI_PROFILE_INDEX_STORAGE_KEY, JSON.stringify(index));
  } catch {
    // localStorage full or unavailable
  }
  return index;
}

function withBuiltIn(index: NaviProfileIndex): NaviProfileIndex {
  return {
    activeProfileId: index.activeProfileId,
    profiles: [
      {
        id: NAVI_BUILTIN_PROFILE_ID,
        name: NAVI_BUILTIN_PROFILE_NAME,
        createdAt: "",
        updatedAt: "",
        builtIn: true,
      },
      ...index.profiles.filter((p) => !isBuiltInProfile(p.id)),
    ],
  };
}

/** The active profile's key for `base`, or null when the read-only built-in profile is active. */
function profileKey(base: string): string | null {
  const activeId = loadProfileIndexLocal().activeProfileId;
  return isBuiltInProfile(activeId) ? null : `${base}:${activeId}`;
}

function assertLocalProfileWritable(): void {
  if (isBuiltInProfile(loadProfileIndexLocal().activeProfileId)) {
    throw new Error(
      `Das Profil "${NAVI_BUILTIN_PROFILE_NAME}" ist schreibgeschützt. Lege ein eigenes Profil an, um Änderungen zu speichern.`,
    );
  }
}

function loadFromLocalStorage<T>(key: string | null, fallback: T): T {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function saveToLocalStorage<T>(key: string | null, value: T): T {
  if (!key) return value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable
  }
  return value;
}

function removeFromLocalStorage(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage unavailable
  }
}

function loadObjectFromLocalStorage<T extends object>(key: string | null, fallback: T): T {
  if (!key) return fallback;
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
    return loadFromLocalStorage(profileKey(NAVI_STATES_STORAGE_KEY), DEFAULT_NAVI_STATES);
  },
  setStates: async (states: NaviState[]): Promise<NaviState[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setStates(states);
    assertLocalProfileWritable();
    return saveToLocalStorage(profileKey(NAVI_STATES_STORAGE_KEY), states);
  },
  resetStates: async (): Promise<NaviState[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetStates();
    assertLocalProfileWritable();
    removeFromLocalStorage(profileKey(NAVI_STATES_STORAGE_KEY));
    return DEFAULT_NAVI_STATES;
  },
  getTips: async (): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getTips();
    return loadFromLocalStorage(profileKey(NAVI_TIPS_STORAGE_KEY), DEFAULT_NAVI_TIPS);
  },
  setTips: async (tips: NaviTip[]): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setTips(tips);
    assertLocalProfileWritable();
    return saveToLocalStorage(profileKey(NAVI_TIPS_STORAGE_KEY), tips);
  },
  resetTips: async (): Promise<NaviTip[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetTips();
    assertLocalProfileWritable();
    removeFromLocalStorage(profileKey(NAVI_TIPS_STORAGE_KEY));
    return DEFAULT_NAVI_TIPS;
  },
  getPersona: async (): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getPersona();
    return loadObjectFromLocalStorage(profileKey(NAVI_PERSONA_STORAGE_KEY), DEFAULT_NAVI_PERSONA);
  },
  setPersona: async (persona: NaviPersonaConfig): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setPersona(persona);
    assertLocalProfileWritable();
    return saveToLocalStorage(profileKey(NAVI_PERSONA_STORAGE_KEY), persona);
  },
  resetPersona: async (): Promise<NaviPersonaConfig> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetPersona();
    assertLocalProfileWritable();
    removeFromLocalStorage(profileKey(NAVI_PERSONA_STORAGE_KEY));
    return DEFAULT_NAVI_PERSONA;
  },
  getUseCases: async (): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getUseCases();
    return loadFromLocalStorage(profileKey(NAVI_USE_CASES_STORAGE_KEY), DEFAULT_NAVI_USE_CASES);
  },
  setUseCases: async (useCases: NaviUseCase[]): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setUseCases(useCases);
    assertLocalProfileWritable();
    return saveToLocalStorage(profileKey(NAVI_USE_CASES_STORAGE_KEY), useCases);
  },
  resetUseCases: async (): Promise<NaviUseCase[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetUseCases();
    assertLocalProfileWritable();
    removeFromLocalStorage(profileKey(NAVI_USE_CASES_STORAGE_KEY));
    return DEFAULT_NAVI_USE_CASES;
  },
  getTools: async (): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.getTools();
    return loadFromLocalStorage(profileKey(NAVI_TOOLS_STORAGE_KEY), DEFAULT_NAVI_TOOLS);
  },
  setTools: async (tools: NaviTool[]): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setTools(tools);
    assertLocalProfileWritable();
    return saveToLocalStorage(profileKey(NAVI_TOOLS_STORAGE_KEY), tools);
  },
  resetTools: async (): Promise<NaviTool[]> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.resetTools();
    assertLocalProfileWritable();
    removeFromLocalStorage(profileKey(NAVI_TOOLS_STORAGE_KEY));
    return DEFAULT_NAVI_TOOLS;
  },
  listProfiles: async (): Promise<NaviProfileIndex> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.listProfiles();
    return withBuiltIn(loadProfileIndexLocal());
  },
  setActiveProfile: async (id: string): Promise<NaviProfileIndex> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.setActiveProfile(id);
    const index = loadProfileIndexLocal();
    index.activeProfileId = id;
    return withBuiltIn(saveProfileIndexLocal(index));
  },
  createProfile: async (name: string, fromId?: string): Promise<NaviProfileIndex> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.createProfile(name, fromId);
    const index = loadProfileIndexLocal();
    const sourceId = fromId ?? index.activeProfileId;
    const id = `p-${Date.now().toString(36)}`;
    const stamp = new Date().toISOString();
    // Copy the source profile's overrides key by key; the built-in has none, so the new
    // profile simply starts out on the defaults.
    for (const base of NAVI_PROFILE_STORAGE_KEYS) {
      if (isBuiltInProfile(sourceId)) break;
      const raw = localStorage.getItem(`${base}:${sourceId}`);
      if (raw !== null) saveToLocalStorage(`${base}:${id}`, JSON.parse(raw));
    }
    const taken = index.profiles.map((p) => p.name).concat(NAVI_BUILTIN_PROFILE_NAME);
    index.profiles.push({
      id,
      name: uniqueProfileName(name, taken),
      createdAt: stamp,
      updatedAt: stamp,
    });
    index.activeProfileId = id;
    return withBuiltIn(saveProfileIndexLocal(index));
  },
  renameProfile: async (id: string, name: string): Promise<NaviProfileIndex> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.renameProfile(id, name);
    const index = loadProfileIndexLocal();
    const meta = index.profiles.find((p) => p.id === id);
    if (meta) {
      const taken = index.profiles
        .filter((p) => p.id !== id)
        .map((p) => p.name)
        .concat(NAVI_BUILTIN_PROFILE_NAME);
      meta.name = uniqueProfileName(name, taken);
      meta.updatedAt = new Date().toISOString();
    }
    return withBuiltIn(saveProfileIndexLocal(index));
  },
  deleteProfile: async (id: string): Promise<NaviProfileIndex> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.deleteProfile(id);
    const index = loadProfileIndexLocal();
    for (const base of NAVI_PROFILE_STORAGE_KEYS) removeFromLocalStorage(`${base}:${id}`);
    index.profiles = index.profiles.filter((p) => p.id !== id);
    if (index.activeProfileId === id) index.activeProfileId = NAVI_BUILTIN_PROFILE_ID;
    return withBuiltIn(saveProfileIndexLocal(index));
  },
  exportProfile: async (id: string): Promise<NaviProfileTransferResult> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.exportProfile(id);
    throw new Error("Profil-Export ist nur in der Desktop-App verfügbar.");
  },
  importProfile: async (): Promise<NaviProfileTransferResult> => {
    const bridge = getAppBridge();
    if (bridge?.navi) return bridge.navi.importProfile();
    throw new Error("Profil-Import ist nur in der Desktop-App verfügbar.");
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

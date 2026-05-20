import type { Finder, Patcher, Setter } from "../../../utils/generics";
import type { Chat } from "../chat/Chat";
import type { SelectedLLM } from "../chat/unsortedChatTypes";
import type { ChatStreamingApi } from "../stream/useChatStreaming";

export type ProjectViewModel = {
  setSettings: Setter<ProjectSettings>;
  setChat: Patcher<Chat>;
  findChatById: Finder<Chat>;
  findModeById: Finder<AssistantMode>;
  findLLMById: Finder<LLM>;
  setChats: Setter<Chat[]>;
  defaultLLM: SelectedLLM;
  chatStreaming: ChatStreamingApi;
} & Project;

export type AssistantMode = {
  id: string;
  name: string;
  systemPrompt: string;
  color: string;
};

export function isValid({ host, model }: LLMVersion): boolean {
  return host !== "" && model !== "";
}

export type LLMVersion = {
  host: string;
  apiKey: string;
  model: string;
  maxTokens: number | null;
  cost: number | null;
};

export type LLM = {
  id: string;
  name: string;
  fast: LLMVersion;
  reasoning: LLMVersion;
};

export type ProjectSettings = {
  llms: LLM[];
  modes: AssistantMode[];
};

export type Project = {
  chats: Chat[];
  settings: ProjectSettings;
};

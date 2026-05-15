import type { Finder, Patcher, Setter } from "../../../utils/generics";
import type { Chat } from "../chat/Chat";

export type ProjectViewModel = {
  setSettings: Setter<ProjectSettings>;
  setChat: Patcher<Chat>;
  findChatById: Finder<Chat>;
  findModeById: Finder<AssistantMode>;
  findLLMById: Finder<LLM>;
  setChats: Setter<Chat[]>;
} & Project;

export type AssistantMode = {
  id: string;
  name: string;
  systemPrompt: string;
  color: string;
};

export type LLMVersion = {
  host: string;
  apiKey: string;
  model: string;
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

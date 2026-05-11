import { useState } from "react";
import type { Chat } from "../chat/Chat";
import { useFindById, usePatchEntry } from "../../../utils/generics";

export type AssistantMode = {
  id: string;
  name: string;
  systemPrompt: string;
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

export type ProjectViewModel = {
  setSettings: (newSettings: ProjectSettings) => void;
  setChat: (id: string, patch: Partial<Chat>) => void;
  findChatById: (id: string) => Chat | null
  findModeById: (id: string) => AssistantMode | null
} & Project;

export function useProjectNew(init: Project): ProjectViewModel {
  const [chats, setChats] = useState(init.chats);
  const [settings, setSettings] = useState(init.settings);

  const setChat = usePatchEntry(setChats)

  const findChatById = useFindById(chats)
  const findModeById = useFindById(settings.modes)

  return {
    chats,
    settings,
    setSettings,
    setChat,
    findChatById,
    findModeById
  };
}

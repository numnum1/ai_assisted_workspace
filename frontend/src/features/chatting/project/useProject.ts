import { useCallback, useState } from "react";
import type { Chat } from "../chat/Chat";

type AssistantMode = {
  id: string;
  name: string;
  systemPrompt: string;
};

type LLMVersion = {
  host: string;
  apiKey: string;
  model: string;
};

type LLM = {
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
} & Project;

export function useProjectNew(init: Project): ProjectViewModel {
  const [chats, setChats] = useState<Chat[]>(init.chats);
  const [settings, setSettings] = useState<ProjectSettings>(init.settings);

  const setChat = useCallback((id: string, patch: Partial<Chat>) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === id ? { ...chat, ...patch } : chat)),
    );
  }, []);

  const findChatById = useCallback((id: string) => {
    for (const chat of chats) {
      if (chat.id === id) return chat
    }
    return null
  }, [chats])

  return {
    chats,
    settings,
    setSettings,
    setChat,
    findChatById
  };
}

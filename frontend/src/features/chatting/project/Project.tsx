import { type Chat } from "../chat/Chat";
import ProjectContext from "./project-context";
import {
  useFindById,
  usePatchEntry,
  type Finder,
} from "../../../utils/generics";
import { isValid, type AssistantMode, type LLM } from "./project-types";
import { ChatPanel } from "../chat_panel/ChatPanel";
import { useEffect, useMemo, useState } from "react";
import type { SelectedLLM } from "../chat/unsortedChatTypes";
import { useChatStreaming } from "../stream/useChatStreaming";
import { useProjectSettings } from "./settings/useProjectSettings.ts";

const getStorageKey = (path: string) => `project-chats-${path}`;
const getOpenChatStorageKey = (path: string) => `project-open-chat-${path}`;

/**
 * Migriert alte Chat-Daten (z. B. Umbenennung von enabledToolIds -> enabledToolkitIds)
 */
function migrateChat(raw: unknown): Chat {
  const chat = (raw ?? {}) as Record<string, unknown>;

  const settings = ((chat.settings as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;

  let enabledToolkitIds: string[] = [];

  if (Array.isArray(settings.enabledToolkitIds)) {
    enabledToolkitIds = settings.enabledToolkitIds as string[];
  } else if (Array.isArray(settings.enabledToolIds)) {
    // Migration vom alten Feldnamen
    enabledToolkitIds = settings.enabledToolIds as string[];
  }

  return {
    ...(chat as Omit<Chat, "settings">),
    settings: {
      ...(settings as any),
      enabledToolkitIds,
    },
  } as Chat;
}

export function ProjectPane({ openFolderPath }: { openFolderPath: string }) {
  const [chats, setChats] = useState<Chat[]>(() => {
    if (!openFolderPath) return [];
    try {
      const stored = localStorage.getItem(getStorageKey(openFolderPath));
      if (stored) {
        const parsed = JSON.parse(stored) as any[];
        return parsed.map(migrateChat);
      }
    } catch (e) {
      console.error("Failed to parse stored chats:", e);
    }
    return [];
  });

  useEffect(() => {
    if (!openFolderPath) return;
    try {
      localStorage.setItem(
        getStorageKey(openFolderPath),
        JSON.stringify(chats),
      );
    } catch (e) {
      console.error("Failed to save chats to localStorage:", e);
    }
  }, [chats, openFolderPath]);

  const [settings, setSettings] = useProjectSettings(openFolderPath);

  const setChat = usePatchEntry(setChats);

  const findChatById: Finder<Chat, string> = useFindById(chats);
  const findModeById: Finder<AssistantMode, string> = useFindById(
    settings.modes,
  );
  const findLLMById: Finder<LLM, string> = useFindById(settings.llms);

  const chatStreaming = useChatStreaming(chats, setChats, findModeById);

  const [openChatId, setOpenChatId] = useState<string | null>(() => {
    if (!openFolderPath) return "";
    try {
      const stored = localStorage.getItem(
        getOpenChatStorageKey(openFolderPath),
      );
      if (stored !== null) {
        return stored === "null" ? null : stored;
      }
    } catch (e) {
      console.error("Failed to parse stored open chat id:", e);
    }
    return "";
  });

  useEffect(() => {
    if (!openFolderPath) return;
    try {
      localStorage.setItem(
        getOpenChatStorageKey(openFolderPath),
        openChatId === null ? "null" : openChatId,
      );
    } catch (e) {
      console.error("Failed to save open chat id to localStorage:", e);
    }
  }, [openChatId, openFolderPath]);

  // For debugging purposes
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).printProjectSettings = () => {
      console.log("[ProjectPane] Current Open Path:", openFolderPath);
      console.log("[ProjectPane] Current settings:", settings);
    };
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).printProjectSettings;
    };
  }, [settings, openFolderPath]);

  const defaultLLM: SelectedLLM = useMemo(() => {
    let res: SelectedLLM = { id: null, useReasoning: false };
    if (settings.llms.length === 0) {
      for (const { id, fast, reasoning } of settings.llms) {
        if (isValid(reasoning)) {
          res = { id: id, useReasoning: true };
          break;
        }
        if (isValid(fast)) {
          res = { id: id, useReasoning: false };
          break;
        }
      }
    }
    return res;
  }, [settings.llms]);

  return (
    <ProjectContext
      value={{
        chats,
        settings,
        setSettings,
        setChat,
        findChatById,
        findModeById,
        findLLMById,
        setChats,
        defaultLLM,
        chatStreaming,
      }}
    >
      <ChatPanel openChatId={openChatId} setOpenChatId={setOpenChatId} />
    </ProjectContext>
  );
}

export default ProjectContext;

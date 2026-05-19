import { type Chat } from "../chat/Chat";
import ProjectContext from "./project-context";
import {
  useFindById,
  usePatchEntry,
  type Finder,
} from "../../../utils/generics";
import { testProjectData } from "./test-project-data";
import { isValid, type AssistantMode, type LLM } from "./project-types";
import { ChatPanel } from "../chat_panel/ChatPanel";
import { useEffect, useMemo, useState } from "react";
import type { SelectedLLM } from "../chat/unsortedChatTypes";
import { useChatStreaming } from "../stream/useChatStreaming";
import { useProjectSettings } from "./settings/useProjectSettings.ts";

export function ProjectPane({ openFolderPath }: { openFolderPath: string }) {
  const [chats, setChats] = useState(testProjectData.chats);

  const [settings, setSettings] = useProjectSettings(openFolderPath);

  const setChat = usePatchEntry(setChats);

  const findChatById: Finder<Chat, string> = useFindById(chats);
  const findModeById: Finder<AssistantMode, string> = useFindById(
    settings.modes,
  );
  const findLLMById: Finder<LLM, string> = useFindById(settings.llms);

  const chatStreaming = useChatStreaming(chats, setChats, findModeById);

  // TODO: Move somewhere else
  const [openChatId, setOpenChatId] = useState<string | null>("");

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

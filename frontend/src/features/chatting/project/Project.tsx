import { type Chat } from "../chat/Chat";
import ProjectContext from "./project-context";
import {
  useFindById,
  useLocalStorageState,
  usePatchEntry,
  type Finder,
} from "../../../utils/generics";
import { testProjectData } from "./test-project-data";
import { isValid, type AssistantMode, type LLM } from "./project-types";
import { ChatPanel } from "../chat_panel/ChatPanel";
import { useMemo, useState } from "react";
import type { SelectedLLM } from "../chat/unsortedChatTypes";
import { useAddStreaming } from "../stream/useChatStreaming";

export function ProjectPane() {

  const streaming = useAddStreaming();

  const [chats, setChats] = useState(testProjectData.chats);
  const [settings, setSettings] = useState(testProjectData.settings);

  const setChat = usePatchEntry(setChats);

  const findChatById: Finder<Chat, string> = useFindById(chats);
  const findModeById: Finder<AssistantMode, string> = useFindById(
    settings.modes,
  );
  const findLLMById: Finder<LLM, string> = useFindById(settings.llms);

  const [openFolderPath, setOpenFolderPath] = useLocalStorageState(
    "openFolderPath",
    "",
  );

  console.log(JSON.stringify({ openFolderPath, setOpenFolderPath }));

  // TODO: Move somewhere else
  const [openChatId, setOpenChatId] = useState<string | null>("");

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
      }}
    >
      <ChatPanel openChatId={openChatId} setOpenChatId={setOpenChatId} />
    </ProjectContext>
  );
}

export default ProjectContext;

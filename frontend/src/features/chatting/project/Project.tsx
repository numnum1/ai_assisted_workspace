import { useState } from "react";
import { type Chat } from "../chat/Chat";
import ProjectContext from "./project-context";
import {
  useFindById,
  useLocalStorageState,
  usePatchEntry,
  type Finder,
} from "../../../utils/generics";
import { testProjectData } from "./test-project-data";
import type { AssistantMode, LLM } from "./project-types";
import { ChatPanel } from "../chat_panel/ChatPanel";

export function ProjectPane() {
  const [chats, setChats] = useState(testProjectData.chats);
  const [settings, setSettings] = useState(testProjectData.settings);

  const setChat = usePatchEntry(setChats);

  const findChatById: Finder<Chat, string> = useFindById(chats);
  const findModeById: Finder<AssistantMode, string> = useFindById(settings.modes);
  const findLLMById: Finder<LLM, string> = useFindById(settings.llms);

  const [openFolderPath, setOpenFolderPath] = useLocalStorageState(
    "openFolderPath",
    "",
  );

  console.log(JSON.stringify({ openFolderPath, setOpenFolderPath }));

  // TODO: Replace
  const [openChatId, setOpenChatId] = useState('')

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
      }}
    >
      <div
        data-component="ProjectPane"
        style={{
          display: "flex",
          flexDirection: "row",
          gap: "1rem",
          overflowX: "auto",
        }}
      >
        <ChatPanel openChatId={openChatId} setOpenChatId={setOpenChatId} />
      </div>
    </ProjectContext>
  );
}

export default ProjectContext;

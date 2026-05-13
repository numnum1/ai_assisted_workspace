import { useState } from "react";
import { ChatPane, type Chat } from "../chat/Chat";
import ProjectContext from "./project-context";
import {
  useFindById,
  useLocalStorageState,
  usePatchEntry,
  type Finder,
} from "../../../utils/generics";
import { testProjectData } from "./test-project-data";
import type { AssistantMode, LLM } from "./project-types";

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
        {chats.map((t) => (
          <div key={t.id} style={{ minWidth: "300px", flex: "1 1 0" }}>
            <ChatPane {...t} />
          </div>
        ))}
      </div>
    </ProjectContext>
  );
}

export default ProjectContext;

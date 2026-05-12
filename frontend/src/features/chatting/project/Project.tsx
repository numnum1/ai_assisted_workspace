import { useCallback } from "react";
import { ChatPane } from "../chat/Chat";
import type { ProjectViewModel } from "./useProject";

function ProjectPane({
  chats,
  settings,
  setSettings,
  setChat,
  findChatById,
  findModeById
}: ProjectViewModel) {

  const printSettings = useCallback(() => {
    console.log(JSON.stringify({setSettings, settings}))
  }, [settings, setSettings])

  return (
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
          <ChatPane {...t} setChat={setChat} findChatById={findChatById} findModeById={findModeById} />
        </div>
      ))}
    <button onClick={printSettings}>Print Settings</button>
    </div>
  );
}

export default ProjectPane;

import { ChatPane } from "../chat/Chat";
import type { ProjectViewModel } from "./useProject";

function ProjectPane({
  chats,
  settings,
  setSettings,
  setChat,
  findChatById,
}: ProjectViewModel) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "1rem",
        overflowX: "auto",
      }}
    >
      {chats.map((t) => (
        <div key={t.id} style={{ minWidth: "300px", flex: "1 1 0" }}>
          <ChatPane {...t} setChat={setChat} findChatById={findChatById} />
        </div>
      ))}
      <div>
        {JSON.stringify(settings)}
        {JSON.stringify(setSettings)}
      </div>
    </div>
  );
}

export default ProjectPane;

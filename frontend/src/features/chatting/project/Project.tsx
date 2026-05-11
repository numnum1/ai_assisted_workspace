import { ChatPane } from "../chat/Chat";
import type { ProjectViewModel } from "./useProject";

function ProjectPane({
    chats,
    settings,
    setSettings,
    setChat,
    findChatById
    }: ProjectViewModel) {
  return (
    <div>
      {
        chats.map((t) =>
          <ChatPane key={t.id} {...t} setChat={setChat} findChatById={findChatById} />
        )
      }
      <div>
        {JSON.stringify(settings)}
        {JSON.stringify(setSettings)}
      </div>
    </div>
  );
}

export default ProjectPane;
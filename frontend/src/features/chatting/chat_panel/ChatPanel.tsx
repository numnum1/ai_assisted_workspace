import { useContext, useMemo, useState } from "react";
import { ChatHistoryPanel } from "../chat/components/ChatHistoryPanel";
import ProjectContext from "../project/project-context";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { ChatPane, type Chat } from "../chat/Chat";

/**
 * This is NOT an open chat but a panel in which a chat can be opened!
 */
export function ChatPanel({ openChatId, setOpenChatId, onCreateNewChatClicked }: { openChatId: string, setOpenChatId: (newOpenChatId: string) => void, onCreateNewChatClicked: () => void }) {
  const { chats, setChat, findChatById } = useContext(ProjectContext);

  const openChat: Chat | null = useMemo(() => {
    return openChatId ? findChatById(openChatId) : null
  }, [findChatById, openChatId])

  console.log(JSON.stringify({openChatId, setOpenChatId, chats, setChat}))

  // #region Placeholders
  const [historyOpen] = useState(false);
  // #endregion

  return (
    <div className="chat-panel">
      <ChatPanelHeader
        onHistoryButtonClicked={() => console.log("History button clicked")}
        onNewChatButtonClicked={onCreateNewChatClicked}
      />

      {historyOpen && <ChatHistoryPanel />}

      <div className="chat-panel-body">
        { openChat && <ChatPane {...openChat!} /> }
      </div>
    </div>
  );
}

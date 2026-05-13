import { History, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { ChatHistoryPanel } from "../chat/components/ChatHistoryPanel";

export function ChatPanelSidebar({
  onNewChatButtonClicked,
}: {
  onNewChatButtonClicked: () => void;
}) {

  const [openChatHistory, setOpenChatHistory] = useState(false)
  const toggleHistoryButton = useCallback(() => {
    setOpenChatHistory((prev) => {
      return !prev
    })
  }, [setOpenChatHistory])

  return (
    <div className="chat-header chat-header--sidebar">
      <div className="chat-header-actions">
        <button
          className={`chat-history-btn ${openChatHistory ? "active" : ""}`}
          onClick={toggleHistoryButton}
          title="Chat-Historie"
        >
          <History size={14} />
        </button>
        <button
          type="button"
          onClick={onNewChatButtonClicked}
          className={"chat-history-new-btn"}
          title="Neuer Chat"
        >
          <Plus size={14} />
        </button>
        {
          openChatHistory && (
            <ChatHistoryPanel />
          )
        }
      </div>
    </div>
  );
}

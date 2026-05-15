import { History, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { ChatHistoryPane } from "./history/ChatHistoryPane";

export function ChatPanelSidebar({
  onNewChatButtonClicked,
}: {
  onNewChatButtonClicked: () => void;
}) {
  const [openChatHistory, setOpenChatHistory] = useState(false);
  const toggleHistoryButton = useCallback(() => {
    setOpenChatHistory((prev) => {
      return !prev;
    });
  }, [setOpenChatHistory]);

  return (
    <div className="chat-header chat-header--sidebar">
      <div
        className={
          openChatHistory ? "chat-sidebar-btn-row" : "chat-header-actions"
        }
      >
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
      </div>
      {openChatHistory && (
        <ChatHistoryPane onCloseClicked={() => setOpenChatHistory(false)} />
      )}
    </div>
  );
}

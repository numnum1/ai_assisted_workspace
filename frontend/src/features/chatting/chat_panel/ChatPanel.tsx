import {
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { ChatHistoryPanel } from "../chat/components/ChatHistoryPanel";
import ProjectContext from "../project/project-context";
import { ChatPane, NewChat, type Chat } from "../chat/Chat";
import { NewChatDialog } from "./NewChatDialog";
import { ChatPanelSidebar } from "./ChatPanelSidebar";

/**
 * This is NOT an open chat but a panel in which a chat can be opened!
 */
export function ChatPanel({
  openChatId,
  setOpenChatId,
}: {
  openChatId: string | null;
  setOpenChatId: (newOpenChatId: string | null) => void;
}) {
  const {
    setChats,
    findChatById,
    settings: { modes },
  } = useContext(ProjectContext);

  const openChat: Chat | null = useMemo(() => {
    return openChatId ? findChatById(openChatId) : null;
  }, [findChatById, openChatId]);

  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const handleCreateNewChatClicked = useCallback(() => {
    setNewChatDialogOpen((prev) => {
      return !prev;
    });
  }, [setNewChatDialogOpen]);

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((chat) => chat.id !== id));
      setOpenChatId(null);
    },
    [setChats, setOpenChatId],
  );

  // New Event Chat
  const handleConfirmedClickedInNewEventChat = useCallback(
    (newChatName: string, keepOld: boolean) => {
      const firstMode: string | null = modes.length > 0 ? modes[0].id : null;
      const newChat = NewChat(null, newChatName, firstMode);
      setChats((prev) => {
        let newArray;
        if (keepOld) {
          newArray = [...prev, newChat];
        } else {
          newArray = [...prev, newChat].filter(
            (chat) => chat.id !== openChatId,
          );
        }

        return newArray;
      });
      setOpenChatId(newChat.id);
      setNewChatDialogOpen(false);
    },
    [setChats, setNewChatDialogOpen, openChatId, setOpenChatId, modes],
  );

  const handleCancelClickedInNewEventChat = useCallback(() => {
    setNewChatDialogOpen(false);
  }, [setNewChatDialogOpen]);

  // #region Placeholders
  const [historyOpen] = useState(false);
  // #endregion

  return (
    <div style={{ height: "100%" }}>
      {newChatDialogOpen && (
        <NewChatDialog
          onConfirmClicked={handleConfirmedClickedInNewEventChat}
          onCancelClicked={handleCancelClickedInNewEventChat}
        />
      )}
      <div className="chat-panel">
        {historyOpen && <ChatHistoryPanel />}

        <div className="chat-panel-body">
          <div className="chat-panel-body-main">
            {openChat && <ChatPane {...openChat!} />}
          </div>

          <div className="chat-panel-body-right">
            <ChatPanelSidebar
              onNewChatButtonClicked={handleCreateNewChatClicked}
              onChatClicked={setOpenChatId}
              onDeleteClicked={deleteChat}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

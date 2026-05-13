import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type SetStateAction,
} from "react";
import { ChatHistoryPanel } from "../chat/components/ChatHistoryPanel";
import ProjectContext from "../project/project-context";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { ChatPane, NewChat, type Chat } from "../chat/Chat";
import { NewChatDialog } from "./NewChatDialog";

/**
 * This is NOT an open chat but a panel in which a chat can be opened!
 */
export function ChatPanel({
  openChatId,
  setOpenChatId,
  setChats,
}: {
  openChatId: string;
  setOpenChatId: (newOpenChatId: string) => void;
  setChats: React.Dispatch<SetStateAction<Chat[]>>;
}) {
  const { chats, setChat, findChatById, settings: {modes} } = useContext(ProjectContext);

  const openChat: Chat | null = useMemo(() => {
    return openChatId ? findChatById(openChatId) : null;
  }, [findChatById, openChatId]);

  console.log(JSON.stringify({ openChatId, setOpenChatId, chats, setChat }));

  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const handleCreateNewChatClicked = useCallback(() => {
    setNewChatDialogOpen((prev) => {
      return !prev;
    });
  }, [setNewChatDialogOpen]);

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
    <div>
      {newChatDialogOpen && (
        <NewChatDialog
          onConfirmClicked={handleConfirmedClickedInNewEventChat}
          onCancelClicked={handleCancelClickedInNewEventChat}
        />
      )}
      <div className="chat-panel">
        <ChatPanelHeader
          onHistoryButtonClicked={() => console.log("History button clicked")}
          onNewChatButtonClicked={handleCreateNewChatClicked}
        />

        {historyOpen && <ChatHistoryPanel />}

        <div className="chat-panel-body">
          {openChat && <ChatPane {...openChat!} />}
        </div>
      </div>
    </div>
  );
}

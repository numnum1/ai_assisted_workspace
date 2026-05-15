import { useCallback, useContext, useState, useRef } from "react";
import ProjectContext from "../../project/project-context.ts";
import { ChatHistoryEntry } from "./ChatHistoryEntry.tsx";

export function ChatHistoryPane({
  onCloseClicked,
  onChatClicked,
  onDeleteClicked
}: {
  onCloseClicked: () => void;
  onChatClicked: (chatId: string) => void;
  onDeleteClicked: (chatId: string) => void;
}) {
  const { chats, setChat } = useContext(ProjectContext);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  const renameChat = useCallback(
    (id: string, newName: string) => {
      setChat(id, { name: newName });
    },
    [setChat],
  );

  const handleStartRename = (
    chat: { id: string; name: string },
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setEditingId(chat.id);
    setEditTitle(chat.name);
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      renameChat(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setEditingId(null);
  };

  const filteredChats = chats.filter((chat) =>
    chat.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="chat-history-pane">
      <div className="chat-history-header">
        <span className="chat-history-title">Chats</span>
        <button
          type="button"
          className="chat-history-close-btn"
          onClick={onCloseClicked}
        >
          ✕
        </button>
      </div>

      <div className="chat-history-search-row">
        <input
          className="chat-history-search"
          placeholder="Suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="chat-history-list">
        {filteredChats.length === 0 && (
          <div className="chat-history-empty">Keine Chats gefunden</div>
        )}
        {filteredChats.map((chat) => (
          <ChatHistoryEntry
            key={chat.id}
            chat={chat}
            editingId={editingId}
            editTitle={editTitle}
            editRef={editRef}
            setEditTitle={setEditTitle}
            commitRename={commitRename}
            handleKeyDown={handleKeyDown}
            onChatClicked={onChatClicked}
            handleStartRename={handleStartRename}
            deleteChat={onDeleteClicked}
          />
        ))}
      </div>
    </div>
  );
}

import { useCallback, useContext, useState, useRef } from "react";
import { Trash2, MessageSquare, Pencil } from "lucide-react";
import ProjectContext from "../../project/project-context.ts";

export function ChatHistoryPane({
  onCloseClicked,
}: {
  onCloseClicked: () => void;
}) {
  const { chats, setChat, setChats } = useContext(ProjectContext);
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

  const deleteChat = useCallback(
    (id: string) => {
      setChats((prev) => prev.filter((chat) => chat.id !== id));
    },
    [setChats],
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
    <div className="chat-history-panel">
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
          <div key={chat.id} className="chat-history-item">
            <div className="chat-history-item-icon">
              <MessageSquare size={14} />
            </div>

            <div className="chat-history-item-content">
              {editingId === chat.id ? (
                <input
                  ref={editRef}
                  className="chat-history-rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  className="chat-history-item-title"
                  onDoubleClick={(e) => handleStartRename(chat, e)}
                >
                  <span>{chat.name}</span>
                </div>
              )}
            </div>

            <div className="chat-history-item-actions">
              <button
                type="button"
                className="chat-history-action-btn"
                onClick={(e) => handleStartRename(chat, e)}
                title="Umbenennen"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                className="chat-history-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                title="Löschen"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

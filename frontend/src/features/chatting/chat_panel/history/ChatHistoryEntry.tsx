import { MessageSquare, Pencil, Trash2 } from "lucide-react";

interface Chat {
  id: string;
  name: string;
}

export function ChatHistoryEntry({
  chat,
  editingId,
  editTitle,
  editRef,
  setEditTitle,
  commitRename,
  handleKeyDown,
  onChatClicked,
  handleStartRename,
  deleteChat,
}: {
  chat: Chat;
  editingId: string | null;
  editTitle: string;
  editRef: React.RefObject<HTMLInputElement | null>;
  setEditTitle: (title: string) => void;
  commitRename: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  onChatClicked: (chatId: string) => void;
  handleStartRename: (chat: Chat, e: React.MouseEvent) => void;
  deleteChat: (id: string) => void;
}) {
  return (
    <div className="chat-history-item">
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
            onClick={() => onChatClicked(chat.id)}
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
  );
}

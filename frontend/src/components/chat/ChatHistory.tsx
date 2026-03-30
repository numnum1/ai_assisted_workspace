import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, MessageSquare, X } from 'lucide-react';
import type { Conversation } from '../../types.ts';

interface ChatHistoryProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onClose,
}: ChatHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleDoubleClick = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="chat-history-panel">
      <div className="chat-history-header">
        <span className="chat-history-title">Chat-Historie</span>
        <div className="chat-history-header-actions">
          <button className="chat-history-new-btn" onClick={onCreate} title="Neuer Chat">
            <Plus size={14} />
          </button>
          <button className="chat-history-close-btn" onClick={onClose} title="Schliessen">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="chat-history-list">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`chat-history-item ${conv.id === activeId ? 'active' : ''}`}
            onClick={() => {
              onSelect(conv.id);
              onClose();
            }}
            onDoubleClick={() => handleDoubleClick(conv)}
          >
            <div className="chat-history-item-icon">
              <MessageSquare size={14} />
            </div>
            <div className="chat-history-item-content">
              {editingId === conv.id ? (
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
                <div className="chat-history-item-title">{conv.title}</div>
              )}
              <div className="chat-history-item-meta">
                {conv.messages.length} Nachrichten · {formatDate(conv.updatedAt)}
              </div>
            </div>
            <button
              className="chat-history-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              title="Chat loeschen"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

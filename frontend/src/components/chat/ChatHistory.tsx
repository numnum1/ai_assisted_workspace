import { useState, useRef, useEffect } from 'react';
import { Trash2, MessageSquare, X, Pencil, FolderInput, FolderCheck, Eraser } from 'lucide-react';
import type { ChatSessionKind, Conversation } from '../../types.ts';
import { NewChatButton } from './NewChatButton.tsx';

interface ChatHistoryProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (sessionKind?: ChatSessionKind) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onToggleSavedToProject: (id: string) => void;
  onClearAllBrowserChats?: () => void;
  clearAllBrowserDisabled?: boolean;
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

function groupByDate(convs: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = Date.now();
  const day = 86_400_000;
  const groupDefs = [
    { label: 'Heute',       test: (t: number) => now - t < day },
    { label: 'Gestern',     test: (t: number) => now - t >= day && now - t < 2 * day },
    { label: 'Diese Woche', test: (t: number) => now - t >= 2 * day && now - t < 7 * day },
    { label: 'Älter',       test: (t: number) => now - t >= 7 * day },
  ];
  const result: { label: string; items: Conversation[] }[] = [];
  for (const g of groupDefs) {
    const matched = convs.filter((c) => g.test(c.updatedAt));
    if (matched.length > 0) result.push({ label: g.label, items: matched });
  }
  return result;
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onToggleSavedToProject,
  onClearAllBrowserChats,
  clearAllBrowserDisabled = true,
  onClose,
}: ChatHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [filterText, setFilterText] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (conv: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  const filtered = filterText.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(filterText.toLowerCase()))
    : conversations;

  const groups = groupByDate(filtered);

  return (
    <div className="chat-history-panel">
      <div className="chat-history-header">
        <span className="chat-history-title">Chat-Historie</span>
        <div className="chat-history-header-actions">
          {onClearAllBrowserChats && (
            <button
              type="button"
              className="chat-history-clear-all-btn"
              disabled={clearAllBrowserDisabled}
              onClick={() => {
                if (
                  !window.confirm(
                    'Alle rein lokalen Chats dieses Projekts löschen?\n\n' +
                      'Chats mit aktivem „Im Projekt speichern“ (Ordner-Häkchen) bleiben erhalten — in der Liste, im Browser und in .assistant/chat-history.json.',
                  )
                ) {
                  return;
                }
                onClearAllBrowserChats();
              }}
              title="Nur lokale Chats löschen (projektgespeicherte behalten)"
            >
              <Eraser size={14} />
            </button>
          )}
          <NewChatButton onClick={() => onCreate('standard')} />
          <button type="button" className="chat-history-close-btn" onClick={onClose} title="Schliessen">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="chat-history-search-row">
        <input
          className="chat-history-search"
          placeholder="Suchen…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      <div className="chat-history-list">
        {groups.length === 0 && (
          <div className="chat-history-empty">Keine Chats gefunden.</div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="chat-history-group-label">{group.label}</div>
            {group.items.map((conv) => (
              <div
                key={conv.id}
                className={`chat-history-item ${conv.id === activeId ? 'active' : ''}`}
                onClick={() => {
                  if (editingId === conv.id) return;
                  onSelect(conv.id);
                  onClose();
                }}
                onDoubleClick={(e) => handleStartRename(conv, e)}
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
                    <div className="chat-history-item-title">
                      <span>{conv.title}</span>
                      {conv.sessionKind === 'guided' && (
                        <span className="chat-history-guided-badge" title="Geführte Sitzung">
                          Geführt
                        </span>
                      )}
                    </div>
                  )}
                  <div className="chat-history-item-meta">
                    {conv.messages.filter((m) => !m.hidden).length} Nachrichten · {formatDate(conv.updatedAt)}
                  </div>
                </div>
                <div className="chat-history-item-actions">
                  <button
                    type="button"
                    className={`chat-history-action-btn ${conv.savedToProject ? 'chat-history-saved-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSavedToProject(conv.id);
                    }}
                    title={
                      conv.savedToProject
                        ? 'Aus Projektdatei entfernen (nicht mehr per Git synchron)'
                        : 'Im Projekt speichern (.assistant/chat-history.json)'
                    }
                  >
                    {conv.savedToProject ? <FolderCheck size={12} /> : <FolderInput size={12} />}
                  </button>
                  <button
                    type="button"
                    className="chat-history-action-btn"
                    onClick={(e) => handleStartRename(conv, e)}
                    title="Umbenennen"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
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
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

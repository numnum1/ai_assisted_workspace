import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import type { MouseEvent, KeyboardEvent } from "react";
import {
  Trash2,
  MessageSquare,
  X,
  Pencil,
  FolderInput,
  FolderCheck,
  Eraser,
  ChevronRight,
  ChevronDown,
  Download,
} from "lucide-react";
import type { ChatSessionKind, Conversation } from "../../types.ts";
import { NewChatButton } from "./NewChatButton.tsx";
import {
  conversationToMarkdown,
  downloadMarkdownFile,
} from "./chatMarkdownExport.ts";

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
  /** Project setting `extraFeatures.chatDownload` */
  chatDownloadEnabled?: boolean;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return `Vor ${diffDays} Tagen`;
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function groupByDate(
  convs: Conversation[],
): { label: string; items: Conversation[] }[] {
  const now = Date.now();
  const day = 86_400_000;
  const groupDefs = [
    { label: "Heute", test: (t: number) => now - t < day },
    {
      label: "Gestern",
      test: (t: number) => now - t >= day && now - t < 2 * day,
    },
    {
      label: "Diese Woche",
      test: (t: number) => now - t >= 2 * day && now - t < 7 * day,
    },
    { label: "Älter", test: (t: number) => now - t >= 7 * day },
  ];
  const result: { label: string; items: Conversation[] }[] = [];
  for (const g of groupDefs) {
    const matched = convs.filter((c) => g.test(c.updatedAt));
    if (matched.length > 0) result.push({ label: g.label, items: matched });
  }
  return result;
}

function partitionConversations(conversations: Conversation[]) {
  const roots = conversations.filter((c) => !c.isThread);
  const threadsByParent = new Map<string, Conversation[]>();
  for (const t of conversations.filter((c) =>
    Boolean(c.isThread && c.parentConversationId),
  )) {
    const pid = t.parentConversationId!;
    if (!threadsByParent.has(pid)) threadsByParent.set(pid, []);
    threadsByParent.get(pid)!.push(t);
  }
  for (const arr of threadsByParent.values()) {
    arr.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return { roots, threadsByParent };
}

function titleMatches(conv: Conversation, qLower: string): boolean {
  return conv.title.toLowerCase().includes(qLower);
}

/**
 * Recursively collects all descendants of a parentId, including threads of threads.
 */
function getAllDescendants(
  threadsByParent: Map<string, Conversation[]>,
  parentId: string,
  result: Conversation[] = [],
): Conversation[] {
  const children = threadsByParent.get(parentId) ?? [];
  for (const child of children) {
    result.push(child);
    getAllDescendants(threadsByParent, child.id, result);
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
  chatDownloadEnabled = false,
  onClose,
}: ChatHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [filterText, setFilterText] = useState("");
  /** User toggled chevrons only; see {@link expandedParentIds} for merged view. */
  const [userExpandedParentIds, setUserExpandedParentIds] = useState<
    Set<string>
  >(() => new Set());
  const editRef = useRef<HTMLInputElement>(null);

  const { roots, threadsByParent } = useMemo(
    () => partitionConversations(conversations),
    [conversations],
  );

  const filteredRoots = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return roots;
    return roots.filter((r) => {
      if (titleMatches(r, q)) return true;
      const allKids = getAllDescendants(threadsByParent, r.id);
      return allKids.some((t) => titleMatches(t, q));
    });
  }, [roots, threadsByParent, filterText]);

  const groups = useMemo(() => groupByDate(filteredRoots), [filteredRoots]);

  /** User toggles + auto-expand parent of active thread + search hits only on thread titles. */
  const expandedParentIds = useMemo(() => {
    const next = new Set(userExpandedParentIds);
    const active = conversations.find((c) => c.id === activeId);
    if (active?.isThread && active.parentConversationId) {
      next.add(active.parentConversationId);
    }
    const q = filterText.trim().toLowerCase();
    if (q) {
      for (const r of roots) {
        const allKids = getAllDescendants(threadsByParent, r.id);
        const threadHit = allKids.some((t) => titleMatches(t, q));
        const rootHit = titleMatches(r, q);
        if (threadHit && !rootHit) next.add(r.id);
      }
    }
    return next;
  }, [
    userExpandedParentIds,
    activeId,
    conversations,
    filterText,
    roots,
    threadsByParent,
  ]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = useCallback(
    (conv: Conversation, e?: MouseEvent) => {
      e?.stopPropagation();
      setEditingId(conv.id);
      setEditTitle(conv.title);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (editingId && editTitle.trim()) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  }, [editingId, editTitle, onRename]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        commitRename();
      } else if (e.key === "Escape") {
        setEditingId(null);
      }
    },
    [commitRename],
  );

  const toggleParentExpanded = useCallback(
    (parentId: string, e: MouseEvent) => {
      e.stopPropagation();
      setUserExpandedParentIds((prev) => {
        const next = new Set(prev);
        if (next.has(parentId)) next.delete(parentId);
        else next.add(parentId);
        return next;
      });
    },
    [],
  );

  const childThreadsFor = useCallback(
    (parentId: string) => threadsByParent.get(parentId) ?? [],
    [threadsByParent],
  );

  /**
   * Recursive component to render a thread and all its nested descendants.
   */
  const renderThreadWithChildren = (
    thread: Conversation,
    indentLevel: number,
  ): ReactNode => {
    const isChild = indentLevel > 0;
    const itemClass =
      `chat-history-item ${thread.id === activeId ? "active" : ""}` +
      (isChild ? " chat-history-thread-child" : "");

    const grandkids = childThreadsFor(thread.id);
    const hasKids = grandkids.length > 0;

    return (
      <div key={thread.id} className="chat-history-thread-node">
        <div
          className={itemClass}
          onClick={() => {
            if (editingId === thread.id) return;
            onSelect(thread.id);
            onClose();
          }}
          onDoubleClick={(e) => handleStartRename(thread, e)}
        >
          <span
            className="chat-history-chevron-spacer"
            style={{ width: `${indentLevel * 16}px` }}
            aria-hidden
          />
          <div className="chat-history-item-icon">
            <MessageSquare size={14} />
          </div>
          <div className="chat-history-item-content">
            {editingId === thread.id ? (
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
                <span>{thread.title}</span>
                {isChild ? (
                  <span className="chat-history-thread-badge" title="Thread">
                    Thread
                  </span>
                ) : null}
                {thread.sessionKind === "guided" && (
                  <span
                    className="chat-history-guided-badge"
                    title="Geführte Sitzung"
                  >
                    Geführt
                  </span>
                )}
              </div>
            )}
            <div className="chat-history-item-meta">
              {thread.messages.filter((m) => !m.hidden).length} Nachrichten ·{" "}
              {formatDate(thread.updatedAt)}
            </div>
          </div>
          <div className="chat-history-item-actions">
            <span
              className="chat-history-action-btn"
              style={{ visibility: "hidden" }}
              aria-hidden
            >
              <FolderInput size={12} />
            </span>
            {chatDownloadEnabled && (
              <button
                type="button"
                className="chat-history-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadMarkdownFile(
                    thread.title,
                    conversationToMarkdown(thread),
                  );
                }}
                title="Chat als Markdown herunterladen"
              >
                <Download size={12} />
              </button>
            )}
            <button
              type="button"
              className="chat-history-action-btn"
              onClick={(e) => handleStartRename(thread, e)}
              title="Umbenennen"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="chat-history-delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(thread.id);
              }}
              title="Chat loeschen"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {hasKids && (
          <div className="chat-history-thread-children">
            {grandkids.map((t: Conversation) =>
              renderThreadWithChildren(t, indentLevel + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRow = (
    conv: Conversation,
    options: {
      variant: "root" | "thread" | "orphan";
      chevron?: ReactNode;
    },
  ) => {
    const { variant, chevron } = options;
    const isChild = variant === "thread";
    const itemClass =
      `chat-history-item ${conv.id === activeId ? "active" : ""}` +
      (isChild ? " chat-history-thread-child" : "") +
      (variant === "orphan" ? " chat-history-thread-orphan" : "");

    return (
      <div
        className={itemClass}
        onClick={() => {
          if (editingId === conv.id) return;
          onSelect(conv.id);
          onClose();
        }}
        onDoubleClick={(e) => handleStartRename(conv, e)}
      >
        {chevron ?? (
          <span className="chat-history-chevron-spacer" aria-hidden />
        )}
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
              {isChild || variant === "orphan" ? (
                <span className="chat-history-thread-badge" title="Thread">
                  Thread
                </span>
              ) : null}
              {conv.sessionKind === "guided" && (
                <span
                  className="chat-history-guided-badge"
                  title="Geführte Sitzung"
                >
                  Geführt
                </span>
              )}
            </div>
          )}
          <div className="chat-history-item-meta">
            {conv.messages.filter((m) => !m.hidden).length} Nachrichten ·{" "}
            {formatDate(conv.updatedAt)}
          </div>
        </div>
        <div className="chat-history-item-actions">
          {variant === "root" ? (
            <button
              type="button"
              className={`chat-history-action-btn ${conv.savedToProject ? "chat-history-saved-active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSavedToProject(conv.id);
              }}
              title={
                conv.savedToProject
                  ? "Aus Projektdatei entfernen (nicht mehr per Git synchron)"
                  : "Im Projekt speichern (.assistant/chat-history.json)"
              }
            >
              {conv.savedToProject ? (
                <FolderCheck size={12} />
              ) : (
                <FolderInput size={12} />
              )}
            </button>
          ) : (
            <span
              className="chat-history-action-btn"
              style={{ visibility: "hidden" }}
              aria-hidden
            >
              <FolderInput size={12} />
            </span>
          )}
          {chatDownloadEnabled && (
            <button
              type="button"
              className="chat-history-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                downloadMarkdownFile(conv.title, conversationToMarkdown(conv));
              }}
              title="Chat als Markdown herunterladen"
            >
              <Download size={12} />
            </button>
          )}
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
    );
  };

  const listEmpty = groups.length === 0;

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
                    "Alle rein lokalen Chats dieses Projekts löschen?\n\n" +
                      "Chats mit aktivem „Im Projekt speichern“ (Ordner-Häkchen) bleiben erhalten — in der Liste, im Browser und in .assistant/chat-history.json.",
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
          <NewChatButton onClick={() => onCreate("standard")} />
          <button
            type="button"
            className="chat-history-close-btn"
            onClick={onClose}
            title="Schliessen"
          >
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
        {listEmpty && (
          <div className="chat-history-empty">Keine Chats gefunden.</div>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="chat-history-group-label">{group.label}</div>
            {group.items.map((conv) => {
              const kids = childThreadsFor(conv.id);
              const hasKids = kids.length > 0;
              const expanded = expandedParentIds.has(conv.id);
              const chevron = hasKids ? (
                <button
                  type="button"
                  className="chat-history-chevron-btn"
                  title={expanded ? "Threads einklappen" : "Threads aufklappen"}
                  onClick={(e) => toggleParentExpanded(conv.id, e)}
                >
                  {expanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              ) : (
                <span className="chat-history-chevron-spacer" aria-hidden />
              );

              return (
                <div key={conv.id} className="chat-history-parent-block">
                  {renderRow(conv, { variant: "root", chevron })}
                  {hasKids && expanded && (
                    <div className="chat-history-thread-children">
                      {kids.map((t: Conversation) =>
                        renderThreadWithChildren(t, 1),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

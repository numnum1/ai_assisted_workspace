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

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(DATE_LOCALE, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return DATE_LABEL_YESTERDAY;
  if (diffDays < 7)
    return DATE_LABEL_DAYS_AGO_TEMPLATE.replace("{{days}}", String(diffDays));
  return date.toLocaleDateString(DATE_LOCALE, {
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
    { label: GROUP_LABEL_TODAY, test: (t: number) => now - t < day },
    {
      label: GROUP_LABEL_YESTERDAY,
      test: (t: number) => now - t >= day && now - t < 2 * day,
    },
    {
      label: GROUP_LABEL_THIS_WEEK,
      test: (t: number) => now - t >= 2 * day && now - t < 7 * day,
    },
    { label: GROUP_LABEL_OLDER, test: (t: number) => now - t >= 7 * day },
  ];
  const result: { label: string; items: Conversation[] }[] = [];
  for (const g of groupDefs) {
    const matched = convs.filter((c) => g.test(c.updatedAt));
    if (matched.length > 0) result.push({ label: g.label, items: matched });
  }
  return result;
}

function partitionConversations(conversations: Conversation[]) {
  const roots = conversations.filter((c) => !c.isThread && !c.isClosed);
  const threadsByParent = new Map<string, Conversation[]>();
  for (const t of conversations.filter((c) =>
    Boolean(c.isThread && c.parentConversationId && !c.isClosed),
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

export function ChatHistoryPane({
  onCloseClicked,
  renameChat
}: {
  onCloseClicked: () => void;
  renameChat: (id: string, newName: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [filterText, setFilterText] = useState("");
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
            onCloseClicked();
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
                  <span
                    className="chat-history-thread-badge"
                    title={THREAD_BADGE_TITLE}
                  >
                    {THREAD_BADGE_LABEL}
                  </span>
                ) : null}
                {thread.sessionKind === GUIDED_SESSION_KIND && (
                  <span
                    className="chat-history-guided-badge"
                    title={GUIDED_BADGE_TITLE}
                  >
                    {GUIDED_BADGE_LABEL}
                  </span>
                )}
              </div>
            )}
            <div className="chat-history-item-meta">
              {thread.messages.filter((m) => !m.hidden).length}{" "}
              {MESSAGES_SUFFIX} · {formatDate(thread.updatedAt)}
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
                title={BTN_TITLE_DOWNLOAD}
              >
                <Download size={12} />
              </button>
            )}
            <button
              type="button"
              className="chat-history-action-btn"
              onClick={(e) => handleStartRename(thread, e)}
              title={BTN_TITLE_RENAME}
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
              title={BTN_TITLE_DELETE}
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
                <span
                  className="chat-history-thread-badge"
                  title={THREAD_BADGE_TITLE}
                >
                  {THREAD_BADGE_LABEL}
                </span>
              ) : null}
              {conv.sessionKind === GUIDED_SESSION_KIND && (
                <span
                  className="chat-history-guided-badge"
                  title={GUIDED_BADGE_TITLE}
                >
                  {GUIDED_BADGE_LABEL}
                </span>
              )}
            </div>
          )}
          <div className="chat-history-item-meta">
            {conv.messages.filter((m) => !m.hidden).length} {MESSAGES_SUFFIX} ·{" "}
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
                  ? BTN_TITLE_REMOVE_FROM_PROJECT
                  : BTN_TITLE_SAVE_TO_PROJECT
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
              title={BTN_TITLE_DOWNLOAD}
            >
              <Download size={12} />
            </button>
          )}
          <button
            type="button"
            className="chat-history-action-btn"
            onClick={(e) => handleStartRename(conv, e)}
            title={BTN_TITLE_RENAME}
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
            title={BTN_TITLE_DELETE}
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
        <span className="chat-history-title">{PANEL_TITLE}</span>
        <div className="chat-history-header-actions">
          {onClearAllBrowserChats && (
            <button
              type="button"
              className="chat-history-clear-all-btn"
              disabled={clearAllBrowserDisabled}
              onClick={() => {
                if (!window.confirm(CLEAR_ALL_CONFIRM_MESSAGE)) {
                  return;
                }
                onClearAllBrowserChats();
              }}
              title={BTN_TITLE_CLEAR_ALL}
            >
              <Eraser size={14} />
            </button>
          )}
          <NewChatButton onClick={() => onCreate(DEFAULT_SESSION_KIND)} />
          <button
            type="button"
            className="chat-history-close-btn"
            onClick={onClose}
            title={BTN_TITLE_CLOSE}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="chat-history-search-row">
        <input
          className="chat-history-search"
          placeholder={SEARCH_PLACEHOLDER}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      <div className="chat-history-list">
        {listEmpty && (
          <div className="chat-history-empty">{EMPTY_STATE_LABEL}</div>
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
                  title={
                    expanded
                      ? BTN_TITLE_COLLAPSE_THREADS
                      : BTN_TITLE_EXPAND_THREADS
                  }
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

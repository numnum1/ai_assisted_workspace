import { useMemo } from "react";
import type { Conversation } from "../../types.ts";
import {
  buildConversationById,
  listThreadsForRoot,
  resolveThreadBranchRootId,
} from "./chatHistoryUtils.ts";

export interface ChatThreadsRailProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSwitchChat: (id: string) => void;
}

/**
 * Full-height thread list for the chat column (left of {@link ChatPanel}).
 * Shown only when the active branch has at least one thread off the root.
 */
export function ChatThreadsRail({
  conversations,
  activeConversationId,
  onSwitchChat,
}: ChatThreadsRailProps) {
  const threadRail = useMemo(() => {
    const byId = buildConversationById(conversations);
    const activeConv = byId.get(activeConversationId);
    const rootId = resolveThreadBranchRootId(activeConv);
    if (!rootId) {
      return {
        showRail: false,
        rootConv: null as Conversation | null,
        threads: [] as Conversation[],
      };
    }
    const rootConv = byId.get(rootId) ?? null;
    if (!rootConv || rootConv.isThread) {
      return { showRail: false, rootConv, threads: [] as Conversation[] };
    }
    const threads = listThreadsForRoot(conversations, rootId);
    return {
      showRail: threads.length >= 1,
      rootConv,
      threads,
    };
  }, [conversations, activeConversationId]);

  const threadsRailRoot =
    threadRail.showRail && threadRail.rootConv ? threadRail.rootConv : null;

  if (!threadsRailRoot) return null;

  return (
    <aside className="chat-threads-rail" aria-label="Threads">
      <div className="chat-threads-rail-header">Threads</div>
      <div className="chat-threads-rail-list">
        <button
          type="button"
          className={`chat-threads-rail-item${threadsRailRoot.id === activeConversationId ? " active" : ""}`}
          onClick={() => onSwitchChat(threadsRailRoot.id)}
          title={threadsRailRoot.title}
        >
          <span className="chat-threads-rail-item-meta">Haupt-Chat</span>
          <span className="chat-threads-rail-item-title">
            {threadsRailRoot.title}
          </span>
        </button>
        {threadRail.threads.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chat-threads-rail-item${t.id === activeConversationId ? " active" : ""}`}
            onClick={() => onSwitchChat(t.id)}
            title={t.title}
          >
            <span className="chat-threads-rail-item-meta">Thread</span>
            <span className="chat-threads-rail-item-title">{t.title}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

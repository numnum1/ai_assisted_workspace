import { useState, useCallback, useEffect, useRef } from "react";
import type { ChatSessionKind, Conversation, ChatMessage } from "../types.ts";

const STORAGE_KEY = "chat-history";
const LAST_ACTIVE_STORAGE_KEY = "chat-history:lastActive";

const MAX_CONVERSATIONS = 50;
const SAVE_DEBOUNCE_MS = 500;

function loadLastActiveChatId(): string | null {
  try {
    const raw = localStorage.getItem(LAST_ACTIVE_STORAGE_KEY);
    if (!raw?.trim()) return null;
    return raw.trim();
  } catch {
    return null;
  }
}

function saveLastActiveChatId(id: string | null) {
  try {
    if (!id?.trim()) {
      localStorage.removeItem(LAST_ACTIVE_STORAGE_KEY);
    } else {
      localStorage.setItem(LAST_ACTIVE_STORAGE_KEY, id.trim());
    }
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && !m.hidden);
  if (!firstUser) return "Neuer Chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}

function createEmptyConversation(
  mode: string,
  sessionKind: ChatSessionKind = "navi",
): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Neuer Chat",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode,
    sessionKind,
  };
}

function hasVisibleMessages(c: Conversation): boolean {
  if (c.messages.some((m) => !m.hidden)) return true;
  // Thread with only hidden parent bootstrap still counts as non-empty (do not drop tab).
  if (c.isThread && c.messages.length > 0) return true;
  return false;
}

function resolveActiveId(
  conversations: Conversation[],
  lastActiveId: string | null,
): string {
  if (lastActiveId && conversations.some((c) => c.id === lastActiveId)) {
    return lastActiveId;
  }
  return conversations[0].id;
}

function initialChatState(currentMode: string): {
  conversations: Conversation[];
  activeId: string;
} {
  const local = loadConversations().slice(0, MAX_CONVERSATIONS);
  if (local.length === 0) {
    const empty = createEmptyConversation(currentMode);
    return { conversations: [empty], activeId: empty.id };
  }
  return {
    conversations: local,
    activeId: resolveActiveId(local, loadLastActiveChatId()),
  };
}

export function useChatHistory(currentMode: string) {
  const [conversations, setConversations] = useState<Conversation[]>(
    () => initialChatState(currentMode).conversations,
  );
  const [activeId, setActiveId] = useState<string>(
    () => initialChatState(currentMode).activeId,
  );
  const hydrated = true;

  const currentModeRef = useRef(currentMode);
  currentModeRef.current = currentMode;

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    saveLastActiveChatId(activeId);
  }, [activeId]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConversations(conversationsRef.current);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [conversations]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveConversations(conversationsRef.current);
      saveLastActiveChatId(activeIdRef.current);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? conversations[0];

  useEffect(() => {
    setConversations((prev) => {
      if (prev.length !== 1) return prev;
      const c = prev[0];
      if (c.messages.length > 0) return prev;
      if (c.mode === currentMode) return prev;
      return [{ ...c, mode: currentMode }];
    });
  }, [currentMode]);

  const updateMessages = useCallback(
    (messages: ChatMessage[]) => {
      setConversations((prev) => {
        return prev.map((c) => {
          if (c.id !== activeId) return c;
          const title =
            c.title === "Neuer Chat" && messages.length > 0
              ? generateTitle(messages)
              : c.title;
          return { ...c, messages, title, updatedAt: Date.now() };
        });
      });
    },
    [activeId],
  );

  const updateMessagesForConversation = useCallback(
    (id: string, messages: ChatMessage[]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const title =
            c.title === "Neuer Chat" && messages.length > 0
              ? generateTitle(messages)
              : c.title;
          return { ...c, messages, title, updatedAt: Date.now() };
        }),
      );
    },
    [],
  );

  const appendMessageToConversation = useCallback(
    (id: string, message: ChatMessage) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            messages: [...c.messages, message],
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  // Special function for thread summaries: updates both parent and thread
  const summarizeThread = useCallback(
    (parentId: string, threadId: string, message: ChatMessage) => {
      setConversations((prev) => {
        const now = Date.now();
        return prev.map((c) => {
          if (c.id === parentId) {
            return {
              ...c,
              messages: [...c.messages, message],
              updatedAt: now,
            };
          }
          if (c.id === threadId) {
            return {
              ...c,
              updatedAt: now, // Mark thread as merged by updating its timestamp
            };
          }
          return c;
        });
      });
    },
    [],
  );

  const createConversation = useCallback(
    (
      mode?: string,
      initialMessages?: ChatMessage[],
      title?: string,
      sessionKind: ChatSessionKind = "navi",
    ) => {
      const newConv = createEmptyConversation(mode ?? currentMode, sessionKind);
      if (initialMessages && initialMessages.length > 0) {
        newConv.messages = initialMessages;
        newConv.title = title ?? generateTitle(initialMessages);
      } else if (title) {
        newConv.title = title;
      }
      setActiveId(newConv.id);
      setConversations((prev) => {
        const active = prev.find((c) => c.id === activeId);
        const dropEmptyActive =
          active !== undefined && !hasVisibleMessages(active);
        const withoutEmptyActive = dropEmptyActive
          ? prev.filter((c) => c.id !== activeId)
          : prev;
        const updated = [newConv, ...withoutEmptyActive];
        if (updated.length > MAX_CONVERSATIONS) {
          return updated.slice(0, MAX_CONVERSATIONS);
        }
        return updated;
      });
      return newConv;
    },
    [activeId, currentMode],
  );

  const patchConversation = useCallback(
    (id: string, patch: Partial<Conversation>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
        ),
      );
    },
    [],
  );

  /**
   * Merges snapshotId -> state pairs into the conversation's writeFileSettled map.
   * Used to persist accept/reject state for write_file changes so the
   * "Pending changes" bar does not reappear after an app restart.
   */
  const settleWriteFileSnapshots = useCallback(
    (conversationId: string, patch: Record<string, "applied" | "reverted">) => {
      if (Object.keys(patch).length === 0) return;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            writeFileSettled: { ...(c.writeFileSettled ?? {}), ...patch },
            updatedAt: Date.now(),
          };
        }),
      );
    },
    [],
  );

  /** Removes the active conversation (even if it has messages) and opens a new empty chat. */
  const discardActiveAndCreateConversation = useCallback(
    (mode?: string, sessionKind: ChatSessionKind = "navi") => {
      const newConv = createEmptyConversation(mode ?? currentMode, sessionKind);
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== activeId);
        let updated = [newConv, ...filtered];
        if (updated.length > MAX_CONVERSATIONS) {
          updated = updated.slice(0, MAX_CONVERSATIONS);
        }
        return updated;
      });
      setActiveId(newConv.id);
      return newConv;
    },
    [activeId, currentMode],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target) return prev;

        // Soft-delete for threads: mark as closed so they stay visible in the branch graph.
        // Exception: if no user messages were ever sent, hard-delete the thread entirely.
        if (target.isThread) {
          const hasUserMessages = target.messages.some(
            (m) => m.role === 'user' && !m.hidden,
          );
          if (activeId === id) {
            const fallback =
              target.parentConversationId ??
              prev.find((c) => !c.isThread && !c.isClosed)?.id;
            if (fallback) setActiveId(fallback);
          }
          if (!hasUserMessages) {
            return prev.filter((c) => c.id !== id);
          }
          return prev.map((c) =>
            c.id === id
              ? { ...c, isClosed: true as const, updatedAt: Date.now() }
              : c,
          );
        }

        // Hard-delete for root conversations (also removes their child threads)
        const idsToRemove = new Set<string>([id]);
        for (const c of prev) {
          if (c.isThread && c.parentConversationId === id) {
            idsToRemove.add(c.id);
          }
        }
        const filtered = prev.filter((c) => !idsToRemove.has(c.id));
        if (filtered.length === 0) {
          const newConv = createEmptyConversation(currentMode);
          setActiveId(newConv.id);
          return [newConv];
        }
        if (idsToRemove.has(activeId)) {
          setActiveId(filtered[0].id);
        }
        return filtered;
      });
    },
    [activeId, currentMode],
  );

  const switchConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, title: newTitle.trim() || c.title, updatedAt: Date.now() }
          : c,
      ),
    );
  }, []);

  /** Removes every chat and starts over with a single empty conversation. */
  const clearAllBrowserChats = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const newConv = createEmptyConversation(currentModeRef.current);
    setConversations([newConv]);
    setActiveId(newConv.id);
    conversationsRef.current = [newConv];
    saveConversations([newConv]);
  }, []);

  /**
   * Merges an imported list of conversations into the current state.
   * Conversations whose IDs already exist are skipped to avoid duplicates.
   */
  const importConversations = useCallback((imported: Conversation[]) => {
    if (!imported.length) return;
    setConversations((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const incoming = imported.filter((c) => !existingIds.has(c.id));
      if (!incoming.length) return prev;
      const merged = [...incoming, ...prev].slice(0, MAX_CONVERSATIONS);
      return merged;
    });
  }, []);

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    updateMessages,
    settleWriteFileSnapshots,
    updateMessagesForConversation,
    appendMessageToConversation,
    summarizeThread,
    createConversation,
    patchConversation,
    discardActiveAndCreateConversation,
    deleteConversation,
    switchConversation,
    renameConversation,
    clearAllBrowserChats,
    importConversations,
  };
}

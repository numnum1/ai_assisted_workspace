import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatSessionKind, Conversation, ChatMessage } from '../types.ts';
import { fetchProjectChatHistory, persistProjectChatHistory } from '../api.ts';
import { buildConversationById, effectiveSavedToProject } from '../components/chat/chatHistoryUtils.ts';

/** Pre–per-project keys: one list for all folders (migrated once into first opened project) */
const LEGACY_STORAGE_KEY = 'chat-history';

const MAX_CONVERSATIONS = 50;
const SAVE_DEBOUNCE_MS = 500;
const PROJECT_SAVE_DEBOUNCE_MS = 500;

/** Stable localStorage key per opened project root path */
export function chatHistoryStorageKey(projectPath: string): string | null {
  const p = projectPath?.trim();
  if (!p) return null;
  return `${LEGACY_STORAGE_KEY}:${p}`;
}

function lastActiveStorageKey(storageKey: string | null): string | null {
  if (!storageKey) return null;
  return `${storageKey}:lastActive`;
}

function loadLastActiveChatId(storageKey: string | null): string | null {
  const sub = lastActiveStorageKey(storageKey);
  if (!sub) return null;
  try {
    const raw = localStorage.getItem(sub);
    if (!raw?.trim()) return null;
    return raw.trim();
  } catch {
    return null;
  }
}

function saveLastActiveChatId(storageKey: string | null, id: string | null) {
  const sub = lastActiveStorageKey(storageKey);
  if (!sub) return;
  try {
    if (!id?.trim()) {
      localStorage.removeItem(sub);
    } else {
      localStorage.setItem(sub, id.trim());
    }
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadConversations(storageKey: string | null): Conversation[] {
  if (!storageKey) return [];
  try {
    let raw = localStorage.getItem(storageKey);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[], storageKey: string | null) {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user' && !m.hidden);
  if (!firstUser) return 'Neuer Chat';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length > 50 ? text.slice(0, 50) + '…' : text;
}

function createEmptyConversation(mode: string, sessionKind: ChatSessionKind = 'standard'): Conversation {
  const base: Conversation = {
    id: crypto.randomUUID(),
    title: 'Neuer Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode,
  };
  if (sessionKind === 'guided') {
    base.sessionKind = 'guided';
  }
  return base;
}

function hasVisibleMessages(c: Conversation): boolean {
  if (c.messages.some((m) => !m.hidden)) return true;
  // Thread with only hidden parent bootstrap still counts as non-empty (do not drop tab).
  if (c.isThread && c.messages.length > 0) return true;
  return false;
}

function resolveActiveId(conversations: Conversation[], lastActiveId: string | null): string {
  if (lastActiveId && conversations.some((c) => c.id === lastActiveId)) {
    return lastActiveId;
  }
  return conversations[0].id;
}

/** Merge project file (Git) with localStorage; project wins on id collision */
function mergeWithProject(
  projectChats: Conversation[] | null,
  currentMode: string,
  storageKey: string | null,
  lastActiveId: string | null,
): {
  conversations: Conversation[];
  activeId: string;
} {
  const local = loadConversations(storageKey);
  const projectList = projectChats ?? [];

  const byId = new Map<string, Conversation>();
  for (const c of projectList) {
    byId.set(c.id, { ...c, savedToProject: true });
  }
  for (const c of local) {
    if (!byId.has(c.id)) {
      byId.set(c.id, { ...c, savedToProject: c.savedToProject === true });
    }
  }

  let rest = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  rest = rest.slice(0, MAX_CONVERSATIONS);

  if (rest.length === 0) {
    const empty = createEmptyConversation(currentMode);
    return { conversations: [empty], activeId: empty.id };
  }

  return {
    conversations: rest,
    activeId: resolveActiveId(rest, lastActiveId),
  };
}

function initialChatState(projectPath: string, currentMode: string) {
  const key = chatHistoryStorageKey(projectPath);
  return mergeWithProject(null, currentMode, key, loadLastActiveChatId(key));
}

export function useChatHistory(currentMode: string, projectPath: string) {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    initialChatState(projectPath, currentMode).conversations,
  );
  const [activeId, setActiveId] = useState<string>(() =>
    initialChatState(projectPath, currentMode).activeId,
  );
  const [hydrated, setHydrated] = useState(false);

  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;

  const currentModeRef = useRef(currentMode);
  currentModeRef.current = currentMode;

  useEffect(() => {
    const key = chatHistoryStorageKey(projectPath);
    if (!key) {
      const nc = createEmptyConversation(currentModeRef.current);
      setConversations([nc]);
      setActiveId(nc.id);
      setHydrated(false);
      return;
    }

    const lastActive = loadLastActiveChatId(key);
    const localMerged = mergeWithProject(null, currentModeRef.current, key, lastActive);
    setConversations(localMerged.conversations);
    setActiveId(localMerged.activeId);
    setHydrated(false);

    let cancelled = false;
    (async () => {
      const project = await fetchProjectChatHistory();
      if (cancelled) return;
      const merged = mergeWithProject(
        project,
        currentModeRef.current,
        key,
        loadLastActiveChatId(key),
      );
      setConversations(merged.conversations);
      setActiveId(merged.activeId);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!hydrated) return;
    const key = chatHistoryStorageKey(projectPathRef.current);
    if (!key) return;
    saveLastActiveChatId(key, activeId);
  }, [hydrated, activeId, projectPath]);

  useEffect(() => {
    if (!hydrated) return;
    const key = chatHistoryStorageKey(projectPathRef.current);
    if (!key) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConversations(conversationsRef.current, key);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (projectTimerRef.current) clearTimeout(projectTimerRef.current);
    projectTimerRef.current = setTimeout(() => {
      persistProjectChatHistory(conversationsRef.current).catch((err) => {
        console.error('persistProjectChatHistory failed', err);
      });
    }, PROJECT_SAVE_DEBOUNCE_MS);

    return () => {
      if (projectTimerRef.current) clearTimeout(projectTimerRef.current);
    };
  }, [conversations, hydrated]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!hydrated) return;
      const key = chatHistoryStorageKey(projectPathRef.current);
      if (key) {
        saveConversations(conversationsRef.current, key);
        saveLastActiveChatId(key, activeIdRef.current);
      }
      void persistProjectChatHistory(conversationsRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hydrated]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? conversations[0];

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
            c.title === 'Neuer Chat' && messages.length > 0
              ? generateTitle(messages)
              : c.title;
          return { ...c, messages, title, updatedAt: Date.now() };
        });
      });
    },
    [activeId],
  );

  const createConversation = useCallback(
    (
      mode?: string,
      initialMessages?: ChatMessage[],
      title?: string,
      sessionKind: ChatSessionKind = 'standard',
    ) => {
      const newConv = createEmptyConversation(mode ?? currentMode, sessionKind);
      if (initialMessages && initialMessages.length > 0) {
        newConv.messages = initialMessages;
        newConv.title = title ?? generateTitle(initialMessages);
      } else if (title) {
        newConv.title = title;
      }
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
      setActiveId(newConv.id);
      return newConv;
    },
    [activeId, currentMode],
  );

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    );
  }, []);

  /** Removes the active conversation (even if it has messages) and opens a new empty chat. */
  const discardActiveAndCreateConversation = useCallback(
    (mode?: string, sessionKind: ChatSessionKind = 'standard') => {
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
        const deleted = prev.find((c) => c.id === id);
        const idsToRemove = new Set<string>([id]);
        if (deleted && !deleted.isThread) {
          for (const c of prev) {
            if (c.isThread && c.parentConversationId === id) {
              idsToRemove.add(c.id);
            }
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
        c.id === id ? { ...c, title: newTitle.trim() || c.title, updatedAt: Date.now() } : c,
      ),
    );
  }, []);

  const toggleSavedToProject = useCallback((id: string) => {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target?.isThread) return prev;
      return prev.map((c) =>
        c.id === id ? { ...c, savedToProject: !c.savedToProject, updatedAt: Date.now() } : c,
      );
    });
  }, []);

  /**
   * Removes only chats that are not pinned to the project file (`savedToProject`).
   * Pinned chats stay in state, localStorage, and `.assistant/chat-history.json`.
   */
  const clearAllBrowserChats = useCallback(() => {
    if (!hydrated) return;
    const key = chatHistoryStorageKey(projectPathRef.current);
    if (!key) return;
    if (projectTimerRef.current) {
      clearTimeout(projectTimerRef.current);
      projectTimerRef.current = null;
    }
    const newConv = createEmptyConversation(currentModeRef.current);
    const list = conversationsRef.current;
    const byId = buildConversationById(list);
    const pinned = list.filter((c) => effectiveSavedToProject(c, byId));
    const sortedPinned = [...pinned].sort((a, b) => b.updatedAt - a.updatedAt);
    const next = [newConv, ...sortedPinned].slice(0, MAX_CONVERSATIONS);
    setConversations(next);
    setActiveId(newConv.id);
    conversationsRef.current = next;
    saveConversations(next, key);
  }, [hydrated]);

  /**
   * Merges an imported list of conversations into the current state.
   * Conversations whose IDs already exist are skipped to avoid duplicates.
   * Imported conversations are not auto-pinned to the project file.
   */
  const importConversations = useCallback(
    (imported: Conversation[]) => {
      if (!imported.length) return;
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const incoming = imported
          .filter((c) => !existingIds.has(c.id))
          .map((c) => ({ ...c, savedToProject: false as const }));
        if (!incoming.length) return prev;
        const merged = [...incoming, ...prev].slice(0, MAX_CONVERSATIONS);
        return merged;
      });
    },
    [],
  );

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    updateMessages,
    createConversation,
    patchConversation,
    discardActiveAndCreateConversation,
    deleteConversation,
    switchConversation,
    renameConversation,
    toggleSavedToProject,
    clearAllBrowserChats,
    importConversations,
  };
}

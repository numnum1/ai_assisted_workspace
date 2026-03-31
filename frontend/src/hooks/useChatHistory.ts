import { useState, useCallback, useEffect, useRef } from 'react';
import type { Conversation, ChatMessage } from '../types.ts';
import { fetchProjectChatHistory, persistProjectChatHistory } from '../api.ts';

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
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Neuer Chat';
  const text = firstUser.content.trim().replace(/\s+/g, ' ');
  return text.length > 50 ? text.slice(0, 50) + '…' : text;
}

function createEmptyConversation(mode: string): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'Neuer Chat',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode,
  };
}

function hasVisibleMessages(c: Conversation): boolean {
  return c.messages.some((m) => !m.hidden);
}

/** Merge project file (Git) with localStorage; project wins on id collision */
function mergeWithProject(
  projectChats: Conversation[] | null,
  currentMode: string,
  storageKey: string | null,
): {
  conversations: Conversation[];
  activeId: string;
} {
  const local = loadConversations(storageKey);
  const newConv = createEmptyConversation(currentMode);
  const projectList = projectChats ?? [];

  if (projectList.length === 0) {
    const conversations = [newConv, ...local].slice(0, MAX_CONVERSATIONS);
    return { conversations, activeId: newConv.id };
  }

  const byId = new Map<string, Conversation>();
  for (const c of projectList) {
    byId.set(c.id, { ...c, savedToProject: true });
  }
  for (const c of local) {
    if (!byId.has(c.id)) {
      byId.set(c.id, { ...c, savedToProject: c.savedToProject === true });
    }
  }

  const rest = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  const conversations = [newConv, ...rest].slice(0, MAX_CONVERSATIONS);
  return { conversations, activeId: newConv.id };
}

export function useChatHistory(currentMode: string, projectPath: string) {
  const storageKey = chatHistoryStorageKey(projectPath);
  const syncInit = mergeWithProject(null, currentMode, storageKey);
  const [conversations, setConversations] = useState<Conversation[]>(syncInit.conversations);
  const [activeId, setActiveId] = useState<string>(syncInit.activeId);
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

    const placeholder = createEmptyConversation(currentModeRef.current);
    setConversations([placeholder]);
    setActiveId(placeholder.id);
    setHydrated(false);

    let cancelled = false;
    (async () => {
      const project = await fetchProjectChatHistory();
      if (cancelled) return;
      const merged = mergeWithProject(project, currentModeRef.current, key);
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
    (mode?: string, initialMessages?: ChatMessage[], title?: string) => {
      const newConv = createEmptyConversation(mode ?? currentMode);
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

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (filtered.length === 0) {
          const newConv = createEmptyConversation(currentMode);
          setActiveId(newConv.id);
          return [newConv];
        }
        if (id === activeId) {
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
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, savedToProject: !c.savedToProject, updatedAt: Date.now() } : c,
      ),
    );
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
    const pinned = conversationsRef.current.filter((c) => c.savedToProject === true);
    const sortedPinned = [...pinned].sort((a, b) => b.updatedAt - a.updatedAt);
    const next = [newConv, ...sortedPinned].slice(0, MAX_CONVERSATIONS);
    setConversations(next);
    setActiveId(newConv.id);
    conversationsRef.current = next;
    saveConversations(next, key);
  }, [hydrated]);

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    updateMessages,
    createConversation,
    deleteConversation,
    switchConversation,
    renameConversation,
    toggleSavedToProject,
    clearAllBrowserChats,
  };
}

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Conversation, ChatMessage } from '../types.ts';
import { fetchProjectChatHistory, persistProjectChatHistory } from '../api.ts';

const STORAGE_KEY = 'chat-history';
const MAX_CONVERSATIONS = 50;
const SAVE_DEBOUNCE_MS = 500;
const PROJECT_SAVE_DEBOUNCE_MS = 500;

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

/** Merge project file (Git) with localStorage; project wins on id collision */
function mergeWithProject(projectChats: Conversation[] | null, currentMode: string): {
  conversations: Conversation[];
  activeId: string;
} {
  const local = loadConversations();
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

export function useChatHistory(currentMode: string) {
  const syncInit = mergeWithProject(null, currentMode);
  const [conversations, setConversations] = useState<Conversation[]>(syncInit.conversations);
  const [activeId, setActiveId] = useState<string>(syncInit.activeId);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const project = await fetchProjectChatHistory();
      if (cancelled) return;
      const merged = mergeWithProject(project, currentMode);
      setConversations(merged.conversations);
      setActiveId(merged.activeId);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally once on mount: mode updates are handled by the empty-chat mode effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveConversations(conversationsRef.current);
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
      saveConversations(conversationsRef.current);
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
        const updated = [newConv, ...prev];
        if (updated.length > MAX_CONVERSATIONS) {
          return updated.slice(0, MAX_CONVERSATIONS);
        }
        return updated;
      });
      setActiveId(newConv.id);
      return newConv;
    },
    [currentMode],
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

  return {
    conversations,
    activeConversation,
    activeId,
    updateMessages,
    createConversation,
    deleteConversation,
    switchConversation,
    renameConversation,
    toggleSavedToProject,
  };
}

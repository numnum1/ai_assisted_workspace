import { useState, useCallback, useEffect, useRef } from 'react';
import type { Conversation, ChatMessage } from '../types.ts';

const STORAGE_KEY = 'chat-history';
const MAX_CONVERSATIONS = 50;

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

export function useChatHistory(currentMode: string) {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const loaded = loadConversations();
    if (loaded.length === 0) {
      return [createEmptyConversation(currentMode)];
    }
    return loaded;
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadConversations();
    return loaded.length > 0 ? loaded[0].id : conversations[0].id;
  });

  // Persist whenever conversations change
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Still save on initial if we created a default conversation
      if (conversations.length > 0) {
        saveConversations(conversations);
      }
      return;
    }
    saveConversations(conversations);
  }, [conversations]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? conversations[0];

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
    (mode?: string) => {
      const newConv = createEmptyConversation(mode ?? currentMode);
      setConversations((prev) => {
        const updated = [newConv, ...prev];
        // Enforce limit
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

  return {
    conversations,
    activeConversation,
    activeId,
    updateMessages,
    createConversation,
    deleteConversation,
    switchConversation,
    renameConversation,
  };
}

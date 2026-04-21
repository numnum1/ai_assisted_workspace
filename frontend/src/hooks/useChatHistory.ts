import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ChatSessionKind,
  Conversation,
  ChatMessage,
  ConversationMessage,
  UserConversationMessage,
  AssistantConversationMessage,
  ChatPart,
  ConversationPatch,
} from '../types.ts';
import { extractMessageText } from '../types.ts';
import { conversationsApi } from '../api.ts';

const MAX_CONVERSATIONS = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    mode,
  };
  if (sessionKind === 'guided') {
    base.sessionKind = 'guided';
  }
  return base;
}

function hasVisibleMessages(c: Conversation): boolean {
  for (const msg of c.messages) {
    if (msg.messageType === 'USER' || msg.messageType === 'ASSISTANT') return true;
  }
  if (c.isThread && c.messages.length > 0) return true;
  return false;
}

/**
 * Converts a streaming {@link ChatMessage[]} accumulation to {@link ConversationMessage[]}
 * for optimistic local-state updates.  The authoritative version comes from the backend
 * after each completed turn.
 */
export function chatMessagesToConversationMessages(messages: ChatMessage[]): ConversationMessage[] {
  const result: ConversationMessage[] = [];
  const nowSec = Math.floor(Date.now() / 1000);
  for (const msg of messages) {
    if (msg.role === 'user' && !msg.hidden) {
      const part: ChatPart = { type: 'CHAT', content: msg.content, status: 'COMPLETED' };
      const userMsg: UserConversationMessage = {
        messageType: 'USER',
        timestamp: nowSec,
        parts: [part],
        ...(msg.resolvedContent ? { resolvedContent: msg.resolvedContent } : {}),
      };
      result.push(userMsg);
    } else if (msg.role === 'assistant') {
      const part: ChatPart = { type: 'CHAT', content: msg.content, status: 'COMPLETED' };
      const assistantMsg: AssistantConversationMessage = {
        messageType: 'ASSISTANT',
        timestamp: nowSec,
        parts: [part],
      };
      result.push(assistantMsg);
    }
    // tool and system messages are not stored in the display model
  }
  return result;
}

/**
 * Converts {@link ConversationMessage[]} (backend format) back to a flat {@link ChatMessage[]}
 * suitable for display in the current UI components.
 */
export function conversationMessagesToDisplay(messages: ConversationMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.messageType === 'USER') {
      return {
        role: 'user' as const,
        content: extractMessageText(msg),
        resolvedContent: msg.resolvedContent,
      };
    } else {
      return {
        role: 'assistant' as const,
        content: extractMessageText(msg),
      };
    }
  });
}

function resolveActiveId(conversations: Conversation[], preferredId: string | null): string {
  if (preferredId && conversations.some((c) => c.id === preferredId)) {
    return preferredId;
  }
  return conversations[0]?.id ?? '';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatHistory(currentMode: string, projectPath: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [hydrated, setHydrated] = useState(false);

  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const currentModeRef = useRef(currentMode);
  currentModeRef.current = currentMode;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Load conversations from backend on project change
  useEffect(() => {
    setHydrated(false);
    let cancelled = false;

    (async () => {
      try {
        const all = await conversationsApi.getAll();
        if (cancelled) return;
        const sorted = [...all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
        if (sorted.length === 0) {
          const empty = createEmptyConversation(currentModeRef.current);
          // Create on backend
          conversationsApi.create(empty).catch(() => { /* ignore */ });
          setConversations([empty]);
          setActiveId(empty.id);
        } else {
          setConversations(sorted);
          setActiveId(resolveActiveId(sorted, null));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load conversations from backend:', err);
        // Fallback: create a local empty conversation
        const empty = createEmptyConversation(currentModeRef.current);
        setConversations([empty]);
        setActiveId(empty.id);
      }
      setHydrated(true);
    })();

    return () => { cancelled = true; };
  }, [projectPath]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? conversations[0];

  // Update mode on single empty conversation when mode changes
  useEffect(() => {
    setConversations((prev) => {
      if (prev.length !== 1) return prev;
      const c = prev[0];
      if (c.messages.length > 0) return prev;
      if (c.mode === currentMode) return prev;
      return [{ ...c, mode: currentMode }];
    });
  }, [currentMode]);

  /**
   * Called from useChat during/after streaming to keep the local Conversation.messages in sync.
   * Converts ChatMessage[] → ConversationMessage[] for the local optimistic state.
   * The backend saves authoritatively after each completed turn.
   */
  const updateMessages = useCallback(
    (messages: ChatMessage[]) => {
      const convMessages = chatMessagesToConversationMessages(messages);
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeIdRef.current) return c;
          const title =
            c.title === 'Neuer Chat' && messages.length > 0
              ? generateTitle(messages)
              : c.title;
          return { ...c, messages: convMessages, title, updatedAt: Math.floor(Date.now() / 1000) };
        }),
      );
    },
    [],
  );

  /**
   * Reload a single conversation from the backend and update local state.
   * Called after streaming completes to sync the authoritative ConversationMessage[].
   */
  const refreshConversation = useCallback(async (id: string) => {
    try {
      const updated = await conversationsApi.getById(id);
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      console.error('Failed to refresh conversation:', id, err);
    }
  }, []);

  const createConversation = useCallback(
    (
      mode?: string,
      initialMessages?: ChatMessage[],
      title?: string,
      sessionKind: ChatSessionKind = 'standard',
    ) => {
      const newConv = createEmptyConversation(mode ?? currentModeRef.current, sessionKind);
      if (initialMessages && initialMessages.length > 0) {
        newConv.messages = chatMessagesToConversationMessages(initialMessages);
        newConv.title = title ?? generateTitle(initialMessages);
      } else if (title) {
        newConv.title = title;
      }

      setConversations((prev) => {
        const active = prev.find((c) => c.id === activeIdRef.current);
        const dropEmptyActive = active !== undefined && !hasVisibleMessages(active);
        const withoutEmptyActive = dropEmptyActive ? prev.filter((c) => c.id !== activeIdRef.current) : prev;
        const updated = [newConv, ...withoutEmptyActive];
        return updated.length > MAX_CONVERSATIONS ? updated.slice(0, MAX_CONVERSATIONS) : updated;
      });
      setActiveId(newConv.id);

      // Persist on backend
      conversationsApi.create(newConv).then((created) => {
        setConversations((prev) => prev.map((c) => (c.id === newConv.id ? created : c)));
      }).catch((err) => console.error('Failed to create conversation:', err));

      return newConv;
    },
    [],
  );

  const patchConversation = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Math.floor(Date.now() / 1000) } : c)),
    );
    // Sync to backend
    const backendPatch: ConversationPatch = {};
    if ('title' in patch && patch.title !== undefined) backendPatch.title = patch.title;
    if ('savedToProject' in patch && patch.savedToProject !== undefined) backendPatch.savedToProject = patch.savedToProject;
    if ('steeringPlan' in patch) {
      // steeringPlan is a Conversation field, not directly in ConversationPatch — handle via client side only for now
    }
    if (Object.keys(backendPatch).length > 0) {
      conversationsApi.patch(id, backendPatch).catch((err) => console.error('Failed to patch conversation:', err));
    }
  }, []);

  const discardActiveAndCreateConversation = useCallback(
    (mode?: string, sessionKind: ChatSessionKind = 'standard') => {
      const newConv = createEmptyConversation(mode ?? currentModeRef.current, sessionKind);
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== activeIdRef.current);
        let updated = [newConv, ...filtered];
        if (updated.length > MAX_CONVERSATIONS) updated = updated.slice(0, MAX_CONVERSATIONS);
        return updated;
      });
      setActiveId(newConv.id);

      // Delete old on backend, create new
      const oldId = activeIdRef.current;
      conversationsApi.delete(oldId).catch(() => { /* ignore */ });
      conversationsApi.create(newConv).then((created) => {
        setConversations((prev) => prev.map((c) => (c.id === newConv.id ? created : c)));
      }).catch((err) => console.error('Failed to create conversation:', err));

      return newConv;
    },
    [],
  );

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => {
      const deleted = prev.find((c) => c.id === id);
      const idsToRemove = new Set<string>([id]);
      if (deleted && !deleted.isThread) {
        for (const c of prev) {
          if (c.isThread && c.parentConversationId === id) idsToRemove.add(c.id);
        }
      }
      const filtered = prev.filter((c) => !idsToRemove.has(c.id));
      if (filtered.length === 0) {
        const newConv = createEmptyConversation(currentModeRef.current);
        setActiveId(newConv.id);
        conversationsApi.create(newConv).catch(() => { /* ignore */ });
        return [newConv];
      }
      if (idsToRemove.has(activeIdRef.current)) {
        setActiveId(filtered[0].id);
      }
      return filtered;
    });
    conversationsApi.delete(id).catch((err) => console.error('Failed to delete conversation:', err));
  }, []);

  const switchConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: trimmed, updatedAt: Math.floor(Date.now() / 1000) } : c)),
    );
    conversationsApi.patch(id, { title: trimmed }).catch((err) => console.error('Failed to rename conversation:', err));
  }, []);

  const toggleSavedToProject = useCallback((id: string) => {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target?.isThread) return prev;
      const updated = prev.map((c) =>
        c.id === id ? { ...c, savedToProject: !c.savedToProject, updatedAt: Math.floor(Date.now() / 1000) } : c,
      );
      const newSavedToProject = updated.find((c) => c.id === id)?.savedToProject ?? false;
      conversationsApi.patch(id, { savedToProject: newSavedToProject }).catch((err) =>
        console.error('Failed to toggle savedToProject:', err),
      );
      return updated;
    });
  }, []);

  const clearAllBrowserChats = useCallback(() => {
    if (!hydrated) return;
    const newConv = createEmptyConversation(currentModeRef.current);
    const pinned = conversationsRef.current.filter((c) => c.savedToProject);
    const next = [newConv, ...pinned].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
    // Delete non-pinned from backend
    const pinnedIds = new Set(pinned.map((c) => c.id));
    for (const c of conversationsRef.current) {
      if (!pinnedIds.has(c.id)) {
        conversationsApi.delete(c.id).catch(() => { /* ignore */ });
      }
    }
    conversationsApi.create(newConv).catch(() => { /* ignore */ });
    setConversations(next);
    setActiveId(newConv.id);
  }, [hydrated]);

  const importConversations = useCallback((imported: Conversation[]) => {
    if (!imported.length) return;
    setConversations((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const incoming = imported
        .filter((c) => !existingIds.has(c.id))
        .map((c) => ({ ...c, savedToProject: false as const }));
      if (!incoming.length) return prev;
      for (const c of incoming) {
        conversationsApi.create(c).catch(() => { /* ignore */ });
      }
      return [...incoming, ...prev].slice(0, MAX_CONVERSATIONS);
    });
  }, []);

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    updateMessages,
    refreshConversation,
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

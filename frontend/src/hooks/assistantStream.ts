import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage, ChatRequest, ContextInfo, SelectionContext } from '../types.ts';
import { streamChat } from '../api.ts';
import { CHAT_ASSISTANT_UI_MODE } from '../config/chatAssistantUi.ts';

function isVisibleToolMessage(content: string | undefined): boolean {
  if (!content) return false;
  return true;
}

export type StreamCallbacks = {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStreaming: (v: boolean) => void;
  setError: (v: string | null) => void;
  setToolActivity: (v: string | null) => void;
  setContextInfo: Dispatch<SetStateAction<ContextInfo | null>>;
  currentBaseRef: MutableRefObject<ChatMessage[]>;
};

function assistantMessage(
  content: string,
  selectionContext: SelectionContext | undefined,
): ChatMessage {
  if (selectionContext !== undefined) {
    return { role: 'assistant', content, selectionContext };
  }
  return { role: 'assistant', content };
}

/**
 * Subscribes to POST /chat SSE and maps token events into React state.
 * Respects {@link CHAT_ASSISTANT_UI_MODE}: either incremental updates or a single flush on completion.
 */
export function attachAssistantStream(
  requestBase: ChatRequest,
  selectionContext: SelectionContext | undefined,
  cbs: StreamCallbacks,
  onAssistantComplete?: (fullAssistantText: string) => void,
): AbortController {
  let assistantContent = '';
  let shellVisible = false;
  const mode = CHAT_ASSISTANT_UI_MODE;

  const pushAssistantShell = () => {
    if (shellVisible) return;
    shellVisible = true;
    cbs.setMessages([
      ...cbs.currentBaseRef.current,
      assistantMessage('', selectionContext),
    ]);
  };

  return streamChat(
    requestBase,
    (token) => {
      assistantContent += token;
      cbs.setToolActivity(null);
      if (mode === 'live') {
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage(assistantContent, selectionContext),
        ]);
        return;
      }
      pushAssistantShell();
    },
    (info) => {
      cbs.setContextInfo(info);
    },
    (fullAssistantText) => {
      if (mode === 'on-done') {
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage(fullAssistantText, selectionContext),
        ]);
      }
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
      onAssistantComplete?.(fullAssistantText);
    },
    (err) => {
      cbs.setError(err.message);
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
      if (mode === 'on-done' && assistantContent.length > 0) {
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage(assistantContent, selectionContext),
        ]);
      }
    },
    (description) => {
      cbs.setToolActivity(description);
    },
    (updatedTokens) => {
      cbs.setContextInfo((prev) =>
        prev ? { ...prev, estimatedTokens: updatedTokens } : prev,
      );
    },
    (toolMessages) => {
      cbs.currentBaseRef.current = [
        ...cbs.currentBaseRef.current,
        ...toolMessages.map((m) => ({ ...m, hidden: !isVisibleToolMessage(m.content) })),
      ];
      if (mode === 'on-done') {
        shellVisible = true;
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage('', selectionContext),
        ]);
      } else {
        cbs.setMessages(cbs.currentBaseRef.current);
      }
    },
    (resolved) => {
      const base = [...cbs.currentBaseRef.current];
      for (let i = base.length - 1; i >= 0; i--) {
        if (base[i].role === 'user' && !base[i].hidden) {
          base[i] = { ...base[i], resolvedContent: resolved };
          break;
        }
      }
      cbs.currentBaseRef.current = base;
      cbs.setMessages(base);
    },
  );
}

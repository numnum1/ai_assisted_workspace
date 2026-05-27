import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatMessage, ChatRequest, ContextInfo, SelectionContext } from '../types.ts';
import { streamChat } from '../api.ts';
import { CHAT_ASSISTANT_UI_MODE } from '../config/chatAssistantUi.ts';
import { extractFilesReadByTools } from '../utils/toolContextUtils.ts';

/** Whether a message from SSE `tool_history` should appear in the chat transcript. */
function isVisibleToolHistoryMessage(msg: ChatMessage): boolean {
  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    return true;
  }
  if (msg.role === 'tool') {
    return Boolean(msg.content);
  }
  return Boolean(msg.content?.trim());
}

export type StreamCallbacks = {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setStreaming: (v: boolean) => void;
  setError: (v: string | null) => void;
  setToolActivity: (v: string | null) => void;
  setContextInfo: Dispatch<SetStateAction<ContextInfo | null>>;
  currentBaseRef: MutableRefObject<ChatMessage[]>;
  turnId?: string;
  onNaviState?: (stateId: string) => void;
};

function assistantMessage(
  content: string,
  selectionContext: SelectionContext | undefined,
  turnId: string | undefined,
): ChatMessage {
  const msg: ChatMessage = { role: 'assistant', content };
  if (selectionContext !== undefined) msg.selectionContext = selectionContext;
  if (turnId !== undefined) msg.turnId = turnId;
  return msg;
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

  const { turnId } = cbs;

  const pushAssistantShell = () => {
    if (shellVisible) return;
    shellVisible = true;
    cbs.setMessages([
      ...cbs.currentBaseRef.current,
      assistantMessage('', selectionContext, turnId),
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
          assistantMessage(assistantContent, selectionContext, turnId),
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
          assistantMessage(fullAssistantText, selectionContext, turnId),
        ]);
      } else {
        // Live: the trailing assistant bubble was never in currentBaseRef; persist it so tool rows
        // stay in the same message list after streaming ends (avoids "tools vanished" glitches).
        const body =
          fullAssistantText.trim().length > 0 ? fullAssistantText : assistantContent;
        if (body.trim().length > 0) {
          cbs.currentBaseRef.current = [
            ...cbs.currentBaseRef.current,
            assistantMessage(body, selectionContext, turnId),
          ];
        }
        cbs.setMessages([...cbs.currentBaseRef.current]);
      }
      assistantContent = '';
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
      onAssistantComplete?.(fullAssistantText);
    },
    (err) => {
      cbs.setError(err.message);
      cbs.setStreaming(false);
      cbs.setToolActivity(null);
      if (mode === 'live' && assistantContent.trim().length > 0) {
        cbs.currentBaseRef.current = [
          ...cbs.currentBaseRef.current,
          assistantMessage(assistantContent, selectionContext, turnId),
        ];
        assistantContent = '';
        cbs.setMessages([...cbs.currentBaseRef.current]);
      } else if (mode === 'on-done' && assistantContent.length > 0) {
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage(assistantContent, selectionContext, turnId),
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
      // Streamed text for this round is already on the assistant row inside toolMessages (from server).
      // Drop the client buffer so the next round does not concatenate into the same string.
      assistantContent = '';
      cbs.currentBaseRef.current = [
        ...cbs.currentBaseRef.current,
        ...toolMessages.map((m) => ({
          ...m,
          hidden: !isVisibleToolHistoryMessage(m),
          ...(turnId !== undefined ? { turnId } : {}),
        })),
      ];
      if (mode === 'on-done') {
        shellVisible = true;
        cbs.setMessages([
          ...cbs.currentBaseRef.current,
          assistantMessage('', selectionContext, turnId),
        ]);
      } else {
        cbs.setMessages([...cbs.currentBaseRef.current]);
      }

      const filesFromTools = extractFilesReadByTools(toolMessages);
      if (filesFromTools.length > 0) {
        cbs.setContextInfo((prev) =>
          prev
            ? {
                ...prev,
                includedFiles: [...new Set([...prev.includedFiles, ...filesFromTools])],
              }
            : prev,
        );
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
    cbs.onNaviState,
  );
}

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ChatRequest, ContextInfo, SelectionContext } from "../types.ts";
import {
  attachAssistantStream,
  type StreamCallbacks,
} from "../services/ai/aiStreamToState.ts";

/** Per-turn extras handed to {@link AiStreamController.startStream}. */
export interface StartStreamOptions {
  /** Selection the turn is anchored to (main chat); stored on the assistant bubble. */
  selectionContext?: SelectionContext;
  /** Turn id grouping the user message and its assistant reply. */
  turnId?: string;
  /** Called with the full assistant text once the stream finishes successfully. */
  onComplete?: (fullAssistantText: string) => void;
}

/**
 * The streaming state machine shared by every chat surface (`useChat`,
 * `useQuickChat`, `usePanelChat`).
 *
 * It owns the transcript and the transient stream state (streaming flag, error,
 * tool activity, context info) plus the abort/retry plumbing, and exposes
 * {@link AiStreamController.startStream} to kick off a turn. Each surface layers
 * its own request-building and persistence on top, so the fragile parts — buffer
 * handling, abort, retry — live in exactly one place.
 */
export function useAiStream(
  initialMessages: ChatMessage[] | (() => ChatMessage[]) = [],
) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // The evolving base message list during a stream, so stream callbacks can
  // mutate it without stale-closure issues.
  const currentBaseRef = useRef<ChatMessage[]>([]);

  // Latest messages for send/edit handlers — avoids re-creating those callbacks
  // on every token during streaming.
  const messagesRef = useRef<ChatMessage[]>(messages);
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // The last stream started, replayed verbatim by {@link retry}.
  const lastStreamRef = useRef<{
    request: ChatRequest;
    options?: StartStreamOptions;
  } | null>(null);

  const runStream = useCallback(
    (request: ChatRequest, options?: StartStreamOptions) => {
      // Preflight state reset shared by both a fresh send and a retry.
      setError(null);
      setToolActivity(null);
      setStreaming(true);
      const cbs: StreamCallbacks = {
        setMessages,
        setStreaming,
        setError,
        setToolActivity,
        setContextInfo,
        currentBaseRef,
        ...(options?.turnId !== undefined ? { turnId: options.turnId } : {}),
      };
      abortRef.current = attachAssistantStream(
        request,
        options?.selectionContext,
        cbs,
        options?.onComplete,
      );
    },
    [],
  );

  /** Begin a new assistant turn for an already-prepared {@link ChatRequest}. */
  const startStream = useCallback(
    (request: ChatRequest, options?: StartStreamOptions) => {
      lastStreamRef.current = { request, options };
      runStream(request, options);
    },
    [runStream],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setToolActivity(null);
  }, []);

  /** Re-run the most recent stream (after an error). */
  const retry = useCallback(() => {
    const last = lastStreamRef.current;
    if (!last) return;
    runStream(last.request, last.options);
  }, [runStream]);

  const clearMessages = useCallback(() => {
    currentBaseRef.current = [];
    setMessages([]);
    setError(null);
    setToolActivity(null);
  }, []);

  return {
    messages,
    setMessages,
    streaming,
    setStreaming,
    error,
    setError,
    toolActivity,
    setToolActivity,
    contextInfo,
    setContextInfo,
    abortRef,
    currentBaseRef,
    messagesRef,
    startStream,
    stopStreaming,
    retry,
    clearMessages,
  };
}

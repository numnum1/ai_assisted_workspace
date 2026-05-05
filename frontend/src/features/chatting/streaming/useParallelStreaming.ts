import { useCallback, useRef, useState, useEffect } from 'react';
import type {
  StreamInstance,
  StreamingAggregate,
  StreamingContextInfo,
} from './streamingState';
import {
  createEmptyAggregate,
  recomputeAggregate,
} from './streamingState';
import { getAppBridge } from '../../../electron/bridge';
import type { ChatStreamEvent } from '../../../electron/bridge';

/**
 * Callbacks, die für jeden Stream-Event-Typ aufgerufen werden.
 */
export interface StreamLifecycleCallbacks {
  onContext?: (streamId: string, info: StreamingContextInfo) => void;
  onToken?: (streamId: string, token: string, accumulated: string) => void;
  onToolCall?: (streamId: string, description: string) => void;
  onComplete?: (streamId: string, finalText: string) => void;
  onError?: (streamId: string, error: Error, partialText: string) => void;
  onAbort?: (streamId: string, partialText: string) => void;
}

/**
 * Hook, der mehrere parallele LLM-Streams verwaltet.
 *
 * Jeder Aufruf von `startStream` spinnt einen neuen, unabhängigen Stream auf.
 * Der Rückgabe-Status (`aggregate`) reflektiert den Zustand ALLER laufenden
 * und abgeschlossenen Streams.
 */
export function useParallelStreaming(callbacks: StreamLifecycleCallbacks = {}) {
  const [aggregate, setAggregate] = useState<StreamingAggregate>(createEmptyAggregate);

  // Refs halten mutable State, der nicht jedes Event triggern soll
  const streamsRef = useRef<Map<string, StreamInstance>>(new Map());
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  /**
   * Entfernt einen Stream aus der internen Verwaltung.
   */
  const cleanupStream = useCallback((streamId: string) => {
    unsubscribersRef.current.get(streamId)?.();
    unsubscribersRef.current.delete(streamId);
    abortControllersRef.current.delete(streamId);
  }, []);

  /**
   * Interne Hilfsfunktion: Updated einen einzelnen Stream in der Map
   * und recomputet das Aggregate.
   */
  const updateStream = useCallback((streamId: string, updater: (prev: StreamInstance | undefined) => StreamInstance) => {
    const map = new Map(streamsRef.current);
    const prev = map.get(streamId);
    const next = updater(prev);
    map.set(streamId, next);
    streamsRef.current = map;
    setAggregate(recomputeAggregate(map));
    return next;
  }, []);

  /**
   * Startet einen neuen Stream. Gibt eine eindeutige Stream-ID zurück.
   */
  const startStream = useCallback(
    async (request: unknown): Promise<string> => {
      const bridge = getAppBridge();
      if (!bridge?.chat) {
        throw new Error('Chat bridge not available');
      }

      const { streamId } = await bridge.chat.startStream(request as import('../../../types').ChatRequest);

      // Initial-Status: CONNECTING
      updateStream(streamId, () => ({ phase: 'CONNECTING', streamId }));

      const abortController = new AbortController();
      abortControllersRef.current.set(streamId, abortController);

      let accumulatedText = '';
      let contextInfo: StreamingContextInfo | undefined;

      // Event-Handler
      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'context': {
            contextInfo = event.payload;
            updateStream(streamId, () => ({
              phase: 'CONTEXT',
              streamId,
              contextInfo: event.payload,
            }));
            callbacks.onContext?.(streamId, event.payload);
            break;
          }

          case 'token': {
            const token = event.payload;
            accumulatedText += token;
            updateStream(streamId, (prev) => {
              const base = prev?.phase === 'CONTEXT'
                ? { contextInfo: prev.contextInfo }
                : prev && 'contextInfo' in prev
                  ? { contextInfo: prev.contextInfo }
                  : { contextInfo: { includedFiles: [], estimatedTokens: 0 } };
              return {
                phase: 'STREAMING',
                streamId,
                ...base,
                accumulatedText,
                currentToolCall: null,
              };
            });
            callbacks.onToken?.(streamId, token, accumulatedText);
            break;
          }

          case 'tool_call': {
            const description = event.payload;
            updateStream(streamId, (prev) => {
              const base = prev && 'contextInfo' in prev
                ? { contextInfo: prev.contextInfo }
                : { contextInfo: { includedFiles: [], estimatedTokens: 0 } };
              return {
                phase: 'TOOL_CALL',
                streamId,
                ...base,
                accumulatedText,
                currentToolCall: description,
              };
            });
            callbacks.onToolCall?.(streamId, description);
            break;
          }

          case 'done': {
            const finalText = event.payload.fullAssistantText;
            updateStream(streamId, (prev) => {
              const base = prev && 'contextInfo' in prev
                ? { contextInfo: prev.contextInfo }
                : { contextInfo: { includedFiles: [], estimatedTokens: 0 } };
              return {
                phase: 'SUCCESS',
                streamId,
                ...base,
                finalText,
              };
            });
            callbacks.onComplete?.(streamId, finalText);
            cleanupStream(streamId);
            break;
          }

          case 'error': {
            const error = new Error(event.payload.message);
            updateStream(streamId, (prev) => {
              const base = prev && 'contextInfo' in prev
                ? { contextInfo: prev.contextInfo }
                : undefined;
              return {
                phase: 'ERROR',
                streamId,
                error,
                partialText: accumulatedText,
                ...base,
              };
            });
            callbacks.onError?.(streamId, error, accumulatedText);
            cleanupStream(streamId);
            break;
          }

          case 'context_update': {
            // Silent update: nur contextInfo aktualisieren, Phase bleibt
            if (contextInfo) {
              contextInfo.estimatedTokens = event.payload.estimatedTokens;
            }
            break;
          }

          case 'tool_history':
          case 'resolved_user_message':
            // Werden aktuell nur für interne History verwendet;
            // bei Bedarf können Callbacks ergänzt werden.
            break;
        }
      };

      // Subscription
      const subscription = bridge.chat.onStreamEvent(streamId, (payload) => {
        // Bridge schickt rohes Payload; wir müssen es zu ChatStreamEvent casten
        handleEvent(payload as ChatStreamEvent);
      });
      unsubscribersRef.current.set(streamId, subscription.unsubscribe);

      // Abort-Handling
      abortController.signal.addEventListener('abort', () => {
        bridge.chat?.stopStream?.(streamId);
        subscription.unsubscribe();
        updateStream(streamId, (prev) => {
          const base = prev && 'contextInfo' in prev
            ? { contextInfo: prev.contextInfo }
            : undefined;
          return {
            phase: 'ABORTED',
            streamId,
            partialText: accumulatedText,
            ...base,
          };
        });
        callbacks.onAbort?.(streamId, accumulatedText);
        cleanupStream(streamId);
      });

      return streamId;
    },
    [callbacks, cleanupStream, updateStream]
  );

  /**
   * Bricht einen einzelnen Stream anhand seiner ID ab.
   */
  const abortStream = useCallback((streamId: string) => {
    const controller = abortControllersRef.current.get(streamId);
    if (controller) {
      controller.abort();
    }
  }, []);

  /**
   * Bricht ALLE laufenden Streams ab.
   */
  const abortAllStreams = useCallback(() => {
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
  }, []);

  /**
   * Entfernt einen abgeschlossenen Stream aus dem Status (für UI-Cleanup).
   */
  const dismissStream = useCallback((streamId: string) => {
    const map = new Map(streamsRef.current);
    map.delete(streamId);
    streamsRef.current = map;
    setAggregate(recomputeAggregate(map));
  }, []);

  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      abortAllStreams();
    };
  }, [abortAllStreams]);

  return {
    aggregate,
    startStream,
    abortStream,
    abortAllStreams,
    dismissStream,
    isStreaming: aggregate.activeCount > 0,
    activeCount: aggregate.activeCount,
  };
}

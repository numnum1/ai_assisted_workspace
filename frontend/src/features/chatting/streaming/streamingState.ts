/**
 * Zustandsautomat für einen einzelnen LLM-Stream.
 * Jeder Stream durchläuft diese Phasen sequenziell.
 */
export type StreamingPhase =
  | 'CONNECTING'
  | 'CONTEXT'
  | 'STREAMING'
  | 'TOOL_CALL'
  | 'COMPLETING'
  | 'SUCCESS'
  | 'ERROR'
  | 'ABORTED';

/**
 * Information über den Kontext, den der Stream empfangen hat.
 */
export interface StreamingContextInfo {
  includedFiles: string[];
  estimatedTokens: number;
  maxContextTokens?: number;
}

/**
 * Basis-State, der in allen aktiven Phasen vorhanden ist.
 */
export interface StreamingBase {
  streamId: string;
  contextInfo: StreamingContextInfo;
  accumulatedText: string;
  currentToolCall: string | null;
}

/**
 * Vereinigung aller möglichen Stream-Zustände.
 */
export type StreamInstance =
  | { phase: 'CONNECTING'; streamId: string }
  | { phase: 'CONTEXT'; streamId: string; contextInfo: StreamingContextInfo }
  | {
      phase: 'STREAMING' | 'TOOL_CALL' | 'COMPLETING';
      streamId: string;
      contextInfo: StreamingContextInfo;
      accumulatedText: string;
      currentToolCall: string | null;
    }
  | {
      phase: 'SUCCESS';
      streamId: string;
      contextInfo: StreamingContextInfo;
      finalText: string;
    }
  | {
      phase: 'ERROR';
      streamId: string;
      error: Error;
      partialText: string;
      contextInfo?: StreamingContextInfo;
    }
  | {
      phase: 'ABORTED';
      streamId: string;
      partialText: string;
      contextInfo?: StreamingContextInfo;
    };

/**
 * Sammlung aller laufenden/abgeschlossenen Streams in einem Chat.
 */
export type ParallelStreams = Map<string, StreamInstance>;

/**
 * Aggregate-Status über alle parallelen Streams.
 */
export interface StreamingAggregate {
  streams: ParallelStreams;
  activeCount: number;
  hasAnyError: boolean;
  hasAnySuccess: boolean;
}

/**
 * Prüft, ob ein Stream gerade aktiv läuft (noch nicht fertig/abgebrochen).
 */
export function isStreamActive(instance: StreamInstance): boolean {
  return ['CONNECTING', 'CONTEXT', 'STREAMING', 'TOOL_CALL', 'COMPLETING'].includes(
    instance.phase
  );
}

/**
 * Prüft, ob ein Stream abgebrochen werden kann.
 */
export function canAbortStream(instance: StreamInstance): boolean {
  return isStreamActive(instance);
}

/**
 * Erstellt einen frischen Aggregate-Status.
 */
export function createEmptyAggregate(): StreamingAggregate {
  return {
    streams: new Map(),
    activeCount: 0,
    hasAnyError: false,
    hasAnySuccess: false,
  };
}

/**
 * Aktualisiert den Aggregate-Status anhand einer Map von Streams.
 */
export function recomputeAggregate(streams: ParallelStreams): StreamingAggregate {
  let activeCount = 0;
  let hasAnyError = false;
  let hasAnySuccess = false;

  for (const stream of streams.values()) {
    if (isStreamActive(stream)) {
      activeCount++;
    }
    if (stream.phase === 'ERROR') {
      hasAnyError = true;
    }
    if (stream.phase === 'SUCCESS') {
      hasAnySuccess = true;
    }
  }

  return { streams, activeCount, hasAnyError, hasAnySuccess };
}

interface StreamSessionState {
  aborted: boolean;
}

export const streamSessions = new Map<string, StreamSessionState>();

export function createStreamId(): string {
  return `chat-stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isStreamActive(streamId: string): boolean {
  return streamSessions.get(streamId)?.aborted !== true;
}

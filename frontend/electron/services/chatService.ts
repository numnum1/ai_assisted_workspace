import { streamSessions, createStreamId } from "./chatSession.js";
import { runNaviChatStream } from "./conversation/naviChat.js";
import type { ChatRequest } from "../../src/types.js";

export type {
  ChatStreamEvent,
  ChatStreamStartResult,
} from "./chatTypes.js";
export type {
  SimulationTranscriptLine,
  SimulatedUserReplyRequest,
  EvaluateNaviSimulationRequest,
  EvaluateNaviSimulationResult,
} from "./naviSimulationService.js";
export {
  generateSimulatedUserReply,
  evaluateNaviSimulation,
} from "./naviSimulationService.js";

// Re-import for internal use (TypeScript requires local binding when re-exporting and also using a type).
import type { ChatStreamEvent, ChatStreamStartResult } from "./chatTypes.js";

export function startChatStream(
  request: ChatRequest,
  emit: (event: ChatStreamEvent) => void,
): ChatStreamStartResult {
  const streamId = createStreamId();
  streamSessions.set(streamId, { aborted: false });
  void runNaviChatStream(streamId, request, emit);
  return { streamId };
}

export function stopChatStream(streamId: string): { status: string } {
  const session = streamSessions.get(streamId);
  if (!session) return { status: "ok" };
  session.aborted = true;
  streamSessions.delete(streamId);
  return { status: "ok" };
}

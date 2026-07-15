import type { ChatMessage } from "../../src/types.js";

export type ChatStreamEvent =
  | {
      type: "context";
      data: {
        includedFiles: string[];
        estimatedTokens: number;
        maxContextTokens?: number;
      };
    }
  | { type: "token"; data: string }
  | { type: "tool_call"; data: string }
  | { type: "tool_history"; data: ChatMessage[] }
  | { type: "resolved_user_message"; data: string }
  | { type: "context_update"; data: { estimatedTokens: number } }
  | { type: "done"; data: { fullAssistantText: string } }
  | { type: "error"; data: { message: string } }
  | { type: "navi_state"; data: { stateId: string; completedStateId?: string; summary?: string } }
  | { type: "navi_tips_covered"; data: { coveredIds: string[] } }
  | { type: "navi_step"; data: { label: string | null } }
  | { type: "navi_facts"; data: import("../../src/types.js").NaviFacts }
  | { type: "navi_trace"; data: import("../../src/types.js").NaviTraceEntry };

export interface ChatStreamStartResult {
  streamId: string;
}

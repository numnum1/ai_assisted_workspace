import type { ChatMessage, ToolCall } from "./types.ts";

export interface VisibleEntry {
  msg: ChatMessage;
  originalIdx: number;
}

export interface ChangeCardData {
  snapshotId: string;
  path: string;
  isNew: boolean;
  description: string;
}

export type SubRenderUnit =
  | {
      type: "writeFileGroup";
      items: { originalIdx: number; data: ChangeCardData }[];
    }
  | {
      type: "toolCall";
      assistantIdx: number;
      toolCallIdx: number;
      toolCallCount: number;
      toolCall: ToolCall;
      resultMsg?: ChatMessage;
    }
  | {
      type: "assistantText";
      msg: ChatMessage;
      originalIdx: number;
      visIdx: number;
    }
  | {
      type: "toolMessage";
      msg: ChatMessage;
      originalIdx: number;
    };

export interface AssistantSubUnit {
  type: "text" | "tool_call" | "tool_result" | "snapshot" | "composer";
  originalIdx: number;
  visIdx: number;
  msg: ChatMessage;
}

export interface AssistantTurnRenderUnit {
  type: "assistantTurn";
  originalIndices: number[];
  lastOriginalIdx: number;
  firstVisIdx: number;
  subUnits: SubRenderUnit[];
}

export interface SingleMessageRenderUnit {
  type: "single";
  visIdx: number;
  msg: ChatMessage;
  originalIdx: number;
}

export type RenderUnit = AssistantTurnRenderUnit | SingleMessageRenderUnit;

export function buildChatRenderUnits(
  visibleEntries: VisibleEntry[],
): RenderUnit[] {
  const units: RenderUnit[] = [];
  for (let visIdx = 0; visIdx < visibleEntries.length; visIdx++) {
    const entry = visibleEntries[visIdx];
    if (entry!.msg.role === "assistant") {
      // placeholder assistant-turn grouping
      units.push({
        type: "assistantTurn",
        originalIndices: [entry!.originalIdx],
        lastOriginalIdx: entry!.originalIdx,
        firstVisIdx: visIdx,
        subUnits: [
          {
            type: "assistantText",
            msg: entry!.msg,
            originalIdx: entry!.originalIdx,
            visIdx,
          },
        ],
      });
    } else {
      units.push({
        type: "single",
        visIdx,
        msg: entry!.msg,
        originalIdx: entry!.originalIdx,
      });
    }
  }
  return units;
}

export function toolResultShownInAssistantTurns(
  units: RenderUnit[],
  toolCallId: string | undefined,
): boolean {
  if (!toolCallId) return false;
  for (const u of units) {
    if (u.type !== "assistantTurn") continue;
    for (const s of u.subUnits) {
      if (s.type === "toolCall" && s.resultMsg?.toolCallId === toolCallId) {
        return true;
      }
    }
  }
  return false;
}

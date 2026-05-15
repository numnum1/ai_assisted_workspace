import type { ChatMessage } from "./types.ts";

export interface VisibleEntry {
  msg: ChatMessage;
  originalIdx: number;
}

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
  subUnits: AssistantSubUnit[];
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
    if (entry.msg.role === "assistant") {
      // placeholder assistant-turn grouping
      units.push({
        type: "assistantTurn",
        originalIndices: [entry.originalIdx],
        lastOriginalIdx: entry.originalIdx,
        firstVisIdx: visIdx,
        subUnits: [
          {
            type: "text",
            originalIdx: entry.originalIdx,
            visIdx,
            msg: entry.msg,
          },
        ],
      });
    } else {
      units.push({
        type: "single",
        visIdx,
        msg: entry.msg,
        originalIdx: entry.originalIdx,
      });
    }
  }
  return units;
}

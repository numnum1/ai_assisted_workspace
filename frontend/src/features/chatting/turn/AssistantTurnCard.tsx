import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Copy, Check, GitMerge } from "lucide-react";
import type { ChatMessage, SelectionContext, CardState } from "../types.ts";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import { ToolCallDisplay } from "../ToolCallDisplay.tsx";
import { ChangeCardGroup } from "../ChangeCardGroup.tsx";
import { hasClarificationFence } from "../clarificationUtils.ts";
import type { SubRenderUnit } from "../chatRenderUnits.ts";
import { toolResultShownInAssistantTurns } from "../chatRenderUnits.ts";
import type { VisibleEntry, RenderUnit } from "../chatRenderUnits.ts";
import {
  getTrailingWriteFileBatch,
  isSameWriteFileBatch,
} from "../writeFileBatchUtils.ts";
import "./AssistantTurnCard.css";
import type { AssistantTurn } from "../../chat/unsortedChatTypes.ts";

const PROMPT_PACK_DISPLAY_NAME = "Prompt-Paket";

function subUnitReactKey(su: SubRenderUnit): string {
  if (su.type === "writeFileGroup") {
    return `wf-${su.items.map((x) => x.originalIdx).join("-")}`;
  }
  if (su.type === "toolCall") {
    return `tool-${su.assistantIdx}-${su.toolCallIdx}`;
  }
  if (su.type === "assistantText") {
    return `at-${su.originalIdx}`;
  }
  return `tm-${su.originalIdx}`;
}

export function AssistantTurnCard({
  timestamp,
  usedModeName,
  messages,
}: AssistantTurn) {

  return (
    {
      messages.map((t) => {
        if (t)
      })
    }
  )
}

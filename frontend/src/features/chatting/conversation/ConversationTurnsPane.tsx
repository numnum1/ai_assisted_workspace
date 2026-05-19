import { useState } from "react";
import type { ConversationTurn } from "../chat/unsortedChatTypes";
import { AssistantTurnCard } from "./AssistantTurnCard.tsx";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import type { ChatMessage } from "./types.ts";
import type { VisibleEntry, SubRenderUnit } from "./chatRenderUnits.ts";

interface ConversationTurnsPaneProps {
  turn: ConversationTurn;
  turnIndex: number;
  streaming: boolean;
  activeIsThread: boolean;
}

export function ConversationTurnsPane({
  turn,
  turnIndex,
  streaming,
  activeIsThread,
}: ConversationTurnsPaneProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (turn.type === "ASSISTANT") {
    const messages: ChatMessage[] = turn.messages.map((m) => ({
      role: "assistant" as const,
      content: m.text,
      mode: turn.usedModeName,
    }));

    const visibleEntries: VisibleEntry[] = messages.map((msg, i) => ({
      msg,
      originalIdx: i,
    }));

    const originalIndices = messages.map((_, i) => i);
    const lastOriginalIdx = messages.length > 0 ? messages.length - 1 : 0;
    const firstVisIdx = turnIndex;

    const subUnits: SubRenderUnit[] = messages.map((msg, i) => ({
      type: "assistantText",
      msg,
      originalIdx: i,
      visIdx: i,
    }));

    return (
      <AssistantTurnCard
        originalIndices={originalIndices}
        lastOriginalIdx={lastOriginalIdx}
        firstVisIdx={firstVisIdx}
        subUnits={subUnits}
        messages={messages}
        visibleEntries={visibleEntries}
        renderUnits={[]}
        readOnly={false}
        streaming={streaming}
        activeIsThread={activeIsThread}
        bulkDismissIds={new Set()}
        composerBatchForced={{}}
        copiedIdx={copiedIdx}
        setCopiedIdx={setCopiedIdx}
        onForkFromMessage={() => {}}
        onStartThreadFromMessage={() => {}}
        onForkToNewConversation={() => {}}
        onDeleteMessages={() => {}}
      />
    );
  }

  return (
    <div className={`chat-message ${turn.type.toLowerCase()}`}>
      <div className="chat-message-content chat-message-md">
        <ChatMessageMarkdown content={turn.text} />
      </div>
    </div>
  );
}

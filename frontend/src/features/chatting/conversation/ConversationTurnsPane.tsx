import type { ConversationTurn } from "../chat/unsortedChatTypes";
import { AssistantTurnCard } from "./AssistantTurnCard.tsx";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";

export function ConversationTurnsPane({ turn }: { turn: ConversationTurn }) {
  if (turn.type === "ASSISTANT") {
    return (
      <AssistantTurnCard
        originalIndices={[]}
        lastOriginalIdx={0}
        firstVisIdx={0}
        subUnits={[]}
        messages={[]}
        visibleEntries={[]}
        renderUnits={[]}
        readOnly={false}
        streaming={false}
        activeIsThread={false}
        bulkDismissIds={new Set()}
        composerBatchForced={{}}
        copiedIdx={null}
        setCopiedIdx={() => {}}
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

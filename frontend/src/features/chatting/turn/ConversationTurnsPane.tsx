import { AssistantTurnCard } from "./AssistantTurnCard.tsx";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown.tsx";
import {
  GitFork,
  GitMerge,
  MessageSquare,
  Scissors,
  Trash2,
} from "lucide-react";
import type {
  AssistantTurn,
  ConversationTurn,
  SystemTurn,
  UserTurn,
} from "./turn.types.ts";

export function ConversationTurnsPane({
  index,
  turn,
  hasParentThread,
  onNewThreadClicked,
  onCutClicked,
  onForkClicked,
  onUseMessageAsThreadSummary,
  onDeleteClicked,
}: {
  index: number;
  turn: ConversationTurn;
  hasParentThread: boolean;
  onNewThreadClicked: (index: number) => void;
  onCutClicked: (index: number) => void;
  onForkClicked: (index: number) => void;
  onUseMessageAsThreadSummary: (index: number) => void;
  onDeleteClicked: (index: number) => void;
}) {
  
  const contentByType: Record<string, React.ReactNode> = {
    ASSISTANT: (
      <AssistantTurnCard
        timestamp={(turn as AssistantTurn).timestamp}
        usedModeName={(turn as AssistantTurn).usedModeName}
        messages={(turn as AssistantTurn).messages}
      />
    ),
    USER: (
      <div className="chat-message user">
        <div className="chat-message-content chat-message-md">
          <ChatMessageMarkdown content={(turn as UserTurn).text} />
        </div>
      </div>
    ),
    SYSTEM: (
      <div className="chat-message system">
        <div className="chat-message-content chat-message-md">
          <ChatMessageMarkdown content={(turn as SystemTurn).text} />
        </div>
      </div>
    ),
  };

  const Content = contentByType[turn.type];

  return (
    <div>
      {index > 0 && (
        <div
          className="assistant-turn-actions"
          aria-label="Aktionen für diese KI-Antwort"
        >
          <button
            type="button"
            className="chat-fork-btn"
            onClick={() => onNewThreadClicked(index)}
            title="Thread starten (neuer Chat mit bisherigem Verlauf)"
          >
            <MessageSquare size={12} />
          </button>
          <button
            type="button"
            className="chat-fork-btn"
            onClick={() => onCutClicked(index)}
            title="Hier abschneiden (in-place)"
          >
            <Scissors size={12} />
          </button>
          <button
            type="button"
            className="chat-fork-btn"
            onClick={() => onForkClicked(index)}
            title="Als neuen Chat forken"
          >
            <GitFork size={12} />
          </button>
          {hasParentThread && (
            <button
              type="button"
              className="chat-fork-btn chat-fork-btn--merge"
              onClick={() => onUseMessageAsThreadSummary(index)}
              title="Verwende diese Nachricht als Zusammenfassung"
            >
              <GitMerge size={12} />
            </button>
          )}
          <button
            type="button"
            className="chat-fork-btn chat-fork-btn--danger"
            onClick={() => onDeleteClicked(index)}
            title="Diese Nachricht"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
      {Content}
    </div>
  );
}

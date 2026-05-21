import { useContext } from "react";
import ChatContext from "../chat/chat-context.ts";
import { ConversationTurnsPane } from "../turn/ConversationTurnsPane.tsx";
import type { ConversationTurn } from "../turn/turn.types.ts";
import type { ChatViewModel } from "../chat/chat-view-model.ts";

export function ConversationPane() {
  const {
    conversation: { turns },
    parentChatId,
    fork,
    cut,
    deleteTurn,
    startNewThread,
    summarizeFromTurn,
  } = useContext<ChatViewModel>(ChatContext);

  return (
    <div className="chat-messages" data-testid="ChatMessagesPane">
      {turns.map((turn: ConversationTurn, index: number) => (
        <ConversationTurnsPane
          key={index}
          index={index}
          turn={turn}
          hasParentThread={parentChatId != null}
          onCutClicked={cut}
          onDeleteClicked={deleteTurn}
          onForkClicked={fork}
          onNewThreadClicked={startNewThread}
          onUseMessageAsThreadSummary={summarizeFromTurn}
        />
      ))}
      {turns.length === 0 && (
        <div className="chat-empty">
          <p>Start a conversation with your AI assistant.</p>
          <p className="chat-empty-hint">
            Drag files from the project tree into the input area to reference
            them, or use @filename syntax in the input area.
          </p>
        </div>
      )}
    </div>
  );
}

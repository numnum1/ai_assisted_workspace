import { useContext } from "react";
import ChatContext from "../chat/chat-context.ts";
import { ConversationTurnsPane } from "./ConversationTurnsPane.tsx";

export function ConversationPane() {
  const {
    conversation: { turns },
  } = useContext(ChatContext);

  return (
    <div className="chat-messages" data-testid="ChatMessagesPane">
      {turns.map((turn, index) => (
        <ConversationTurnsPane key={index} turn={turn} />
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

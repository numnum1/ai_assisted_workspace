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
    </div>
  );
}

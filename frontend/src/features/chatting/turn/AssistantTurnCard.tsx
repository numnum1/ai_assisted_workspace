import { useContext, useEffect } from "react";
import "./AssistantTurnCard.css";
import type { Message } from "../message/message.types.ts";
import { MessagePane } from "../message/MessagePane.tsx";
import { StreamingTurnPane } from "../message/StreamingTurnPane.tsx";
import { writeStreamingText } from "../stream/assistantStreamStore.ts";
import ChatContext from "../chat/chat-context.ts";

export function AssistantTurnCard({
  messages,
}: {
  timestamp: number;
  usedModeName: string;
  messages: Message[];
}) {
  const { id: chatId, streaming } = useContext(ChatContext);

  // Clean up the stream store when this turn's stream ends
  useEffect(() => {
    if (!streaming) {
      writeStreamingText(chatId, null);
    }
  }, [streaming, chatId]);

  if (streaming) {
    return <StreamingTurnPane chatId={chatId} />;
  }

  return (
    <>
      {messages.map((m, i) => (
        <MessagePane key={i} message={m} />
      ))}
    </>
  );
}

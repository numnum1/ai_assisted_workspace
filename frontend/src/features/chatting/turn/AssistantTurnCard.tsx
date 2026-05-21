import "./AssistantTurnCard.css";
import type { Message } from "../message/message.types.ts";
import { MessagePane } from "../message/MessagePane.tsx";

export function AssistantTurnCard({
  timestamp,
  usedModeName,
  messages,
}: {
  timestamp: number;
  usedModeName: string;
  messages: Message[];
}) {
  console.log(timestamp);
  console.log(usedModeName);
  console.log(messages);
  return <>{
    messages.map((t, index) => {
      <MessagePane key={index} message={t} />
    })
  }</>;
}

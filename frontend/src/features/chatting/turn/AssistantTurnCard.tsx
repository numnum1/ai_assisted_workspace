import "./AssistantTurnCard.css";
import type { Message } from "../message/message.types.ts";

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
  return <div></div>;
}

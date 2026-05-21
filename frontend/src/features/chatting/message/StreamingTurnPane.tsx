import { useSyncExternalStore } from "react";
import {
  getStreamingText,
  subscribeStreamingText,
  parseStreamMessages,
} from "../stream/assistantStreamStore";
import { TextMessagePane } from "./TextMessagePane";
import { ThinkingMessagePane } from "./ThinkingMessagePane";
import type { Message } from "./message.types";

function StreamingMessage({ message, isLast }: { message: Message; isLast: boolean }) {
  if (message.type === "TEXT") {
    return <TextMessagePane text={message.text} isStreaming={isLast} />;
  }
  if (message.type === "THINKING") {
    return <ThinkingMessagePane text={message.text} isStreaming={isLast} />;
  }
  return null;
}

/** Renders the live streaming assistant turn. Subscribes directly to the external store
 *  via useSyncExternalStore so only this component re-renders per token. */
export function StreamingTurnPane({ chatId }: { chatId: string }) {
  const rawText = useSyncExternalStore(
    (cb) => subscribeStreamingText(chatId, cb),
    () => getStreamingText(chatId),
  );

  const messages = parseStreamMessages(rawText);

  return (
    <>
      {messages.map((m, i) => (
        <StreamingMessage key={i} message={m} isLast={i === messages.length - 1} />
      ))}
    </>
  );
}

import type {
  Message,
  TextMessage,
  ThinkingMessage,
  ToolCallMessage,
} from "./message.types";
import { TextMessagePane } from "./TextMessagePane";
import { ThinkingMessagePane } from "./ThinkingMessagePane";
import { ToolCallMessagePane } from "./ToolCallMessagePane";

export function MessagePane({ message }: { message: Message }) {
  switch (message.type) {
    case "TEXT":
      return <TextMessagePane text={(message as TextMessage).text} />;
    case "THINKING":
      return <ThinkingMessagePane text={(message as ThinkingMessage).text} />;
    case "TOOL_CALL":
      return (
        <ToolCallMessagePane content={(message as ToolCallMessage).content} />
      );
  }
}

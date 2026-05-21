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
  const contentByType: Record<string, React.ReactNode> = {
    TEXT: <TextMessagePane text={(message as TextMessage).text} />,
    THINKING: <ThinkingMessagePane text={(message as ThinkingMessage).text} />,
    TOOL_CALL: (
      <ToolCallMessagePane content={(message as ToolCallMessage).content} />
    ),
  };

  return contentByType[message.type];
}

import { ChatMessageMarkdown } from "../../../components/chat/ChatMessageMarkdown";

export function TextMessagePane({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  return (
    <div className="chat-message assistant">
      <div className="chat-message-content chat-message-md">
        <ChatMessageMarkdown content={text} streamingCursor={isStreaming} />
      </div>
    </div>
  );
}

import { ChatBottomParts } from "./ChatBottomCards";
import { ChatUserInputs } from "./ChatUserInputs";

export function ChatBottomPane() {
  return (
    <div className="chat-composer-stack">
      <ChatBottomParts />
      <ChatUserInputs />
    </div>
  );
}

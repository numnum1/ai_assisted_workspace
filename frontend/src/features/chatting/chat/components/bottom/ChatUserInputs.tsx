import { useCallback, useContext } from "react";
import ChatContext from "../../chat-context";
import type { ChatViewModel } from "../../chat-view-model";
import { ToolkitMenu } from "./toolkit/ToolkitMenu";

export function ChatUserInputs() {
  const {
    streaming,
    settings: {
      selectedLLM: { useReasoning },
    },
    send,
    cancel,
    setUserMessage,
    setUseReasoning,
    userMessage
  } = useContext<ChatViewModel>(ChatContext);

  const toggleUseReasoning = useCallback(() => {
    setUseReasoning(!useReasoning);
  }, [setUseReasoning, useReasoning]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!streaming && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [streaming, send],
  );

  const handleChanged = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setUserMessage(e.target.value);
    },
    [setUserMessage],
  );

  return (
    <div className="chat-input-toolbar-card">
      <div className="chat-input-row">
        <textarea
          className="chat-textarea"
          placeholder="Nachricht..."
          rows={1}
          onChange={handleChanged}
          onKeyDown={handleKeyDown}
          value={userMessage}
        />
        <button
          type="button"
          className={`chat-reasoning-btn${useReasoning ? " active" : ""}`}
          onClick={toggleUseReasoning}
          title="Reasoning"
        >
          ⚡
        </button>
        <ToolkitMenu />
        {streaming ? (
          <button className="chat-send-btn stop" onClick={cancel} title="Stop">
            ⏹
          </button>
        ) : (
          <button className="chat-send-btn" onClick={send} title="Send (Enter)">
            ➤
          </button>
        )}
      </div>
    </div>
  );
}

import { useCallback, useContext, useState } from "react";
import ChatContext from "../../chat-context";
import type { ChatViewModel } from "../../chat-view-model";

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
  } = useContext<ChatViewModel>(ChatContext);

  const [isToolkitListOpen, setIsToolkitListOpen] = useState(false);

  const toggleToolkitList = useCallback(() => {
    setIsToolkitListOpen((open) => !open);
  }, [setIsToolkitListOpen]);

  const toggleUseReasoning = useCallback(() => {
    setUseReasoning((use) => !use);
  }, [setUseReasoning]);

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
        />
        <button
          type="button"
          className={`chat-reasoning-btn${useReasoning ? " active" : ""}`}
          onClick={toggleUseReasoning}
          title="Reasoning"
        >
          ⚡
        </button>
        <button
          type="button"
          className="chat-tools-toggle-btn active"
          onClick={toggleToolkitList}
          title="Toolkits"
        >
          🔧
        </button>
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

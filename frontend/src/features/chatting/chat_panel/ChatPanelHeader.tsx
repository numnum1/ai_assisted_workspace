import { History, Plus, Wand2 } from "lucide-react";

export function ChatPanelHeader({
  onHistoryButtonClicked,
  onNewChatButtonClicked,
}: {
  onHistoryButtonClicked: () => void;
  onNewChatButtonClicked: () => void;
}) {
  // #region placeholder

  const onOpenPromptPack = false;
  const historyOpen = false;

  // #endregion

  return (
    <div className="chat-header">
      <div className="chat-header-actions">
        {onOpenPromptPack && (
          <button
            type="button"
            className="chat-prompt-pack-btn"
            onClick={() => {
              console.log("OpenPromptPack Clicked");
            }}
            title="Prompt-Paket (Export für ChatGPT / Grok)"
          >
            <Wand2 size={14} />
          </button>
        )}
        <button
          className={`chat-history-btn ${historyOpen ? "active" : ""}`}
          onClick={onHistoryButtonClicked}
          title="Chat-Historie"
        >
          <History size={14} />
        </button>
        <button
          type="button"
          onClick={onNewChatButtonClicked}
          className={"chat-history-new-btn"}
          title="Neuer Chat"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

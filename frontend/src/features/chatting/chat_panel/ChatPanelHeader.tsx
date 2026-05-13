import { History, Wand2, Maximize2, Minimize2 } from "lucide-react";
import { NewChatButton } from "./NewChatButton";

export function ChatPanelHeader({
  onHistoryButtonClicked,
  onNewChatButtonClicked
}: {
  onHistoryButtonClicked: () => void;
  onNewChatButtonClicked: () => void;
}) {

  // #region placeholder

  const isFullscreen = false
  const toggleFullscreen = () => {}
  const onOpenPromptPack = false
  const activeIsThread = false
  const historyOpen = false

  // #endregion

  return (
    <div className="chat-header">
      <div className="chat-header-actions">
        {onOpenPromptPack && (
          <button
            type="button"
            className="chat-prompt-pack-btn"
            onClick={()=> {console.log('OpenPromptPack Clicked')}}
            title="Prompt-Paket (Export für ChatGPT / Grok)"
          >
            <Wand2 size={14} />
          </button>
        )}
        <button
          type="button"
          data-testid="expandButton"
          className={`chat-history-btn ${isFullscreen ? "active" : ""}`}
          onClick={toggleFullscreen}
          title={
            activeIsThread
              ? "Thread-Workspace öffnen"
              : isFullscreen
                ? "Vergrößerte Ansicht schließen (Esc)"
                : "Chat vergrößern"
          }
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          className={`chat-history-btn ${historyOpen ? "active" : ""}`}
          onClick={onHistoryButtonClicked}
          title="Chat-Historie"
        >
          <History size={14} />
        </button>
        <NewChatButton onClick={onNewChatButtonClicked} />
      </div>
    </div>
  );
}

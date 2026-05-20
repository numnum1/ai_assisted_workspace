import { useState } from "react";
import type { ChatSettings, Conversation, SelectedLLM } from "./unsortedChatTypes";
import { ChatHeader } from "./components/ChatHeader";
import { SteeringPlanPanel } from "./components/SteeringPlanPanel";
import { ChatBottomPane } from "./components/bottom/ChatBottomPane";
import { ContextBar } from "./components/context/ContextBar";
import { GlossaryPopup } from "./components/GlossaryPopup";
import { GlossarySaveDialog } from "./components/GlossarySaveDialog";
import { v4 as uuidv4 } from "uuid";
import ChatContext from "./chat-context";
import { ConversationPane } from "../conversation/ConversationPane";
import { useChat } from "./useChat";

export type Chat = {
  parentChatId: string | null;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
  userMessage: string;
};

export function NewChat(
  parentChatId: string | null = null,
  name: string,
  selectedModeId: string | null,
  selectedLLM: SelectedLLM
): Chat {
  return {
    parentChatId: parentChatId,
    id: uuidv4(),
    name: name,
    conversation: {
      turns: [],
    },
    settings: {
      selectedModeId: selectedModeId,
      selectedLLM: selectedLLM,
      enabledToolkitIds: [],
    },
    userMessage: "",
  };
}

export function ChatPane(value: Chat) {
  const context = useChat(value);

  // #region Placeholders
  const [steeringPlanOpen, setSteeringPlanOpen] = useState(true);
  const [glossaryPopup, setGlossaryPopup] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);
  const [glossaryForm, setGlossaryForm] = useState<{
    term: string;
    definition: string;
  } | null>(null);
  const [glossarySaving, setGlossarySaving] = useState(false);

  const activeSessionKind = "standard" as "standard" | "guided";
  const streaming = false;
  const steeringPlan = "";
  const disabledToolkits = new Set<string>();
  // #endregion

  return (
    <ChatContext.Provider value={context}>
      <div className="chat-panel">
        <ChatHeader />

        <div className="chat-panel-body">
          <div className="chat-pane" data-testid="chatPane">
            <div className="chat-panel-body-main">
              <ConversationPane />

              <SteeringPlanPanel
                activeSessionKind={activeSessionKind}
                steeringPlan={steeringPlan}
                steeringPlanOpen={steeringPlanOpen}
                setSteeringPlanOpen={setSteeringPlanOpen}
                streaming={streaming}
              />

              <ChatBottomPane />
            </div>

            <ContextBar />

            <GlossaryPopup
              glossaryPopup={glossaryPopup}
              glossaryForm={glossaryForm}
              disabledToolkits={disabledToolkits}
              setGlossaryForm={setGlossaryForm}
            />

            <GlossarySaveDialog
              glossaryForm={glossaryForm}
              setGlossaryForm={setGlossaryForm}
              glossaryPopup={glossaryPopup}
              setGlossaryPopup={setGlossaryPopup}
              glossarySaving={glossarySaving}
              setGlossarySaving={setGlossarySaving}
              disabledToolkits={disabledToolkits}
            />
          </div>
        </div>
      </div>
    </ChatContext.Provider>
  );
}

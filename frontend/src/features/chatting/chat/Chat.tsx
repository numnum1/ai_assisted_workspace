import { useCallback, useContext, useMemo, useState } from "react";
import type { ChatSettings, Conversation } from "./unsortedChatTypes";
import { ChatHeader } from "./components/ChatHeader";
import { SteeringPlanPanel } from "./components/SteeringPlanPanel";
import { ChatBottomPane } from "./components/bottom/ChatBottomPane";
import { ContextBar } from "./components/ContextBar";
import { GlossaryPopup } from "./components/GlossaryPopup";
import { GlossarySaveDialog } from "./components/GlossarySaveDialog";
import ProjectContext from "../project/project-context";
import type { ProjectViewModel } from "../project/project-types";
import { v4 as uuidv4 } from "uuid";
import ChatContext from "./chat-context";
import type { ChatViewModel } from "./chat-view-model";
import { ConversationPane } from "../conversation/ConversationPane";

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
      selectedLLM: {
        id: null,
        useReasoning: false,
      },
      enabledToolIds: [],
    },
    userMessage: "",
  };
}

export function ChatPane({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  userMessage,
}: Chat) {
  const { setChat }: ProjectViewModel =
    useContext<ProjectViewModel>(ProjectContext);

  const rename = useCallback(
    (newName: string) => {
      setChat(id, { name: newName });
    },
    [setChat, id],
  );

  const selectMode = useCallback(
    (newSelectedModeId: string) => {
      setChat(id, {
        settings: { ...settings, selectedModeId: newSelectedModeId },
      });
    },
    [setChat, id, settings],
  );

  const selectLLM = useCallback(
    (newSelectedLLMId: string) => {
      setChat(id, {
        settings: {
          ...settings,
          selectedLLM: { id: newSelectedLLMId, useReasoning: true },
        },
      });
    },
    [setChat, id, settings],
  );

  const setUseReasoning = useCallback(
    (newUseReasoning: boolean) => {
      setChat(id, {
        settings: {
          ...settings,
          selectedLLM: {
            ...settings.selectedLLM,
            useReasoning: newUseReasoning,
          },
        },
      });
    },
    [id, setChat, settings],
  );

  const enableToolById = useCallback(
    (toolId: string) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolIds: [...settings.enabledToolIds, toolId],
        },
      });
    },
    [id, setChat, settings],
  );

  const disableToolById = useCallback(
    (toolId: string) => {
      setChat(id, {
        settings: {
          ...settings,
          enabledToolIds: settings.enabledToolIds.filter((id) => id !== toolId),
        },
      });
    },
    [id, setChat, settings],
  );

  const setUserMessage = useCallback(
    (newUserMessage: string) => {
      setChat(id, { userMessage: newUserMessage });
    },
    [id, setChat],
  );

  const context: ChatViewModel = useMemo<ChatViewModel>(() => {
    return {
      parentChatId,
      id,
      name,
      conversation,
      settings,
      userMessage,
      streaming: false,
      send: () => {
        console.log("Send Clicked");
      },
      cancel: () => {
        console.log("Cancel Clicked");
      },
      setUserMessage: setUserMessage,
      setUseReasoning: setUseReasoning,
      enableToolById: enableToolById,
      disableToolById: disableToolById,
    };
  }, [
    parentChatId,
    id,
    name,
    conversation,
    settings,
    userMessage,
    setUseReasoning,
    enableToolById,
    disableToolById,
    setUserMessage,
  ]);

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
  const activeFile = null as string | null;
  const isDirty = false;
  const systemPromptPreview = null as string | null;
  const disabledToolkits = new Set<string>();
  // #endregion

  return (
    <ChatContext.Provider value={context}>
      <div className="chat-panel">
        <ChatHeader
          name={name}
          rename={rename}
          selectedModeId={settings.selectedModeId}
          selectMode={selectMode}
          selectedLLMId={settings.selectedLLM.id}
          selectLLM={selectLLM}
        />

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

            <ContextBar
              activeFile={activeFile}
              isDirty={isDirty}
              systemPromptPreview={systemPromptPreview}
            />

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

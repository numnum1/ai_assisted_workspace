import { useCallback, useContext, useRef, useState } from "react";
import type { ChatSettings, Conversation } from "./unsortedChatTypes";
import { ChatMessagesPane } from "../../../components/chat/ChatMessagesPane";
import type { ChatMessage } from "../../../types";
import type { CardState } from "../../../components/chat/ChangeCard";
import { ChatHeader } from "./components/ChatHeader";
import { ChatHistoryPanel } from "./components/ChatHistoryPanel";
import { SteeringPlanPanel } from "./components/SteeringPlanPanel";
import { ChatComposer } from "./components/ChatComposer";
import { ContextBar } from "./components/ContextBar";
import { GlossaryPopup } from "./components/GlossaryPopup";
import { GlossarySaveDialog } from "./components/GlossarySaveDialog";
import ProjectContext from "../project/project-context";
import type { ProjectViewModel } from "../project/project-types";
import { v4 as uuidv4 } from "uuid";

export type Chat = {
  parentChatId: string | null;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
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
    },
  };
}

export function ChatPane({
  parentChatId,
  id,
  name,
  conversation,
  settings,
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

  // #region Placeholders
  console.log("Project: " + JSON.stringify({ parentChatId, conversation }));

  const [historyOpen] = useState(false);
  const [isFullscreen] = useState(false);
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

  const activeIsThread = false;
  const activeSessionKind = "standard" as "standard" | "guided";
  const streaming = false;
  const error = null as string | null;
  const toolActivity = null as string | null;
  const useReasoning = false;
  const steeringPlan = "";
  const activeFile = null as string | null;
  const isDirty = false;
  const systemPromptPreview = null as string | null;
  const activeSelection = null;
  const referencedFiles = [] as string[];
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [bulkDismissIds] = useState(() => new Set<string>());
  const [composerBatchForced] = useState<Record<string, CardState>>({});

  const messages = [
    {
      role: "user" as const,
      content: "Hallo, kannst du mir bei einem React-Problem helfen?",
    },
    {
      role: "assistant" as const,
      content:
        "Natürlich! Beschreib einfach, worum es geht — ob State-Management, Rendering, Performance oder Styling. Ich schaue mir das gerne an.",
    },
  ] as ChatMessage[];
  const disabledToolkits = new Set<string>();

  const noop = () => {};
  const cancelEdit = () => setEditingIdx(null);
  const commitEdit = () => {
    setEditingIdx(null);
  };
  // #endregion

  return (
    <div className={`chat-panel${isFullscreen ? " chat-panel--expanded" : ""}`}>
      <ChatHeader
        name={name}
        rename={rename}
        selectedModeId={settings.selectedModeId}
        selectMode={selectMode}
        selectedLLM={settings.selectedLLM}
      />

      {historyOpen && <ChatHistoryPanel />}

      <div className="chat-panel-body">
        <div className="chat-pane" data-testid="chatPane">
          <div className="chat-panel-body-main">
            <ChatMessagesPane
              messages={messages}
              readOnly={false}
              scrollRef={messagesScrollRef}
              streaming={streaming}
              error={error}
              toolActivity={toolActivity}
              activeIsThread={activeIsThread}
              editingIdx={editingIdx}
              setEditingIdx={setEditingIdx}
              copiedIdx={copiedIdx}
              setCopiedIdx={setCopiedIdx}
              bulkDismissIds={bulkDismissIds}
              composerBatchForced={composerBatchForced}
              onForkFromMessage={noop}
              onStartThreadFromMessage={noop}
              onForkToNewConversation={noop}
              onEditMessage={noop}
              onDeleteMessages={noop}
              commitEdit={commitEdit}
              cancelEdit={cancelEdit}
              theme="dark"
            />

            <SteeringPlanPanel
              activeSessionKind={activeSessionKind}
              steeringPlan={steeringPlan}
              steeringPlanOpen={steeringPlanOpen}
              setSteeringPlanOpen={setSteeringPlanOpen}
              streaming={streaming}
            />

            <ChatComposer
              activeSelection={activeSelection}
              referencedFiles={referencedFiles}
              streaming={streaming}
              useReasoning={useReasoning}
            />
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
  );
}

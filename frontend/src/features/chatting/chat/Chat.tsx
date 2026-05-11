import { useRef, useState } from "react";
import type { ChatSettings, Conversation } from "./unsortedChatTypes";
import { ChatMessagesPane } from "../../../components/chat/ChatMessagesPane";
import type { ChatMessage } from "../../../types";
import type { CardState } from "../../../components/chat/ChangeCard";
import type { AssistantMode } from "../project/useProject";
import { ChatHeader } from "./components/ChatHeader";
import { ChatHistoryPanel } from "./components/ChatHistoryPanel";
import { SteeringPlanPanel } from "./components/SteeringPlanPanel";
import { ChatComposer } from "./components/ChatComposer";
import { ContextBar } from "./components/ContextBar";
import { GlossaryPopup } from "./components/GlossaryPopup";
import { GlossarySaveDialog } from "./components/GlossarySaveDialog";
import { NewChatDialog } from "./components/NewChatDialog";

export type Chat = {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
};

export function ChatPane({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  setChat,
  findChatById,
  findModeById,
}: {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
  setChat: (id: string, patch: Partial<Chat>) => void;
  findChatById: (id: string) => Chat | null;
  findModeById: (id: string) => AssistantMode | null;
}) {
  // #region Placeholders
  // UI-States (keine Geschäftslogik)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newChatDialogOpen, setNewChatDialogOpen] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
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

  // Platzhalter-Daten
  const activeTitle = name;
  const guidedExecSummary = null as {
    modeLabel: string;
    llmLabel: string;
  } | null;
  const selectedMode = "";
  const selectedLlmId = undefined as string | undefined;
  const llms = [] as { id: string; name: string }[];
  const activeIsThread = false;
  const onOpenPromptPack = undefined as (() => void) | undefined;
  const activeSessionKind = "standard" as "standard" | "guided";
  const streaming = false;
  const error = null as string | null;
  const toolActivity = null as string | null;
  const useReasoning = false;
  const reasoningAvailable = true;
  const fastAvailable = true;
  const fullscreen = false;
  const steeringPlan = "";
  const contextInfo = null;
  const activeFile = null as string | null;
  const isDirty = false;
  const systemPromptPreview = null as string | null;
  const activeSelection = null;
  const referencedFiles = [] as string[];
  const structureRoot = null as string | null;
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
  const commitEdit = (_index: number, _text: string) => {
    setEditingIdx(null);
  };
  // #endregion

  return (
    <div className={`chat-panel${isFullscreen ? " chat-panel--expanded" : ""}`}>
      <ChatHeader
        activeTitle={activeTitle}
        guidedExecSummary={guidedExecSummary}
        selectedMode={selectedMode}
        selectedLlmId={selectedLlmId}
        llms={llms}
        activeIsThread={activeIsThread}
        onOpenPromptPack={onOpenPromptPack}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        setNewChatDialogOpen={setNewChatDialogOpen}
        renamingTitle={renamingTitle}
        setRenamingTitle={setRenamingTitle}
        titleDraft={titleDraft}
        setTitleDraft={setTitleDraft}
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

      {newChatDialogOpen && <NewChatDialog />}
    </div>
  );
}

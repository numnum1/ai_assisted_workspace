import { useContext, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../../types";
import type { CardState } from "../../../components/chat/ChangeCard";
import { ChatHistoryPanel } from "../chat/components/ChatHistoryPanel";
import { NewChatDialog } from "../chat/components/NewChatDialog";
import ProjectContext from "../project/project-context";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { ChatPane, type Chat } from "../chat/Chat";

/**
 * This is NOT an open chat but a panel in which a chat can be opened!
 */
export function ChatPanel({ openChatId, setOpenChatId }: { openChatId: string, setOpenChatId: (newOpenChatId: string) => void }) {
  const { chats, setChat, findChatById } = useContext(ProjectContext);

  const openChat: Chat | null = useMemo(() => {
    return openChatId ? findChatById(openChatId) : null
  }, [findChatById, openChatId])

  console.log(JSON.stringify({openChatId, setOpenChatId, chats, setChat}))

  // #region Placeholders
  const [historyOpen] = useState(false);
  const [isFullscreen] = useState(false);
  const [newChatDialogOpen] = useState(false);
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
      <ChatPanelHeader
        onHistoryButtonClicked={() => console.log("History button clicked")}
        onNewChatButtonClicked={() => console.log("History button clicked")}
      />

      {historyOpen && <ChatHistoryPanel />}

      <div className="chat-panel-body">
        { openChat && <ChatPane {...openChat!} /> }
      </div>

      {newChatDialogOpen && <NewChatDialog />}
    </div>
  );
}

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type {
  ChatMessage,
  SelectionContext,
  ChatSessionKind,
  MessageFeedback,
  ReasoningEffort,
  SimulationConfig,
  NaviFacts,
  NaviTraceEntry,
} from "../../types.ts";
import { SimulationContextBanner } from "../simulation/SimulationContextBanner.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { ChatComposerCard } from "./ChatComposerCard.tsx";
import { SuggestedActionsCard } from "./SuggestedActionsCard.tsx";
import { YesNoCard } from "./YesNoCard.tsx";
import { parseClarificationQuestions, parseYesNoQuestion } from "./clarificationUtils.ts";
import { ChatMessagesPane } from "./ChatMessagesPane.tsx";
import { NaviPlanCard } from "./NaviPlanCard.tsx";
import { naviPlanIsAvailable } from "./naviPlanExport.ts";
import "./ChatPane.css";

/** Chars above which auto-scroll stops following during streaming. */
const AUTOSCROLL_CHAR_LIMIT = 1500;

export interface ChatPaneProps {
  /** Conversation identity — drives state reset on switch. */
  conversationId: string;

  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  naviStep?: string | null;
  naviStateId?: string | null;
  naviFacts?: NaviFacts;
  naviTrace?: NaviTraceEntry[];
  showNaviTrace?: boolean;
  conversationTitle?: string;

  onSend: (message: string, clarificationData?: { questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>; selected: Record<number, string[]> }) => void;
  onStop: () => void;
  onEditMessage: (index: number, content: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  onRetry?: () => void;

  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;

  onDraftChange?: (text: string) => void;
  focusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  useReasoning?: boolean;
  onToggleReasoning?: () => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  rulesEnabled?: boolean;
  onToggleRules?: () => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;

  activeSessionKind?: ChatSessionKind;
  simulationConfig?: SimulationConfig;

  /** Glossary toolkit support (optional). */
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;

  theme?: "light" | "dark";
  fieldLabels?: Record<string, string>;
}

export function ChatPane({
  conversationId,
  messages,
  streaming,
  error,
  toolActivity,
  naviStep,
  naviStateId,
  naviFacts,
  naviTrace,
  showNaviTrace,
  conversationTitle,
  onSend,
  onStop,
  onEditMessage,
  onDeleteMessages,
  onSetMessageFeedback,
  onRetry,
  referencedFiles,
  onAddFile,
  onRemoveFile,
  onDraftChange,
  focusTriggerRef,
  useReasoning = false,
  onToggleReasoning,
  reasoningEffort = "medium",
  onReasoningEffortChange,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  rulesEnabled = true,
  onToggleRules,
  reasoningAvailable = true,
  fastAvailable = true,
  activeSelection = null,
  onDismissSelection,
  activeSessionKind = "standard",
  simulationConfig,
  onReplaceSelection,
  onApplyFieldUpdate,
  theme = "light",
  fieldLabels,
}: ChatPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const prevLastVisibleRoleRef = useRef<"user" | "assistant" | undefined>(
    undefined,
  );
  const prevStreamingRef = useRef(false);
  const autoScrollActiveRef = useRef(true);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [clarificationOtherOpen, setClarificationOtherOpen] = useState(false);

  void activeSessionKind;

  // Reset all per-conversation state on conversation switch
  useEffect(() => {
    setEditingIdx(null);
    setClarificationOtherOpen(false);
    autoScrollActiveRef.current = true;
    prevLastVisibleRoleRef.current = undefined;
  }, [conversationId]);

  // Scroll to bottom when conversation switches or messages first load
  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, [conversationId, messages.length]);

  useEffect(() => {
    prevLastVisibleRoleRef.current = undefined;
    autoScrollActiveRef.current = true;
  }, [conversationId]);

  // Re-enable follow-scroll when a new stream starts
  useEffect(() => {
    if (streaming && !prevStreamingRef.current) {
      autoScrollActiveRef.current = true;
    }
    prevStreamingRef.current = streaming;
  }, [streaming]);

  // Scroll to bottom on new user message
  useEffect(() => {
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    const role =
      last?.role === "user"
        ? "user"
        : last?.role === "assistant"
          ? "assistant"
          : undefined;
    const prev = prevLastVisibleRoleRef.current;
    if (role === "user" && prev !== "user") {
      const el = messagesScrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevLastVisibleRoleRef.current = role;
  }, [messages]);

  // Auto-scroll during streaming for small/medium replies
  useEffect(() => {
    if (!streaming) return;
    const visible = messages.filter((m) => !m.hidden);
    const last = visible[visible.length - 1];
    if (!last || last.role !== "assistant") return;
    if (!autoScrollActiveRef.current) return;
    if (last.content.length > AUTOSCROLL_CHAR_LIMIT) {
      autoScrollActiveRef.current = false;
      return;
    }
    const el = messagesScrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, streaming]);

  // Disable follow-scroll when user scrolls away from bottom during streaming
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el || !streaming) return;
    const onScroll = () => {
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 60) {
        autoScrollActiveRef.current = false;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [streaming]);

  const pendingClarification = useMemo(() => {
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    if (vis.length === 0) return null;

    // Find the index of the last user message to scope the search to the current turn.
    let lastUserVisIdx = -1;
    for (let i = vis.length - 1; i >= 0; i--) {
      if (vis[i]!.m.role === "user") {
        lastUserVisIdx = i;
        break;
      }
    }

    // Search backwards through the current assistant turn (after the last user message)
    // for a clarification fence — either in an assistant message or a tool result message.
    for (let i = vis.length - 1; i > lastUserVisIdx; i--) {
      const { m, originalIdx } = vis[i]!;
      if (m.role !== "assistant" && m.role !== "tool") continue;
      const qs = parseClarificationQuestions(m.content);
      if (!qs?.length) continue;
      // Make sure no user message comes after this message.
      const userAfter = messages
        .slice(originalIdx + 1)
        .some((msg) => !msg.hidden && msg.role === "user");
      if (userAfter) return null;
      return qs;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!pendingClarification) {
      setClarificationOtherOpen(false);
    }
  }, [pendingClarification]);

  const pendingYesNo = useMemo(() => {
    if (pendingClarification) return null;
    const vis = messages
      .map((m, originalIdx) => ({ m, originalIdx }))
      .filter(({ m }) => !m.hidden);
    if (vis.length === 0) return null;
    let lastUserVisIdx = -1;
    for (let i = vis.length - 1; i >= 0; i--) {
      if (vis[i]!.m.role === "user") { lastUserVisIdx = i; break; }
    }
    for (let i = vis.length - 1; i > lastUserVisIdx; i--) {
      const { m, originalIdx } = vis[i]!;
      if (m.role !== "assistant" && m.role !== "tool") continue;
      const q = parseYesNoQuestion(m.content);
      if (!q) continue;
      const userAfter = messages.slice(originalIdx + 1).some((msg) => !msg.hidden && msg.role === "user");
      if (userAfter) return null;
      return q;
    }
    return null;
  }, [messages, pendingClarification]);

  const cancelEdit = useCallback(() => setEditingIdx(null), []);

  const commitEdit = useCallback(
    (originalIdx: number, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onEditMessage(originalIdx, trimmed);
      setEditingIdx(null);
    },
    [onEditMessage],
  );

  return (
    <div ref={paneRef} className="chat-pane">
      <div className="chat-panel-body-main">
        <ChatMessagesPane
          messages={messages}
          readOnly={false}
          scrollRef={messagesScrollRef}
          streaming={streaming}
          error={error}
          toolActivity={toolActivity}
          naviStep={naviStep}
          naviStateId={naviStateId}
          naviTrace={naviTrace}
          showNaviTrace={showNaviTrace}
          editingIdx={editingIdx}
          setEditingIdx={setEditingIdx}
          onEditMessage={onEditMessage}
          onDeleteMessages={onDeleteMessages}
          onSetMessageFeedback={onSetMessageFeedback}
          commitEdit={commitEdit}
          cancelEdit={cancelEdit}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          fieldLabels={fieldLabels}
          onRetry={onRetry}
          theme={theme}
        />

        {simulationConfig && (
          <SimulationContextBanner simulationConfig={simulationConfig} />
        )}

        {naviStateId === "closing" && !streaming && naviPlanIsAvailable(naviFacts) && (
          <NaviPlanCard naviFacts={naviFacts!} conversationTitle={conversationTitle} />
        )}

        <div className="chat-composer-stack">
          {pendingClarification && pendingClarification.length > 0 ? (
            <ChatComposerCard>
              <SuggestedActionsCard
                questions={pendingClarification}
                onSubmit={onSend}
                disabled={streaming}
                onOtherOpen={setClarificationOtherOpen}
              />
            </ChatComposerCard>
          ) : null}
          {pendingYesNo ? (
            <ChatComposerCard>
              <YesNoCard
                question={pendingYesNo}
                onSubmit={(msg) => onSend(msg)}
                disabled={streaming}
              />
            </ChatComposerCard>
          ) : null}
          <ChatInput
            key={conversationId}
            onSend={onSend}
            onStop={onStop}
            streaming={streaming}
            disabled={clarificationOtherOpen}
            referencedFiles={referencedFiles}
            onAddFile={onAddFile}
            onRemoveFile={onRemoveFile}
            useReasoning={useReasoning && reasoningAvailable}
            onToggleReasoning={onToggleReasoning}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={onReasoningEffortChange}
            disabledToolkits={disabledToolkits}
            onToggleToolkit={onToggleToolkit}
            rulesEnabled={rulesEnabled}
            onToggleRules={onToggleRules}
            reasoningAvailable={reasoningAvailable}
            fastAvailable={fastAvailable}
            activeSelection={activeSelection}
            onDismissSelection={onDismissSelection}
            focusTriggerRef={focusTriggerRef}
            onDraftChange={onDraftChange}
          />
        </div>
      </div>
    </div>
  );
}

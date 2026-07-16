import { useMemo } from "react";
import type {
  ChatMessage,
  Mode,
  Conversation,
  SelectionContext,
  LlmPublic,
  ChatSessionKind,
  MessageFeedback,
  ReasoningEffort,
  SimulationConfig,
} from "../../types.ts";
import { ChatPane } from "./ChatPane.tsx";

function resolveGuidedExecutionSummary(
  modes: Mode[],
  selectedMode: string,
  llms: LlmPublic[],
  selectedLlmId: string | undefined,
): { modeLabel: string; llmLabel: string } {
  const modeLabel =
    modes.find((m) => m.id === selectedMode)?.name ?? selectedMode;
  const lid = selectedLlmId?.trim();
  const llmLabel = lid
    ? (llms.find((l) => l.id === lid)?.name ?? lid)
    : "Standard";
  return { modeLabel, llmLabel };
}

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  modes: Mode[];
  selectedMode: string;
  referencedFiles: string[];
  conversations: Conversation[];
  activeConversationId: string;
  useReasoning: boolean;
  onToggleReasoning: () => void;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (effort: ReasoningEffort) => void;
  disabledToolkits?: ReadonlySet<string>;
  onToggleToolkit?: (kitId: string) => void;
  rulesEnabled?: boolean;
  onToggleRules?: () => void;
  onModeChange: (mode: string) => void;
  onSend: (message: string, clarificationData?: { questions: Array<{ question: string; options: string[]; allow_multiple?: boolean }>; selected: Record<number, string[]> }) => void;
  onStop: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onEditMessage: (index: number, newContent: string) => void;
  onDeleteMessages: (indices: number[]) => void;
  onSetMessageFeedback: (index: number, feedback: MessageFeedback | null) => void;
  activeSessionKind?: ChatSessionKind;
  activeSelection?: SelectionContext | null;
  onDismissSelection?: () => void;
  onReplaceSelection?: (text: string, ctx: SelectionContext) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  chatFocusTriggerRef?: React.MutableRefObject<(() => void) | null>;
  llms?: LlmPublic[];
  selectedLlmId?: string;
  onLlmChange?: (id: string | undefined) => void;
  reasoningAvailable?: boolean;
  fastAvailable?: boolean;
  onRetry?: () => void;
  onComposerDraftChange?: (text: string) => void;
  theme?: "light" | "dark";
  naviStateId?: string | null;
  naviStep?: string | null;
  simulationConfig?: SimulationConfig;
  onOpenSimulationSetup?: () => void;
}

export function ChatPanel({
  messages,
  streaming,
  error,
  toolActivity,
  modes,
  selectedMode,
  referencedFiles,
  conversations,
  activeConversationId,
  useReasoning,
  onToggleReasoning,
  reasoningEffort = "medium",
  onReasoningEffortChange,
  disabledToolkits = new Set<string>(),
  onToggleToolkit,
  rulesEnabled = true,
  onToggleRules,
  onSend,
  onStop,
  onAddFile,
  onRemoveFile,
  onEditMessage,
  onDeleteMessages,
  onSetMessageFeedback,
  activeSelection = null,
  onDismissSelection,
  onReplaceSelection,
  onApplyFieldUpdate,
  fieldLabels,
  chatFocusTriggerRef,
  llms = [],
  selectedLlmId,
  reasoningAvailable = true,
  fastAvailable = true,
  onRetry,
  onComposerDraftChange,
  activeSessionKind = "standard",
  theme = "light",
  naviStateId,
  naviStep,
  simulationConfig,
}: ChatPanelProps) {
  /** Guided header must match persisted conversation (agent preset), not global toolbar state. */
  const guidedExecSummary = useMemo(() => {
    if (activeSessionKind !== "guided") return null;
    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) {
      return resolveGuidedExecutionSummary(
        modes,
        selectedMode,
        llms,
        selectedLlmId,
      );
    }
    const llmForLabel =
      conv.agentLlmId !== undefined ? conv.agentLlmId : selectedLlmId;
    return resolveGuidedExecutionSummary(modes, conv.mode, llms, llmForLabel);
  }, [
    activeSessionKind,
    conversations,
    activeConversationId,
    modes,
    selectedMode,
    llms,
    selectedLlmId,
  ]);

  return (
    <div className="chat-panel">
      {guidedExecSummary && (
        <div className="chat-header">
          <div
            className="chat-guided-execution-summary"
            role="status"
            aria-label={`Geführte Sitzung: Modus ${guidedExecSummary.modeLabel}, LLM ${guidedExecSummary.llmLabel}`}
            title={`Modus: ${guidedExecSummary.modeLabel} — LLM: ${guidedExecSummary.llmLabel}`}
          >
            <span className="chat-guided-execution-summary-text">
              {guidedExecSummary.modeLabel}
              <span className="chat-guided-execution-sep" aria-hidden>
                {" "}
                ·{" "}
              </span>
              {guidedExecSummary.llmLabel}
            </span>
          </div>
        </div>
      )}

      <div className="chat-panel-body">
        <ChatPane
          conversationId={activeConversationId}
          messages={messages}
          streaming={streaming}
          error={error}
          toolActivity={toolActivity}
          naviStep={naviStep}
          naviStateId={naviStateId}
          onSend={onSend}
          onStop={onStop}
          onEditMessage={onEditMessage}
          onDeleteMessages={onDeleteMessages}
          onSetMessageFeedback={onSetMessageFeedback}
          onRetry={onRetry}
          referencedFiles={referencedFiles}
          onAddFile={onAddFile}
          onRemoveFile={onRemoveFile}
          onDraftChange={onComposerDraftChange}
          focusTriggerRef={chatFocusTriggerRef}
          useReasoning={useReasoning}
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
          activeSessionKind={activeSessionKind}
          simulationConfig={simulationConfig}
          onReplaceSelection={onReplaceSelection}
          onApplyFieldUpdate={onApplyFieldUpdate}
          theme={theme}
          fieldLabels={fieldLabels}
        />
      </div>
    </div>
  );
}

interface AssistantTurnCardProps {
  originalIndices: number[];
  lastOriginalIdx: number;
  firstVisIdx: number;
  subUnits: unknown[];
  messages: unknown[];
  visibleEntries: unknown[];
  renderUnits: unknown[];
  readOnly: boolean;
  streaming: boolean;
  activeIsThread: boolean;
  bulkDismissIds: Set<string>;
  composerBatchForced: Record<string, unknown>;
  copiedIdx: number | null;
  setCopiedIdx: (idx: number | null) => void;
  onFileChanged?: (path: string) => void;
  onSnapshotSettled?: (
    snapshotId: string,
    state: "applied" | "reverted" | "dismissed",
  ) => void;
  onForkFromMessage: (index: number) => void;
  onStartThreadFromMessage: (index: number) => void;
  onForkToNewConversation: (index: number) => void;
  onDeleteMessages: (indices: number[]) => void;
  onUseMessageAsThreadSummary?: (index: number) => void;
  onReplaceSelection?: (text: string, ctx: unknown) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
}

export function AssistantTurnCard(_props: AssistantTurnCardProps) {
  return (
    <div className="assistant-turn-card-placeholder">
      AssistantTurnCard Placeholder
    </div>
  );
}

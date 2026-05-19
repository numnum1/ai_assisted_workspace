export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  hidden?: boolean;
  modeColor?: string;
  mode?: string;
  selectionContext?: SelectionContext;
  /** Present on assistant messages that preceded a tool call loop */
  toolCalls?: ToolCall[];
  /** Present on tool result messages */
  toolCallId?: string;
  /** When true, the message is a tool-chain message: stored in history but not shown in the UI */
  resolvedContent?: string;
  /** Special message kinds for non-standard rendering */
  kind?: "thread-summary";
  /** Present when kind === 'thread-summary' */
  threadSummaryMeta?: ThreadSummaryMeta;
}

export interface SelectionContext {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

export type CardState = "idle" | "loading" | "done";

export interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}

export interface ThreadSummaryMeta {
  fromThreadId: string;
  fromThreadTitle: string;
}

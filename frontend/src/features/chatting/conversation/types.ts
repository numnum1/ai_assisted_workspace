export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  hidden?: boolean;
  modeColor?: string;
  mode?: string;
  selectionContext?: SelectionContext;
}

export interface SelectionContext {
  filePath: string;
  startLine: number;
  endLine: number;
  selectedText: string;
}

export type CardState = "idle" | "loading" | "done";

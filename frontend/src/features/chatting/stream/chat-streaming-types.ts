export type StreamStatus =
  | "starting"
  | "streaming"
  | "done"
  | "error"
  | "stopped";

export type ChatStream = {
  chatId: string;
  streamId?: string;
  status: StreamStatus;
  assistantText: string;
  toolCallDescription?: string;
  errorMessage?: string;
  contextInfo?: {
    includedFiles: string[];
    estimatedTokens: number;
    maxContextTokens?: number;
  };
};

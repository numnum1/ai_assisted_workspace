import type { Chat } from "./Chat";

export type ChatViewModel = {
  streaming: boolean;
  send: () => void;
  cancel: () => void;
  setUserMessage: (newUserMessage: string) => void;
  setUseReasoning: (newUseReasoning: boolean) => void;
  enableToolById: (id: string) => void;
  disableToolById: (id: string) => void;
  rename: (newName: string) => void;
  selectMode: (newSelectedModeId: string) => void;
  selectLLM: (newSelectedLLM: string) => void;
  context: ChatContext;
} & Chat;


export type ChatContext = {
    placeholder: string;
}
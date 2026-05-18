import { createContext } from "react";
import type { ChatViewModel } from "./chat-view-model";

const defaultChatViewModel: ChatViewModel = {
  parentChatId: null,
  id: "",
  name: "",
  conversation: {
    turns: [],
  },
  settings: {
    selectedModeId: null,
    selectedLLM: {
      id: null,
      useReasoning: false,
    },
    enabledToolIds: [],
  },
  userMessage: "",
  streaming: false,
  send: () => {},
  cancel: () => {},
  setUserMessage: () => {},
  setUseReasoning: () => {},
  enableToolById: () => {},
  disableToolById: () => {},
  rename: () => {},
  selectMode: () => {},
  selectLLM: () => {},
  context: {
    estimatedTokens: 0,
    maxTokens: null,
    percent: null,
    includedFiles: [],
    systemPrompt: '',
  },
};

const ChatContext = createContext<ChatViewModel>(defaultChatViewModel);

export default ChatContext;

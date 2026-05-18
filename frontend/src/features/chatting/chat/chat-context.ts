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
  },
  streaming: false,
  send: () => {},
  cancel: () => {},
  setUserMessage: () => {},
  setUseReasoning: () => {},
};

const ChatContext = createContext<ChatViewModel>(defaultChatViewModel);

export default ChatContext;

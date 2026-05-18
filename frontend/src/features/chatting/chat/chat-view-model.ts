import type { Chat } from "./Chat";

export type ChatViewModel = {
    streaming: boolean;
    send: () => void;
    cancel: () => void;
    setUserMessage: React.Dispatch<React.SetStateAction<string>>;
    setUseReasoning: React.Dispatch<React.SetStateAction<boolean>>;
} & Chat
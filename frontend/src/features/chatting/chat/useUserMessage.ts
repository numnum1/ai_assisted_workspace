import { useSyncExternalStore } from "react";
import { getUserMessage, subscribeToUserMessage } from "./userMessageStore";

export function useUserMessage(chatId: string): string {
  return useSyncExternalStore(
    (listener) => subscribeToUserMessage(chatId, listener),
    () => getUserMessage(chatId),
    () => getUserMessage(chatId)
  );
}

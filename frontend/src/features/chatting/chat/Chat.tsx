import { useCallback } from "react";
import type { ChatSettings, Conversation } from "./unsortedChatTypes";

export type Chat = {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
};

export function ChatPane({
  parentChatId,
  id,
  name,
  conversation,
  settings,
  setChat,
  findChatById,
}: {
  parentChatId: string;
  id: string;
  name: string;
  conversation: Conversation;
  settings: ChatSettings;
  setChat: (id: string, patch: Partial<Chat>) => void;
  findChatById: (id: string) => Chat | null;
}) {
  const rename = useCallback(
    (newName: string) => {
      setChat(id, { name: newName });
    },
    [id, setChat],
  );

  return <div data-component="ChatPane">
    {JSON.stringify({parentChatId, id, name, conversation, settings, setChat, findChatById, rename})}
  </div>;
}

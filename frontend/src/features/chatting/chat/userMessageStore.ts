type Listener = () => void;

const messages = new Map<string, string>();
const listeners = new Map<string, Set<Listener>>();

export function getUserMessage(chatId: string): string {
  return messages.get(chatId) ?? "";
}

export function writeUserMessage(chatId: string, value: string): void {
  if (messages.get(chatId) === value) return;
  messages.set(chatId, value);
  listeners.get(chatId)?.forEach((l) => l());
}

export function subscribeToUserMessage(chatId: string, listener: Listener) {
  if (!listeners.has(chatId)) listeners.set(chatId, new Set());
  listeners.get(chatId)!.add(listener);
  return () => listeners.get(chatId)!.delete(listener);
}

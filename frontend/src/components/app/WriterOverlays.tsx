import { QuickChatWindow } from "../chat/QuickChatWindow.tsx";
import type { LlmPublic } from "../../types.ts";

export interface WriterOverlaysProps {
  quickChatOpen: boolean;
  onCloseQuickChat: () => void;
  llms: LlmPublic[];
  webSearchAvailable: boolean;
  disabledToolkits: ReadonlySet<string>;
}

export function WriterOverlays({
  quickChatOpen,
  onCloseQuickChat,
  llms,
  webSearchAvailable,
  disabledToolkits,
}: WriterOverlaysProps) {
  return (
    <QuickChatWindow
      open={quickChatOpen}
      onClose={onCloseQuickChat}
      llms={llms}
      webSearchAvailable={webSearchAvailable}
      disabledToolkits={disabledToolkits}
    />
  );
}

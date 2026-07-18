import { Plus } from 'lucide-react';

export interface NewChatButtonProps {
  onClick: () => void;
  /** Default matches ChatHistory (`.chat-history-new-btn`). */
  className?: string;
  title?: string;
}

export function NewChatButton({
  onClick,
  className = 'chat-history-new-btn',
  title = 'Neuer Chat',
}: NewChatButtonProps) {
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      <Plus size={14} />
    </button>
  );
}

import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { ChatMessage } from '../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  selectedMode: string;
  referencedFiles: string[];
  onModeChange: (mode: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onClear: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

export function ChatPanel({
  messages,
  streaming,
  error,
  selectedMode,
  referencedFiles,
  onModeChange,
  onSend,
  onStop,
  onClear,
  onAddFile,
  onRemoveFile,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <ModeSelector selectedMode={selectedMode} onModeChange={onModeChange} />
        <button className="chat-clear-btn" onClick={onClear} title="Clear chat">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Start a conversation with your AI assistant.</p>
            <p className="chat-empty-hint">
              Drag files from the project tree into the input area to reference them,
              or use @filename syntax in your message.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-role">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="chat-message-content">
              {msg.content}
            </div>
          </div>
        ))}
        {error && (
          <div className="chat-message error">
            <div className="chat-message-content">Error: {error}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={onSend}
        onStop={onStop}
        streaming={streaming}
        referencedFiles={referencedFiles}
        onAddFile={onAddFile}
        onRemoveFile={onRemoveFile}
      />
    </div>
  );
}

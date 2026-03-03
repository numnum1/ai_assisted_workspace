import { useEffect, useRef } from 'react';
import { Trash2, Search, Scissors } from 'lucide-react';
import type { ChatMessage, Mode } from '../types.ts';
import { ChatInput } from './ChatInput.tsx';
import { ModeSelector } from './ModeSelector.tsx';

interface ChatPanelProps {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  toolActivity: string | null;
  modes: Mode[];
  selectedMode: string;
  referencedFiles: string[];
  onModeChange: (mode: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onClear: () => void;
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  onForkFromMessage: (index: number) => void;
}

function getContrastingTextColor(hexColor?: string): string | undefined {
  if (!hexColor || !/^#[0-9A-Fa-f]{6}$/.test(hexColor)) return undefined;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e1e2e' : '#f5f5ff';
}

export function ChatPanel({
  messages,
  streaming,
  error,
  toolActivity,
  modes,
  selectedMode,
  referencedFiles,
  onModeChange,
  onSend,
  onStop,
  onClear,
  onAddFile,
  onRemoveFile,
  onForkFromMessage,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <ModeSelector modes={modes} selectedMode={selectedMode} onModeChange={onModeChange} />
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
          <div
            key={i}
            className={`chat-message ${msg.role}`}
            style={msg.role === 'user' && msg.modeColor ? {
              backgroundColor: msg.modeColor,
              borderLeftColor: msg.modeColor,
              color: getContrastingTextColor(msg.modeColor),
            } : undefined}
          >
            <div
              className="chat-message-role"
              style={msg.role === 'user' && msg.modeColor ? { color: getContrastingTextColor(msg.modeColor) } : undefined}
            >
              {msg.role === 'user' ? (
                <span>
                  You
                  {msg.mode && (
                    <span className="chat-message-mode" style={{ color: getContrastingTextColor(msg.modeColor) }}>
                      {' · '}{msg.mode}
                    </span>
                  )}
                </span>
              ) : (
                'Assistant'
              )}
            </div>
            <div className="chat-message-content">
              {msg.content}
            </div>
            {i > 0 && !streaming && (
              <button
                className="chat-fork-btn"
                onClick={() => onForkFromMessage(i)}
                title="Neuen Chat ab hier"
              >
                <Scissors size={12} />
              </button>
            )}
          </div>
        ))}
        {toolActivity && streaming && (
          <div className="chat-tool-activity">
            <Search size={14} className="chat-tool-activity-icon" />
            <span>{toolActivity}</span>
          </div>
        )}
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

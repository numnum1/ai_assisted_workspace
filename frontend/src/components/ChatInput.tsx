import { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';
import { FileChip } from './FileChip.tsx';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  streaming,
  referencedFiles,
  onAddFile,
  onRemoveFile,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, streaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath) {
      onAddFile(filePath);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleTextareaInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div
      className="chat-input-container"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {referencedFiles.length > 0 && (
        <div className="chat-input-files">
          {referencedFiles.map((f) => (
            <FileChip key={f} path={f} onRemove={onRemoveFile} />
          ))}
        </div>
      )}
      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleTextareaInput}
          placeholder={streaming ? 'AI is responding...' : 'Type a message... (Ctrl+Enter to send, drop files here)'}
          disabled={streaming}
          rows={1}
        />
        {streaming ? (
          <button className="chat-send-btn stop" onClick={onStop} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!text.trim()}
            title="Send (Ctrl+Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

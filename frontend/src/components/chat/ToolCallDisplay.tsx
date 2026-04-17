import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Play,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  Globe,
  BookOpen,
  Edit3,
  MessageSquare,
  GitBranch,
} from 'lucide-react';
import type { ToolCall } from '../../types.ts';

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  result?: string;
  isStreaming?: boolean;
  isLast?: boolean;
  /** First tool row of an assistant turn: start a thread from that assistant message index */
  onStartThread?: () => void;
}

/**
 * Renders a single tool call similar to Cursor's UI.
 * Shows name, collapsible arguments, status, and result.
 */
export function ToolCallDisplay({
  toolCall,
  result,
  isStreaming = false,
  isLast = false,
  onStartThread,
}: ToolCallDisplayProps) {
  const [isOpen, setIsOpen] = useState(true);
  const name = toolCall.function.name;
  const args = toolCall.function.arguments;
  let parsedArgs: any = {};

  try {
    parsedArgs = JSON.parse(args);
  } catch (e) {
    // fallback to raw if not valid JSON
  }

  const getIcon = () => {
    if (name.includes('write') || name.includes('edit')) return <Edit3 size={16} />;
    if (name.includes('read') || name.includes('wiki_read')) return <FileText size={16} />;
    if (name.includes('search') || name.includes('search_project')) return <Search size={16} />;
    if (name.includes('web')) return <Globe size={16} />;
    if (name.includes('glossary') || name.includes('wiki')) return <BookOpen size={16} />;
    if (name.includes('clarification')) return <AlertCircle size={16} />;
    if (name.includes('propose_guided_thread') || name.includes('guided_thread')) return <GitBranch size={16} />;
    return <Play size={16} />;
  };

  const resultIndicatesFailure = (r: string | undefined) => {
    if (!r) return false;
    if (r.includes('Error')) return true;
    if (r.startsWith('Wiki file not found:')) return true;
    if (r.startsWith('No wiki entries found')) return true;
    if (r.startsWith('Unknown tool:')) return true;
    return false;
  };

  const getStatus = () => {
    if (isStreaming) return { text: 'Running...', icon: <Play size={14} className="animate-spin" />, color: 'text-blue-500' };
    if (result && resultIndicatesFailure(result)) return { text: 'Failed', icon: <AlertCircle size={14} />, color: 'text-red-500' };
    return { text: 'Completed', icon: <CheckCircle2 size={14} />, color: 'text-green-500' };
  };

  const status = getStatus();
  const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className={`chat-tool-call ${isLast && isStreaming ? 'streaming' : ''}`}>
      <div className="chat-tool-call-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="chat-tool-call-icon">{getIcon()}</div>
        <div className="chat-tool-call-name">{displayName}</div>
        <div className={`chat-tool-call-status ${status.color}`}>
          {status.icon}
          <span>{status.text}</span>
        </div>
        {onStartThread && (
          <button
            type="button"
            className="chat-tool-call-thread-btn"
            title="Thread starten"
            onClick={(e) => {
              e.stopPropagation();
              onStartThread();
            }}
          >
            <MessageSquare size={14} />
          </button>
        )}
        <button type="button" className="chat-tool-call-toggle">
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {isOpen && (
        <div className="chat-tool-call-body">
          <div className="chat-tool-call-args">
            <div className="chat-tool-call-args-label">Arguments</div>
            <pre className="chat-tool-call-args-json">{JSON.stringify(parsedArgs, null, 2)}</pre>
          </div>

          {result && (
            <div className="chat-tool-call-result">
              <div className="chat-tool-call-result-label">Result</div>
              <div className="chat-tool-call-result-content">
                {result.length > 500 ? (
                  <details>
                    <summary>Show result ({result.length} chars)</summary>
                    <pre>{result}</pre>
                  </details>
                ) : (
                  <pre>{result}</pre>
                )}
              </div>
            </div>
          )}

          {isStreaming && (
            <div className="chat-tool-call-loading">
              <div className="chat-tool-call-loading-bar"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

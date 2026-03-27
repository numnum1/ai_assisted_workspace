import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Replace } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { SelectionContext } from '../types.ts';

interface ChatMessageMarkdownProps {
  content: string;
  streamingCursor?: boolean;
  selectionContext?: SelectionContext;
  onReplace?: (text: string) => void;
}

export function ChatMessageMarkdown({ content, streamingCursor, selectionContext, onReplace }: ChatMessageMarkdownProps) {
  const canReplace = !!(selectionContext && onReplace);

  const mdComponents: Components = {
    a: ({ href, children, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children?: React.ReactNode; [key: string]: unknown }) => {
      const codeText = String(children ?? '').replace(/\n$/, '');
      if (inline) {
        return <code className={className} {...props}>{children}</code>;
      }
      return (
        <div className="chat-code-block">
          <pre>
            <code className={className} {...props}>{children}</code>
          </pre>
          {canReplace && (
            <button
              type="button"
              className="chat-replace-btn"
              onClick={() => onReplace(codeText)}
              title="Auswahl im Editor ersetzen"
            >
              <Replace size={13} />
              <span>Ersetzen</span>
            </button>
          )}
        </div>
      );
    },
  };

  return (
    <div className="chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
      {streamingCursor && <span className="chat-streaming-cursor" aria-hidden="true">▌</span>}
    </div>
  );
}

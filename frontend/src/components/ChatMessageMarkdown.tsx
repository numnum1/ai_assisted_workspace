import { useMemo } from 'react';
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

  const mdComponents = useMemo<Components>(() => ({
    a: ({ href, children, ...props }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    ),
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: unknown }) => {
      // In react-markdown v10 the `inline` prop no longer exists.
      // Block code fences always have a language-* className; inline code does not.
      const isBlock = /language-/.test(className ?? '');
      if (!isBlock) {
        return <code className={className} {...props}>{children}</code>;
      }
      const codeText = String(children ?? '').replace(/\n$/, '');
      return (
        <div className="chat-code-block">
          <pre>
            <code className={className} {...props}>{children}</code>
          </pre>
          {canReplace && (
            <button
              type="button"
              className="chat-replace-btn"
              onClick={() => onReplace!(codeText)}
              title="Auswahl im Editor ersetzen"
            >
              <Replace size={13} />
              <span>Ersetzen</span>
            </button>
          )}
        </div>
      );
    },
  }), [canReplace, onReplace]);

  return (
    <div className="chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
      {streamingCursor && <span className="chat-streaming-cursor" aria-hidden="true">▌</span>}
    </div>
  );
}

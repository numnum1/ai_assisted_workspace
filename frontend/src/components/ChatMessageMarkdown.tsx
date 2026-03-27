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
    // Override pre to be a pass-through so our code component controls all wrapping.
    // Without this, react-markdown wraps our custom divs in <pre>, inheriting
    // white-space:pre and font-family:monospace which breaks the replace card layout.
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: unknown }) => {
      // In react-markdown v10 the `inline` prop no longer exists.
      // Block code fences have a language-* className; inline code does not.
      const isReplaceBlock = className === 'language-replace';
      const isCodeBlock = !isReplaceBlock && /language-/.test(className ?? '');

      if (isReplaceBlock) {
        const replaceText = String(children ?? '').replace(/\n$/, '');
        return (
          <div className="chat-replace-proposal">
            <div className="chat-replace-proposal-label">
              <Replace size={13} />
              <span>Vorgeschlagene Ersetzung</span>
            </div>
            <div className="chat-replace-proposal-content">{replaceText}</div>
            {canReplace && (
              <button
                type="button"
                className="chat-replace-btn"
                onClick={() => onReplace!(replaceText)}
                title="Auswahl im Editor ersetzen"
              >
                <Replace size={13} />
                <span>Ersetzen</span>
              </button>
            )}
          </div>
        );
      }

      if (!isCodeBlock) {
        // inline code
        return <code className={className} {...props}>{children}</code>;
      }

      // normal fenced code block
      return (
        <div className="chat-code-block">
          <pre>
            <code className={className} {...props}>{children}</code>
          </pre>
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

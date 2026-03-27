import { useMemo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Replace, Copy, Check, HelpCircle } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { SelectionContext } from '../types.ts';

interface ChatMessageMarkdownProps {
  content: string;
  streamingCursor?: boolean;
  selectionContext?: SelectionContext;
  onReplace?: (text: string) => void;
  onSelectOption?: (option: string) => void;
  isAnswered?: boolean;
}

export function ChatMessageMarkdown({ content, streamingCursor, selectionContext, onReplace, onSelectOption, isAnswered }: ChatMessageMarkdownProps) {
  const canReplace = !!(selectionContext && onReplace);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }).catch(() => { /* ignore */ });
  }, []);

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    code: ({ className, children, node, ...props }) => {
      // In react-markdown v10 the `inline` prop no longer exists.
      // Block code fences have a language-* className; inline code does not.
      const isReplaceBlock = className === 'language-replace';
      const isClarificationBlock = className === 'language-clarification';
      const isCodeBlock = !isReplaceBlock && !isClarificationBlock && /language-/.test(className ?? '');

      if (isReplaceBlock) {
        const replaceText = String(children ?? '').replace(/\n$/, '');
        // Use first 40 chars as a stable key for the copied-state indicator
        const blockKey = replaceText.slice(0, 40);
        const isCopied = copiedKey === blockKey;
        return (
          <div className="chat-replace-proposal">
            <div className="chat-replace-proposal-label">
              <Replace size={13} />
              <span>Vorgeschlagene Ersetzung</span>
            </div>
            <div className="chat-replace-proposal-content">{replaceText}</div>
            <div className="chat-replace-proposal-actions">
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
              <button
                type="button"
                className="chat-replace-btn secondary"
                onClick={() => handleCopy(replaceText, blockKey)}
                title="In Zwischenablage kopieren"
              >
                {isCopied ? <Check size={13} /> : <Copy size={13} />}
                <span>{isCopied ? 'Kopiert' : 'Kopieren'}</span>
              </button>
            </div>
          </div>
        );
      }

      if (isClarificationBlock) {
        const raw = String(children ?? '').trim();
        let question = '';
        let options: string[] = [];
        try {
          const parsed = JSON.parse(raw);
          question = parsed.question ?? '';
          options = Array.isArray(parsed.options) ? parsed.options : [];
        } catch {
          // Malformed JSON — render as plain code block so the raw content is still visible
          return (
            <div className="chat-code-block">
              <pre><code>{raw}</code></pre>
            </div>
          );
        }
        const disabled = streamingCursor || isAnswered;
        return (
          <div className={`chat-clarification${disabled ? ' answered' : ''}`}>
            <div className="chat-clarification-label">
              <HelpCircle size={13} />
              <span>Rückfrage</span>
            </div>
            <p className="chat-clarification-question">{question}</p>
            <div className="chat-clarification-options">
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="chat-clarification-btn"
                  disabled={!!disabled}
                  onClick={() => onSelectOption?.(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
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
  }), [canReplace, onReplace, copiedKey, handleCopy, streamingCursor, isAnswered, onSelectOption]);

  return (
    <div className="chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
      {streamingCursor && <span className="chat-streaming-cursor" aria-hidden="true">▌</span>}
    </div>
  );
}

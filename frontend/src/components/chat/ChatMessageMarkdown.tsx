import { useMemo, useState, useCallback, Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Replace, Copy, Check, HelpCircle, PenLine, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import type { Components } from 'react-markdown';
import type { SelectionContext } from '../../types.ts';
import { stripPlanFencesForDisplay } from './planFenceUtils.ts';
import { parseThinkSegments } from './thinkSegmentUtils.ts';

interface ChatMessageMarkdownProps {
  content: string;
  streamingCursor?: boolean;
  selectionContext?: SelectionContext;
  onReplace?: (text: string) => void;
  onApplyFieldUpdate?: (field: string, value: string) => void;
  fieldLabels?: Record<string, string>;
  /** When true, ```clarification blocks render as a compact hint (interaction lives in SuggestedActionsCard). */
  suppressClarificationWidget?: boolean;
  /** Legacy inline clarification (only when suppressClarificationWidget is false). */
  onSelectOption?: (option: string) => void;
  isAnswered?: boolean;
}

/** While `streaming` is true, the body stays visible so reasoning text can grow token-by-token; otherwise use the user toggle. */
function ThinkingChip({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = !!streaming || open;
  return (
    <div className="chat-thinking">
      <button
        type="button"
        className="chat-thinking-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
      >
        <Brain size={14} aria-hidden />
        <span>Denkprozess</span>
        <span className="chat-thinking-chevron">
          {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </span>
      </button>
      {expanded ? (
        <div className="chat-thinking-body">
          <pre>{text}</pre>
        </div>
      ) : null}
    </div>
  );
}

interface ClarificationQuestion {
  question: string;
  options: string[];
  allow_multiple?: boolean;
}

/** Non-interactive hint when clarification choices are shown in SuggestedActionsCard. */
function ClarificationCompactHint({ raw }: { raw: string }) {
  const questions = useMemo<ClarificationQuestion[] | null>(() => {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed.question === 'string') return [parsed];
      return null;
    } catch {
      return null;
    }
  }, [raw]);

  if (!questions?.length) {
    return (
      <div className="chat-clarification-compact">
        <HelpCircle size={13} aria-hidden />
        <span>Rückfrage</span>
      </div>
    );
  }

  return (
    <div className="chat-clarification-compact">
      <HelpCircle size={13} aria-hidden />
      <span className="chat-clarification-compact-label">Rückfrage</span>
      <div className="chat-clarification-compact-questions">
        {questions.map((q, i) => (
          <span key={i} className="chat-clarification-compact-q">
            {q.question}
          </span>
        ))}
      </div>
    </div>
  );
}

function ClarificationBlock({
  raw,
  streamingCursor,
  isAnswered,
  onSelectOption,
}: {
  raw: string;
  streamingCursor: boolean;
  isAnswered: boolean;
  onSelectOption?: (answer: string) => void;
}) {
  const questions = useMemo<ClarificationQuestion[] | null>(() => {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed.question === 'string') return [parsed];
      return null;
    } catch {
      return null;
    }
  }, [raw]);

  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions) {
    return (
      <div className="chat-code-block">
        <pre><code>{raw}</code></pre>
      </div>
    );
  }

  const disabled = streamingCursor || isAnswered || submitted;

  const allAnswered = questions.every((_, idx) => (selected[idx]?.length ?? 0) > 0);

  function toggleOption(qIdx: number, opt: string, allowMultiple: boolean) {
    if (disabled) return;
    setSelected((prev) => {
      const current = prev[qIdx] ?? [];
      if (allowMultiple) {
        const next = current.includes(opt)
          ? current.filter((o) => o !== opt)
          : [...current, opt];
        return { ...prev, [qIdx]: next };
      }
      return { ...prev, [qIdx]: [opt] };
    });
  }

  function handleSubmit() {
    if (!allAnswered || disabled) return;
    const lines = questions!.map((q, idx) => {
      const answers = selected[idx] ?? [];
      const answerText = answers.join(', ');
      if (questions!.length === 1 && !(q.allow_multiple)) {
        return answerText;
      }
      return `${q.question} → ${answerText}`;
    });
    const message = lines.join('\n');
    setSubmitted(true);
    onSelectOption?.(message);
  }

  return (
    <div className={`chat-clarification${disabled ? ' answered' : ''}`}>
      <div className="chat-clarification-label">
        <HelpCircle size={13} />
        <span>Rückfrage</span>
      </div>
      {questions.map((q, qIdx) => {
        const allowMultiple = q.allow_multiple ?? false;
        const inputType = allowMultiple ? 'checkbox' : 'radio';
        const groupName = `clarification-q-${qIdx}`;
        return (
          <div key={qIdx} className="chat-clarification-question-group">
            <p className="chat-clarification-question">{q.question}</p>
            <div className="chat-clarification-options">
              {q.options.map((opt, oIdx) => {
                const isSelected = (selected[qIdx] ?? []).includes(opt);
                const id = `${groupName}-${oIdx}`;
                return (
                  <label
                    key={oIdx}
                    htmlFor={id}
                    className={`chat-clarification-option-row${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                  >
                    <input
                      type={inputType}
                      id={id}
                      name={groupName}
                      value={opt}
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => toggleOption(qIdx, opt, allowMultiple)}
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      {!isAnswered && !submitted && (
        <div className="chat-clarification-footer">
          <button
            type="button"
            className="chat-clarification-submit"
            disabled={!allAnswered || disabled}
            onClick={handleSubmit}
          >
            Antworten
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Converts misformatted field-update blocks to the correct format.
 * Pass 1: handles ```json or ``` fences containing field-update JSON.
 * Pass 2: handles bare JSON objects (no code fence at all) the AI emits directly.
 */
function fixFieldUpdateBlocks(content: string): string {
  // Pass 1: fenced blocks tagged ```json or plain ```
  const pass1 = content.replace(
    /```(?:json)?\n([\s\S]*?)\n```/g,
    (match, body) => {
      const trimmed = body.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.field === 'string' && 'value' in parsed) {
          return '```field-update\n' + trimmed + '\n```';
        }
      } catch {
        // Not a field-update shape — leave unchanged
      }
      return match;
    },
  );

  // Pass 2: bare JSON objects not inside any code fence
  // Process line-by-line, accumulating brace-balanced JSON when a line starts with '{'
  const lines = pass1.split('\n');
  const result: string[] = [];
  let i = 0;
  let insideFence = false;

  while (i < lines.length) {
    const line = lines[i];

    // Track code-fence open/close (any line starting with ```)
    if (/^[ \t]*```/.test(line)) {
      insideFence = !insideFence;
      result.push(line);
      i++;
      continue;
    }

    if (!insideFence && line.trimStart().startsWith('{')) {
      // Accumulate lines until braces are balanced (respecting string literals)
      let depth = 0;
      let inStr = false;
      let esc = false;
      let accumulated = '';
      let consumed = i;

      for (let k = i; k < lines.length; k++) {
        accumulated += (k > i ? '\n' : '') + lines[k];
        for (const ch of lines[k]) {
          if (esc) { esc = false; continue; }
          if (ch === '\\') { esc = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (!inStr) {
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; }
          }
        }
        consumed = k + 1;
        if (depth === 0) break;
      }

      if (depth === 0) {
        try {
          const parsed = JSON.parse(accumulated.trim());
          if (parsed && typeof parsed.field === 'string' && 'value' in parsed) {
            result.push('```field-update');
            result.push(accumulated.trim());
            result.push('```');
            i = consumed;
            continue;
          }
        } catch {
          // Not valid JSON or not a field-update shape — fall through
        }
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

export function ChatMessageMarkdown({
  content,
  streamingCursor,
  selectionContext,
  onReplace,
  onApplyFieldUpdate,
  fieldLabels,
  suppressClarificationWidget = false,
  onSelectOption,
  isAnswered,
}: ChatMessageMarkdownProps) {
  const canReplace = !!(selectionContext && onReplace);
  const processedContent = useMemo(
    () => onApplyFieldUpdate ? fixFieldUpdateBlocks(content) : content,
    [content, onApplyFieldUpdate],
  );
  const displayContent = useMemo(
    () => stripPlanFencesForDisplay(processedContent, !!streamingCursor),
    [processedContent, streamingCursor],
  );
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
      const isFieldUpdateBlock = className === 'language-field-update';
      const isPlanBlock = className === 'language-plan';
      const isCodeBlock =
        !isReplaceBlock &&
        !isClarificationBlock &&
        !isFieldUpdateBlock &&
        !isPlanBlock &&
        /language-/.test(className ?? '');

      if (isPlanBlock) {
        return null;
      }

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

      if (isFieldUpdateBlock) {
        const raw = String(children ?? '').trim();
        let field = '';
        let value = '';
        try {
          const parsed = JSON.parse(raw);
          field = parsed.field ?? '';
          value = parsed.value ?? '';
        } catch {
          return (
            <div className="chat-code-block">
              <pre><code>{raw}</code></pre>
            </div>
          );
        }
        if (!field) return null;
        const label = fieldLabels?.[field] ?? field;
        const blockKey = `fu-${field}-${value.slice(0, 30)}`;
        const isCopied = copiedKey === blockKey;
        return (
          <div className="chat-field-update">
            <div className="chat-field-update-label">
              <PenLine size={13} />
              <span>Feld-Vorschlag</span>
              <span className="chat-field-update-fieldname">{label}</span>
            </div>
            <div className="chat-field-update-content">{value}</div>
            <div className="chat-replace-proposal-actions">
              {onApplyFieldUpdate && (
                <button
                  type="button"
                  className="chat-replace-btn"
                  onClick={() => onApplyFieldUpdate(field, value)}
                  title={`„${label}" übernehmen`}
                >
                  <PenLine size={13} />
                  <span>Anwenden</span>
                </button>
              )}
              <button
                type="button"
                className="chat-replace-btn secondary"
                onClick={() => handleCopy(value, blockKey)}
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
        if (suppressClarificationWidget) {
          return <ClarificationCompactHint raw={raw} />;
        }
        return (
          <ClarificationBlock
            raw={raw}
            streamingCursor={!!streamingCursor}
            isAnswered={!!isAnswered}
            onSelectOption={onSelectOption}
          />
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
  }), [canReplace, onReplace, onApplyFieldUpdate, fieldLabels, copiedKey, handleCopy, streamingCursor, suppressClarificationWidget, isAnswered, onSelectOption]);

  const thinkSegments = useMemo(
    () => parseThinkSegments(displayContent, !!streamingCursor),
    [displayContent, streamingCursor],
  );

  return (
    <div className="chat-md">
      {thinkSegments.map((seg, i) => (
        <Fragment key={i}>
          {seg.kind === 'markdown' ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {seg.text}
            </ReactMarkdown>
          ) : (
            <ThinkingChip text={seg.text} streaming={seg.streaming} />
          )}
        </Fragment>
      ))}
      {streamingCursor && <span className="chat-streaming-cursor" aria-hidden="true">▌</span>}
    </div>
  );
}

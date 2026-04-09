import { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import type { ClarificationQuestion } from './clarificationUtils.ts';

const OTHER_LABEL = 'Andere…';

export interface SuggestedActionsCardProps {
  questions: ClarificationQuestion[];
  onSubmit: (message: string) => void;
  /** True while the assistant message is still streaming — freezes interaction. */
  disabled: boolean;
}

function isCustomAnswer(q: ClarificationQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  return !q.options.includes(answer);
}

export function SuggestedActionsCard({
  questions,
  onSubmit,
  disabled,
}: SuggestedActionsCardProps) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [otherDraft, setOtherDraft] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setSelected({});
    setOtherOpen({});
    setOtherDraft({});
    setSubmitted(false);
  }, [questions]);

  useEffect(() => {
    const openIdx = Object.keys(otherOpen).find((k) => otherOpen[Number(k)]);
    if (openIdx !== undefined) {
      document.getElementById(`suggested-other-${openIdx}`)?.focus();
    }
  }, [otherOpen]);

  const frozen = disabled || submitted;

  const allAnswered = questions.every((_, idx) => (selected[idx]?.length ?? 0) > 0);

  const commitOther = useCallback(
    (qIdx: number, q: ClarificationQuestion) => {
      const draft = (otherDraft[qIdx] ?? '').trim();
      if (!draft || frozen) return;
      const allowMultiple = q.allow_multiple ?? false;
      setSelected((prev) => {
        if (allowMultiple) {
          const cur = prev[qIdx] ?? [];
          if (cur.includes(draft)) return prev;
          return { ...prev, [qIdx]: [...cur, draft] };
        }
        return { ...prev, [qIdx]: [draft] };
      });
      setOtherDraft((d) => ({ ...d, [qIdx]: '' }));
      setOtherOpen((o) => ({ ...o, [qIdx]: false }));
    },
    [otherDraft, frozen],
  );

  const togglePresetPill = (qIdx: number, opt: string, q: ClarificationQuestion) => {
    if (frozen) return;
    const allowMultiple = q.allow_multiple ?? false;
    setOtherOpen((o) => ({ ...o, [qIdx]: false }));
    setSelected((prev) => {
      const cur = prev[qIdx] ?? [];
      if (allowMultiple) {
        const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
        return { ...prev, [qIdx]: next };
      }
      return { ...prev, [qIdx]: [opt] };
    });
  };

  const openOther = (qIdx: number, q: ClarificationQuestion) => {
    if (frozen) return;
    const allowMultiple = q.allow_multiple ?? false;
    if (!allowMultiple) {
      setSelected((prev) => ({ ...prev, [qIdx]: [] }));
    }
    setOtherOpen((o) => ({ ...o, [qIdx]: true }));
  };

  const handleSubmit = () => {
    if (!allAnswered || frozen) return;
    const lines = questions.map((q, idx) => {
      const answers = selected[idx] ?? [];
      const answerText = answers.join(', ');
      if (questions.length === 1 && !q.allow_multiple) {
        return answerText;
      }
      return `${q.question} → ${answerText}`;
    });
    const message = lines.join('\n');
    setSubmitted(true);
    onSubmit(message);
  };

  return (
    <div className={`suggested-actions-card${frozen ? ' frozen' : ''}`}>
      <div className="suggested-actions-card-header">
        <MessageSquare size={14} aria-hidden />
        <span>Rückfrage</span>
      </div>
      <div className="suggested-actions-card-body">
        {questions.map((q, qIdx) => {
          const allowMultiple = q.allow_multiple ?? false;
          const sel = selected[qIdx] ?? [];
          const open = otherOpen[qIdx] ?? false;
          const otherActiveSingle =
            !allowMultiple && sel.length === 1 && isCustomAnswer(q, sel[0]);
          const otherActiveMulti =
            allowMultiple && sel.some((s) => !q.options.includes(s));

          return (
            <div key={qIdx} className="suggested-actions-question-block">
              <p className="suggested-actions-question">{q.question}</p>
              <div className="suggested-actions-pills">
                {q.options.map((opt) => {
                  const isOn = sel.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      className={`suggested-actions-pill${isOn ? ' selected' : ''}`}
                      disabled={frozen}
                      onClick={() => togglePresetPill(qIdx, opt, q)}
                    >
                      {opt}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`suggested-actions-pill suggested-actions-pill--other${open || otherActiveSingle || otherActiveMulti ? ' selected' : ''}`}
                  disabled={frozen}
                  onClick={() => openOther(qIdx, q)}
                >
                  {OTHER_LABEL}
                </button>
              </div>
              {open ? (
                <div className="suggested-actions-other-row">
                  <input
                    id={`suggested-other-${qIdx}`}
                    type="text"
                    className="suggested-actions-other-input"
                    placeholder="Eigene Antwort…"
                    value={otherDraft[qIdx] ?? ''}
                    disabled={frozen}
                    onChange={(e) =>
                      setOtherDraft((d) => ({ ...d, [qIdx]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitOther(qIdx, q);
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setOtherOpen((o) => ({ ...o, [qIdx]: false }));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="suggested-actions-other-confirm"
                    disabled={frozen || !(otherDraft[qIdx] ?? '').trim()}
                    onClick={() => commitOther(qIdx, q)}
                  >
                    OK
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!frozen && (
        <div className="suggested-actions-card-footer">
          <button
            type="button"
            className="suggested-actions-submit"
            disabled={!allAnswered}
            onClick={handleSubmit}
          >
            Antworten
          </button>
        </div>
      )}
    </div>
  );
}

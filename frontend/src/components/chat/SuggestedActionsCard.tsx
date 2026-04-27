import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { ClarificationQuestion } from "./clarificationUtils.ts";

const OTHER_LABEL = "Andere…";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as string[];

function choiceLetter(i: number): string {
  return i < LETTERS.length ? LETTERS[i]! : String(i + 1);
}

export interface SuggestedActionsCardProps {
  questions: ClarificationQuestion[];
  onSubmit: (message: string) => void;
  /** True while the assistant message is still streaming — freezes interaction. */
  disabled: boolean;
  /** Called when the "Andere…" free-text input opens or closes for any question. */
  onOtherOpen?: (open: boolean) => void;
}

function isCustomAnswer(
  q: ClarificationQuestion,
  answer: string | undefined,
): boolean {
  if (!answer) return false;
  return !q.options.includes(answer);
}

/** Answers as they would be after committing any open „Andere…“ draft (mirrors `commitOther`). */
function effectiveSelected(
  questions: ClarificationQuestion[],
  selected: Record<number, string[]>,
  otherOpen: Record<number, boolean>,
  otherDraft: Record<number, string>,
): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  questions.forEach((q, idx) => {
    const allowMultiple = q.allow_multiple ?? false;
    const base = [...(selected[idx] ?? [])];
    const open = otherOpen[idx] ?? false;
    const draft = (otherDraft[idx] ?? "").trim();
    if (open && draft) {
      if (allowMultiple) {
        out[idx] = base.includes(draft) ? base : [...base, draft];
      } else {
        out[idx] = [draft];
      }
    } else {
      out[idx] = base;
    }
  });
  return out;
}

function buildMessage(
  questions: ClarificationQuestion[],
  selected: Record<number, string[]>,
): string {
  const lines = questions.map((q, idx) => {
    const answers = selected[idx] ?? [];
    const answerText = answers.join(", ");
    if (questions.length === 1 && !q.allow_multiple) {
      return answerText;
    }
    return `${q.question} → ${answerText}`;
  });
  return lines.join("\n");
}

export function SuggestedActionsCard({
  questions,
  onSubmit,
  disabled,
  onOtherOpen,
}: SuggestedActionsCardProps) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  const [otherDraft, setOtherDraft] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const onOtherOpenRef = useRef(onOtherOpen);
  onOtherOpenRef.current = onOtherOpen;

  const frozenRef = useRef(false);
  frozenRef.current = disabled || submitted;

  const autoSubmitMode =
    questions.length === 1 && !(questions[0]?.allow_multiple ?? false);
  const needsSubmitButton = !autoSubmitMode;

  useEffect(() => {
    setSelected({});
    setOtherOpen({});
    setOtherDraft({});
    setSubmitted(false);
    onOtherOpenRef.current?.(false);
  }, [questions]);

  useEffect(() => {
    const openIdx = Object.keys(otherOpen).find((k) => otherOpen[Number(k)]);
    if (openIdx !== undefined) {
      document.getElementById(`sac-other-${openIdx}`)?.focus();
    }
    const anyOpen = Object.values(otherOpen).some(Boolean);
    onOtherOpenRef.current?.(anyOpen);
  }, [otherOpen]);

  const frozen = disabled || submitted;

  const effective = useMemo(
    () => effectiveSelected(questions, selected, otherOpen, otherDraft),
    [questions, selected, otherOpen, otherDraft],
  );

  const allAnswered = questions.every(
    (_, idx) => (effective[idx]?.length ?? 0) > 0,
  );

  const submitMessage = useCallback(
    (message: string) => {
      setSubmitted(true);
      onSubmit(message);
    },
    [onSubmit],
  );

  const handleSubmit = useCallback(() => {
    if (frozen) return;
    if (!questions.every((_, idx) => (effective[idx]?.length ?? 0) > 0)) return;
    submitMessage(buildMessage(questions, effective));
    setOtherOpen({});
    setOtherDraft({});
  }, [frozen, questions, effective, submitMessage]);

  const selectPreset = useCallback(
    (qIdx: number, opt: string, allowMultiple: boolean) => {
      if (frozenRef.current) return;
      setOtherOpen((o) => ({ ...o, [qIdx]: false }));
      setSelected((prev) => {
        const cur = prev[qIdx] ?? [];
        if (allowMultiple) {
          const next = cur.includes(opt)
            ? cur.filter((x) => x !== opt)
            : [...cur, opt];
          return { ...prev, [qIdx]: next };
        }
        return { ...prev, [qIdx]: [opt] };
      });
    },
    [],
  );

  const onPresetClick = useCallback(
    (qIdx: number, opt: string, q: ClarificationQuestion) => {
      if (frozenRef.current) return;
      const allowMultiple = q.allow_multiple ?? false;
      if (!allowMultiple && questions.length === 1) {
        setSubmitted(true);
        onSubmit(opt);
        return;
      }
      selectPreset(qIdx, opt, allowMultiple);
    },
    [questions.length, onSubmit, selectPreset],
  );

  const openOther = useCallback((qIdx: number, q: ClarificationQuestion) => {
    if (frozenRef.current) return;
    const allowMultiple = q.allow_multiple ?? false;
    if (!allowMultiple) {
      setSelected((prev) => ({ ...prev, [qIdx]: [] }));
    }
    setOtherOpen((o) => ({ ...o, [qIdx]: true }));
  }, []);

  const commitOther = useCallback(
    (qIdx: number, q: ClarificationQuestion) => {
      const draft = (otherDraft[qIdx] ?? "").trim();
      if (!draft || frozenRef.current) return;
      const allowMultiple = q.allow_multiple ?? false;

      if (!allowMultiple && questions.length === 1) {
        setSubmitted(true);
        onSubmit(draft);
        setOtherDraft((d) => ({ ...d, [qIdx]: "" }));
        setOtherOpen((o) => ({ ...o, [qIdx]: false }));
        return;
      }

      setSelected((prev) => {
        if (allowMultiple) {
          const cur = prev[qIdx] ?? [];
          if (cur.includes(draft)) return prev;
          return { ...prev, [qIdx]: [...cur, draft] };
        }
        return { ...prev, [qIdx]: [draft] };
      });
      setOtherDraft((d) => ({ ...d, [qIdx]: "" }));
      setOtherOpen((o) => ({ ...o, [qIdx]: false }));
    },
    [otherDraft, questions.length, onSubmit],
  );

  useEffect(() => {
    if (!autoSubmitMode || frozen) return;
    const q = questions[0]!;

    const onKeyDown = (e: KeyboardEvent) => {
      if (frozenRef.current) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const k = e.key.toUpperCase();
      if (k < "A" || k > "Z") return;
      const idx = k.charCodeAt(0) - 65;
      const total = q.options.length + 1;
      if (idx >= total) return;
      e.preventDefault();
      if (idx === q.options.length) {
        openOther(0, q);
      } else {
        const opt = q.options[idx];
        if (opt !== undefined) {
          setSubmitted(true);
          onSubmit(opt);
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [autoSubmitMode, frozen, questions, onSubmit, openOther]);

  return (
    <div className={`sac-surface${frozen ? " frozen" : ""}`}>
      <div className="sac-body">
        {questions.map((q, qIdx) => {
          const allowMultiple = q.allow_multiple ?? false;
          const sel = selected[qIdx] ?? [];
          const open = otherOpen[qIdx] ?? false;
          const otherActiveSingle =
            !allowMultiple && sel.length === 1 && isCustomAnswer(q, sel[0]);
          const otherActiveMulti =
            allowMultiple && sel.some((s) => !q.options.includes(s));

          const rows: {
            key: string;
            label: string;
            isOther: boolean;
            opt?: string;
          }[] = q.options.map((opt, i) => ({
            key: `opt-${qIdx}-${i}`,
            label: opt,
            isOther: false,
            opt,
          }));
          rows.push({
            key: `other-${qIdx}`,
            label: OTHER_LABEL,
            isOther: true,
          });

          return (
            <div key={qIdx} className="sac-block">
              <p className="sac-question">{q.question}</p>
              <div className="sac-options">
                {rows.map((row, i) => {
                  const letter = choiceLetter(i);
                  const isOn = row.isOther
                    ? open || otherActiveSingle || otherActiveMulti
                    : row.opt !== undefined && sel.includes(row.opt);
                  return (
                    <div key={row.key} className="sac-option-wrap">
                      <button
                        type="button"
                        className={`sac-option${isOn ? " selected" : ""}`}
                        disabled={frozen}
                        onClick={() => {
                          if (row.isOther) {
                            openOther(qIdx, q);
                          } else if (row.opt !== undefined) {
                            onPresetClick(qIdx, row.opt, q);
                          }
                        }}
                      >
                        <span className="sac-letter" aria-hidden>
                          {letter}
                        </span>
                        <span className="sac-option-text">{row.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {open ? (
                <div className="sac-other-row">
                  <input
                    id={`sac-other-${qIdx}`}
                    type="text"
                    className="sac-other-input"
                    placeholder="Eigene Antwort…"
                    value={otherDraft[qIdx] ?? ""}
                    disabled={frozen}
                    onChange={(e) =>
                      setOtherDraft((d) => ({ ...d, [qIdx]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitOther(qIdx, q);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setOtherOpen((o) => ({ ...o, [qIdx]: false }));
                      }
                    }}
                    onBlur={() => {
                      const draft = (otherDraft[qIdx] ?? "").trim();
                      if (!draft || frozen) return;
                      commitOther(qIdx, q);
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {!frozen && needsSubmitButton ? (
        <div className="sac-footer">
          <button
            type="button"
            className="sac-submit"
            disabled={!allAnswered}
            onClick={handleSubmit}
          >
            Antworten
          </button>
        </div>
      ) : null}
    </div>
  );
}

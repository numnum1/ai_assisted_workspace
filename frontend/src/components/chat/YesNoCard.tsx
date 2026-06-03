import { useState, useEffect, useRef } from "react";
import type { YesNoQuestion } from "./clarificationUtils.ts";

export interface YesNoCardProps {
  question: YesNoQuestion;
  onSubmit: (message: string) => void;
  disabled: boolean;
}

export function YesNoCard({ question, onSubmit, disabled }: YesNoCardProps) {
  const [submitted, setSubmitted] = useState(false);
  const [choice, setChoice] = useState<"ja" | "nein" | null>(null);

  const frozenRef = useRef(false);
  frozenRef.current = disabled || submitted;

  useEffect(() => {
    setSubmitted(false);
    setChoice(null);
  }, [question]);

  const pick = (answer: "ja" | "nein") => {
    if (frozenRef.current) return;
    setChoice(answer);
    setSubmitted(true);
    onSubmit(answer === "ja" ? "Ja" : "Nein");
  };

  useEffect(() => {
    if (disabled || submitted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (frozenRef.current) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") { e.preventDefault(); pick("ja"); }
      else if (k === "n") { e.preventDefault(); pick("nein"); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [disabled, submitted]);

  const frozen = disabled || submitted;

  return (
    <div className={`ync-surface${frozen ? " frozen" : ""}`}>
      {question.question && (
        <p className="ync-question">{question.question}</p>
      )}
      <div className="ync-buttons">
        <button
          type="button"
          className={`ync-btn ync-yes${choice === "ja" ? " chosen" : ""}`}
          disabled={frozen}
          onClick={() => pick("ja")}
        >
          <span className="ync-key" aria-hidden>J</span>
          Ja
        </button>
        <button
          type="button"
          className={`ync-btn ync-no${choice === "nein" ? " chosen" : ""}`}
          disabled={frozen}
          onClick={() => pick("nein")}
        >
          <span className="ync-key" aria-hidden>N</span>
          Nein
        </button>
      </div>
    </div>
  );
}

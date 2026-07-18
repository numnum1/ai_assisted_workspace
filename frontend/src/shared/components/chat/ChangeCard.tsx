import { useState, useEffect, useCallback, useRef } from "react";
import {
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
} from "lucide-react";
import { filesApi, snapshotsApi } from "../../api.ts";
import { type DiffLine, computeDiff, collapseDiff } from "../../utils/diffUtils.ts";

export interface ChangeCardData {
  snapshotId: string;
  path: string;
  isNew: boolean;
  description: string;
}

export type CardState = "pending" | "applied" | "reverted";

interface ChangeCardProps {
  data: ChangeCardData;
  onApply?: (snapshotId: string) => void;
  onRevert?: (snapshotId: string, path: string, wasNew: boolean) => void;
  /** Called after apply or revert so the editor and file tree refresh */
  onFileChanged?: (path: string) => void;
  /** When set (e.g. batch „Alle anwenden“), overrides local state for display and actions */
  forcedCardState?: CardState;
  /**
   * Once per card: fires when the card is settled.
   * state = 'applied' | 'reverted' when the user explicitly accepted/reverted;
   * state = 'dismissed' when auto-dismissed (no diff found or snapshot no longer exists).
   */
  onSnapshotSettled?: (
    snapshotId: string,
    state: "applied" | "reverted" | "dismissed",
  ) => void;
}

const DISMISS_DELAY_MS = 1500;

export function ChangeCard({
  data,
  onApply,
  onRevert,
  onFileChanged,
  forcedCardState,
  onSnapshotSettled,
}: ChangeCardProps) {
  const { snapshotId, path, isNew, description } = data;

  const [cardState, setCardState] = useState<CardState>("pending");
  const displayState: CardState = forcedCardState ?? cardState;
  const [expanded, setExpanded] = useState(true);
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** Prevents more than one load attempt regardless of state changes. */
  const loadAttemptedRef = useRef(false);
  const settledNotifiedRef = useRef(false);

  const notifySnapshotSettled = useCallback(
    (state: "applied" | "reverted" | "dismissed") => {
      if (settledNotifiedRef.current) return;
      settledNotifiedRef.current = true;
      onSnapshotSettled?.(snapshotId, state);
    },
    [onSnapshotSettled, snapshotId],
  );

  const dismissAndSettle = useCallback(() => {
    notifySnapshotSettled("dismissed");
    setDismissed(true);
  }, [notifySnapshotSettled]);

  const loadDiff = useCallback(async () => {
    if (loadAttemptedRef.current) return;
    loadAttemptedRef.current = true;
    setLoading(true);
    try {
      const [snapshot, fileJson] = await Promise.all([
        snapshotsApi.get(snapshotId),
        filesApi.getContent(path),
      ]);
      const fileText: string = fileJson.content ?? "";
      if (!snapshot) {
        dismissAndSettle();
        return;
      }
      if (isNew) {
        const lines = fileText
          .split("\n")
          .map((line) => ({ type: "added" as const, content: line }));
        if (
          lines.length === 0 ||
          (lines.length === 1 && lines[0].content === "")
        ) {
          dismissAndSettle();
          return;
        }
        setDiffLines(lines);
      } else {
        const raw = computeDiff(snapshot.oldContent ?? "", fileText);
        const collapsed = collapseDiff(raw);
        const hasChanges = collapsed.some((l) => l.type !== "context");
        if (!hasChanges) {
          dismissAndSettle();
          return;
        }
        setDiffLines(collapsed);
      }
    } finally {
      setLoading(false);
    }
  }, [snapshotId, path, isNew, dismissAndSettle]);

  useEffect(() => {
    if (cardState === "pending") {
      loadDiff();
    }
  }, [cardState, loadDiff]);

  useEffect(() => {
    if (displayState === "applied" || displayState === "reverted") {
      const timer = setTimeout(() => setDismissed(true), DISMISS_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [displayState]);

  const handleApply = async () => {
    setBusy(true);
    try {
      await snapshotsApi.apply(snapshotId);
      notifySnapshotSettled("applied");
      setCardState("applied");
      onApply?.(snapshotId);
      onFileChanged?.(path);
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async () => {
    setBusy(true);
    try {
      const result = await snapshotsApi.revert(snapshotId);
      notifySnapshotSettled("reverted");
      setCardState("reverted");
      onRevert?.(snapshotId, path, result.wasNew);
      onFileChanged?.(path);
    } finally {
      setBusy(false);
    }
  };

  const addedCount = diffLines?.filter((l) => l.type === "added").length ?? 0;
  const removedCount =
    diffLines?.filter((l) => l.type === "removed").length ?? 0;

  if (dismissed) return null;

  return (
    <div
      className={`change-card change-card--${displayState}`}
      data-testid="ChangeCard"
    >
      <div
        className="change-card-header"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="change-card-expand">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="change-card-icon">
          {isNew ? <FilePlus size={14} /> : <FileText size={14} />}
        </span>
        <span className="change-card-path">{path}</span>
        <span
          className={`change-card-badge ${isNew ? "change-card-badge--new" : "change-card-badge--modified"}`}
        >
          {isNew ? "Neue Datei" : "Geändert"}
        </span>
        {diffLines && (
          <span className="change-card-stats">
            {addedCount > 0 && (
              <span className="change-card-added">+{addedCount}</span>
            )}
            {removedCount > 0 && (
              <span className="change-card-removed">−{removedCount}</span>
            )}
          </span>
        )}
        {displayState !== "pending" && (
          <span
            className={`change-card-status change-card-status--${displayState}`}
          >
            {displayState === "applied" ? "✓ Angenommen" : "↩ Rückgängig"}
          </span>
        )}
      </div>

      {description && (
        <div className="change-card-description">{description}</div>
      )}

      {expanded && (
        <div className="change-card-diff">
          {loading && <div className="change-card-loading">Lade Diff…</div>}
          {!loading &&
            diffLines &&
            diffLines.map((line, idx) => (
              <div key={idx} className={`diff-line diff-line--${line.type}`}>
                <span className="diff-line-marker">
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "−"
                      : " "}
                </span>
                <span className="diff-line-content">
                  {line.content === "…" ? (
                    <em className="diff-ellipsis">…</em>
                  ) : (
                    line.content || "\u00a0"
                  )}
                </span>
              </div>
            ))}
        </div>
      )}

      {displayState === "pending" && (
        <div className="change-card-actions">
          <button
            className="change-card-btn change-card-btn--apply"
            disabled={busy}
            onClick={handleApply}
          >
            <Check size={13} />
            Apply
          </button>
          <button
            className="change-card-btn change-card-btn--revert"
            disabled={busy}
            onClick={handleRevert}
          >
            <RotateCcw size={13} />
            Revert
          </button>
        </div>
      )}
    </div>
  );
}

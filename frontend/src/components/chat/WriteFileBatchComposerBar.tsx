import { useState, useCallback } from 'react';
import { Check, RotateCcw, ChevronDown, ChevronRight, FileText, FilePlus } from 'lucide-react';
import type { CardState } from './ChangeCard.tsx';
import type { WriteFileBatchItem } from './writeFileBatchUtils.ts';
import { applyAllSnapshots, revertAllSnapshots } from './snapshotBatchActions.ts';

interface WriteFileBatchComposerBarProps {
  items: WriteFileBatchItem[];
  onFileChanged?: (path: string) => void;
  disabled?: boolean;
  /** Called after a successful apply-all or revert-all with the snapshot → state map. */
  onBulkComplete: (patch: Record<string, CardState>) => void;
}

export function WriteFileBatchComposerBar({
  items,
  onFileChanged,
  disabled = false,
  onBulkComplete,
}: WriteFileBatchComposerBarProps) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const applyAll = useCallback(async () => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const patch = await applyAllSnapshots(
        items.map((i) => i.data),
        onFileChanged,
      );
      onBulkComplete(patch);
    } finally {
      setBusy(false);
    }
  }, [items, onFileChanged, onBulkComplete]);

  const revertAll = useCallback(async () => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const patch = await revertAllSnapshots(
        items.map((i) => i.data),
        onFileChanged,
      );
      onBulkComplete(patch);
    } finally {
      setBusy(false);
    }
  }, [items, onFileChanged, onBulkComplete]);

  if (items.length === 0) return null;

  const n = items.length;
  const summary = n === 1 ? '1 pending change' : `${n} pending changes`;
  const ariaLabel =
    n === 1
      ? 'One pending file change. Revert all or accept all.'
      : `${n} pending file changes. Revert all or accept all.`;

  return (
    <div className="wf-batch-composer wf-batch-composer--compact chat-pending-changes-bar">
      <div className="wf-batch-composer-row" role="toolbar" aria-label={ariaLabel}>
        <button
          type="button"
          className="wf-batch-composer-summary wf-batch-composer-summary--toggle"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {summary}
        </button>
        <div className="wf-batch-composer-actions">
          <button
            type="button"
            className="wf-batch-btn wf-batch-btn--revert wf-batch-btn--compact"
            disabled={disabled || busy}
            onClick={revertAll}
            title="Discard all pending edits from this batch"
          >
            <RotateCcw size={13} strokeWidth={2} />
            Revert All
          </button>
          <button
            type="button"
            className="wf-batch-btn wf-batch-btn--accept wf-batch-btn--compact"
            disabled={disabled || busy}
            onClick={applyAll}
            title="Apply all pending edits to disk"
          >
            <Check size={13} strokeWidth={2} />
            Accept All
          </button>
        </div>
      </div>
      {expanded && (
        <ul className="wf-batch-composer-filelist">
          {items.map(({ originalIdx, data }) => (
            <li key={originalIdx} className="wf-batch-composer-fileitem">
              <span className="wf-batch-composer-fileicon">
                {data.isNew ? <FilePlus size={13} /> : <FileText size={13} />}
              </span>
              <span className="wf-batch-composer-filepath">{data.path}</span>
              <span
                className={`change-card-badge ${data.isNew ? 'change-card-badge--new' : 'change-card-badge--modified'}`}
              >
                {data.isNew ? 'Neue Datei' : 'Geändert'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

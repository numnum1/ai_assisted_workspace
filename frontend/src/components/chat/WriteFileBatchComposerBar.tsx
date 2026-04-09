import { useState, useCallback } from 'react';
import { Check, RotateCcw } from 'lucide-react';
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
  const title =
    n === 1
      ? 'One pending file change — accept or revert above the input.'
      : `${n} pending file changes — accept or revert all at once.`;

  return (
    <div className="wf-batch-composer sac-surface chat-pending-changes-bar">
      <p className="wf-batch-composer-title">{title}</p>
      <div className="sac-footer wf-batch-composer-footer">
        <button
          type="button"
          className="wf-batch-btn wf-batch-btn--revert"
          disabled={disabled || busy}
          onClick={revertAll}
        >
          <RotateCcw size={14} />
          Revert All
        </button>
        <button
          type="button"
          className="sac-submit wf-batch-btn"
          disabled={disabled || busy}
          onClick={applyAll}
        >
          <Check size={14} />
          Accept All
        </button>
      </div>
    </div>
  );
}

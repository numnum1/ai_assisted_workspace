import { useCallback } from "react";
import { ChangeCard, type CardState } from "./ChangeCard.tsx";
import type { WriteFileBatchItem } from "./writeFileBatchUtils.ts";

export type ChangeCardGroupItem = WriteFileBatchItem;

interface ChangeCardGroupProps {
  items: ChangeCardGroupItem[];
  onFileChanged?: (path: string) => void;
  /** For trailing batch: forced state after composer „Accept All" / „Revert All". */
  externalForced?: Record<string, CardState>;
  onSnapshotSettled?: (
    snapshotId: string,
    state: "applied" | "reverted" | "dismissed",
  ) => void;
}

export function ChangeCardGroup({
  items,
  onFileChanged,
  externalForced,
  onSnapshotSettled,
}: ChangeCardGroupProps) {
  const forcedBySnapshot = externalForced ?? {};

  const makeSettledHandler = useCallback(
    () => (snapshotId: string, state: "applied" | "reverted" | "dismissed") => {
      onSnapshotSettled?.(snapshotId, state);
    },
    [onSnapshotSettled],
  );

  if (items.length === 1) {
    const only = items[0]!;
    return (
      <div className="change-card-wrapper">
        <ChangeCard
          data={only.data}
          onFileChanged={onFileChanged}
          forcedCardState={forcedBySnapshot[only.data.snapshotId]}
          onSnapshotSettled={makeSettledHandler()}
        />
      </div>
    );
  }

  return (
    <div className="change-card-group">
      {items.map(({ originalIdx, data }) => (
        <div key={originalIdx} className="change-card-wrapper">
          <ChangeCard
            data={data}
            onFileChanged={onFileChanged}
            forcedCardState={forcedBySnapshot[data.snapshotId]}
            onSnapshotSettled={makeSettledHandler()}
          />
        </div>
      ))}
    </div>
  );
}

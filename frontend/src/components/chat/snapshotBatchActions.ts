import type { ChangeCardData } from './ChangeCard.tsx';

/**
 * POST /apply for each snapshot; treats 404 as already applied.
 * @returns snapshotId → applied for each successful call
 */
export async function applyAllSnapshots(
  dataList: ChangeCardData[],
  onFileChanged?: (path: string) => void,
): Promise<Record<string, 'applied'>> {
  const results = await Promise.allSettled(
    dataList.map((data) =>
      fetch(`/api/snapshots/${data.snapshotId}/apply`, { method: 'POST' }),
    ),
  );
  const out: Record<string, 'applied'> = {};
  dataList.forEach((data, idx) => {
    const r = results[idx];
    if (r.status === 'fulfilled' && (r.value.ok || r.value.status === 404)) {
      out[data.snapshotId] = 'applied';
      onFileChanged?.(data.path);
    }
  });
  return out;
}

/**
 * POST /revert for each snapshot; treats 404 as already reverted.
 */
export async function revertAllSnapshots(
  dataList: ChangeCardData[],
  onFileChanged?: (path: string) => void,
): Promise<Record<string, 'reverted'>> {
  const results = await Promise.allSettled(
    dataList.map((data) =>
      fetch(`/api/snapshots/${data.snapshotId}/revert`, { method: 'POST' }),
    ),
  );
  const out: Record<string, 'reverted'> = {};
  dataList.forEach((data, idx) => {
    const r = results[idx];
    if (r.status === 'fulfilled' && (r.value.ok || r.value.status === 404)) {
      out[data.snapshotId] = 'reverted';
      onFileChanged?.(data.path);
    }
  });
  return out;
}

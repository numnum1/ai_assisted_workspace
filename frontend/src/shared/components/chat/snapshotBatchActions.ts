import type { ChangeCardData } from "./ChangeCard.tsx";
import { snapshotsApi } from "../../api.ts";

/**
 * Apply each snapshot; treats missing snapshots as already applied.
 * @returns snapshotId → applied for each successful call
 */
export async function applyAllSnapshots(
  dataList: ChangeCardData[],
  onFileChanged?: (path: string) => void,
): Promise<Record<string, "applied">> {
  const results = await Promise.allSettled(
    dataList.map((data) => snapshotsApi.apply(data.snapshotId)),
  );
  const out: Record<string, "applied"> = {};
  dataList.forEach((data, idx) => {
    const r = results[idx];
    if (r.status === "fulfilled") {
      out[data.snapshotId] = "applied";
      onFileChanged?.(data.path);
    }
  });
  return out;
}

/**
 * Revert each snapshot; treats missing snapshots as already reverted.
 */
export async function revertAllSnapshots(
  dataList: ChangeCardData[],
  onFileChanged?: (path: string) => void,
): Promise<Record<string, "reverted">> {
  const results = await Promise.allSettled(
    dataList.map((data) => snapshotsApi.revert(data.snapshotId)),
  );
  const out: Record<string, "reverted"> = {};
  dataList.forEach((data, idx) => {
    const r = results[idx];
    if (r.status === "fulfilled") {
      out[data.snapshotId] = "reverted";
      onFileChanged?.(data.path);
    }
  });
  return out;
}

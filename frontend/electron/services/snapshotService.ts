interface SnapshotRecord {
  id: string;
  path: string;
  oldContent: string;
  wasNew: boolean;
  createdAt: number;
}

const snapshots = new Map<string, SnapshotRecord>();

function createSnapshotId(): string {
  return `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface SnapshotDto {
  id: string;
  path: string;
  oldContent: string;
  wasNew: boolean;
  createdAt: number;
}

export interface SnapshotApplyResult {
  status: "applied";
}

export interface SnapshotRevertResult {
  status: "reverted";
  path: string;
  wasNew: boolean;
}

export function createSnapshot(
  path: string,
  oldContent: string,
  wasNew: boolean,
): SnapshotDto {
  const id = createSnapshotId();
  const snapshot: SnapshotRecord = {
    id,
    path,
    oldContent,
    wasNew,
    createdAt: Date.now(),
  };
  snapshots.set(id, snapshot);
  return { ...snapshot };
}

export function getSnapshot(id: string): SnapshotDto | null {
  const snapshot = snapshots.get(id);
  if (!snapshot) {
    return null;
  }
  return { ...snapshot };
}

export function hasSnapshot(id: string): boolean {
  return snapshots.has(id);
}

export function discardSnapshot(id: string): void {
  snapshots.delete(id);
}

export function applySnapshot(id: string): SnapshotApplyResult | null {
  if (!snapshots.has(id)) {
    return null;
  }
  snapshots.delete(id);
  return { status: "applied" };
}

export function revertSnapshot(
  id: string,
  handlers: {
    writeFile: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
  },
): Promise<SnapshotRevertResult | null> {
  const snapshot = snapshots.get(id);
  if (!snapshot) {
    return Promise.resolve(null);
  }

  const result: SnapshotRevertResult = {
    status: "reverted",
    path: snapshot.path,
    wasNew: snapshot.wasNew,
  };

  return (async () => {
    if (snapshot.wasNew) {
      await handlers.deleteFile(snapshot.path);
    } else {
      await handlers.writeFile(snapshot.path, snapshot.oldContent);
    }
    snapshots.delete(id);
    return result;
  })();
}

export function listSnapshots(): SnapshotDto[] {
  return [...snapshots.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((snapshot) => ({ ...snapshot }));
}

import type { CardState } from "./types.ts";
import type { ChangeCardData } from "./chatRenderUnits.ts";

export type ChangeCardGroupItem = {
  originalIdx: number;
  data: ChangeCardData;
};

interface ChangeCardGroupProps {
  items: ChangeCardGroupItem[];
  onFileChanged?: (path: string) => void;
  externalForced?: Record<string, CardState>;
  onSnapshotSettled?: (
    snapshotId: string,
    state: "applied" | "reverted" | "dismissed",
  ) => void;
}

export function ChangeCardGroup(props: ChangeCardGroupProps) {
  void props;
  return null;
}

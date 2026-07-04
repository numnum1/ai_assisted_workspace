export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

/** Simple LCS-based line diff. */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  const m = oldLines.length;
  const n = newLines.length;

  // For large files, limit context to avoid overwhelming display
  const MAX_LINES = 500;
  if (m + n > MAX_LINES * 2) {
    // Just show added lines for huge files
    for (const line of newLines.slice(0, MAX_LINES)) {
      result.push({ type: "added", content: line });
    }
    if (newLines.length > MAX_LINES) {
      result.push({
        type: "context",
        content: `... (${newLines.length - MAX_LINES} more lines)`,
      });
    }
    return result;
  }

  // DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "context", content: oldLines[i] });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i + 1][j] <= dp[i][j + 1])) {
      result.push({ type: "added", content: newLines[j] });
      j++;
    } else {
      result.push({ type: "removed", content: oldLines[i] });
      i++;
    }
  }

  return result;
}

export function collapseDiff(lines: DiffLine[], contextLines = 3): DiffLine[] {
  const ELLIPSIS = "…";
  const result: DiffLine[] = [];
  const isChanged = lines.map((l) => l.type !== "context");

  let i = 0;
  while (i < lines.length) {
    if (isChanged[i]) {
      result.push(lines[i]);
      i++;
    } else {
      // Find next changed line
      let nextChanged = i;
      while (nextChanged < lines.length && !isChanged[nextChanged]) {
        nextChanged++;
      }
      const contextCount = nextChanged - i;
      if (contextCount <= contextLines * 2 + 1) {
        for (let k = i; k < nextChanged; k++) result.push(lines[k]);
      } else {
        for (let k = i; k < i + contextLines; k++) result.push(lines[k]);
        result.push({ type: "context", content: ELLIPSIS });
        for (let k = nextChanged - contextLines; k < nextChanged; k++)
          result.push(lines[k]);
      }
      i = nextChanged;
    }
  }
  return result;
}

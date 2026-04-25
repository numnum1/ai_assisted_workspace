import type { ChangeCardData } from './ChangeCard.tsx';

/**
 * Parses {@code write_file:success:{snapshotId}:{new|modified}:{path}:{description}} from a tool message.
 * Messages with prefix {@code write_file:applied:} or {@code write_file:reverted:} are intentionally
 * excluded — they represent already-settled changes and must not appear in the pending list.
 */
export function parseWriteFileToolMessage(content: string | undefined | null): ChangeCardData | null {
  if (!content?.startsWith('write_file:success:')) return null;
  const rest = content.slice('write_file:success:'.length);
  const parts = rest.split(':');
  if (parts.length < 4) return null;
  const snapshotId = parts[0]!;
  const isNew = parts[1] === 'new';
  const path = parts[2]!;
  const description = parts.slice(3).join(':');
  return { snapshotId, path, isNew, description };
}

/**
 * Rewrites a {@code write_file:success:…} tool message content to reflect that the change
 * was settled (applied or reverted). The updated content is then persisted with the conversation
 * so the "Pending changes" bar does not reappear after an app restart.
 *
 * Returns the original string unchanged if it does not start with {@code write_file:success:}.
 */
export function settleWriteFileMessage(
  content: string,
  state: 'applied' | 'reverted',
): string {
  if (!content?.startsWith('write_file:success:')) return content;
  return 'write_file:' + state + ':' + content.slice('write_file:success:'.length);
}

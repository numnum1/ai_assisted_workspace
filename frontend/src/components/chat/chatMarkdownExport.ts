import type { Conversation, ConversationMessage } from '../../types.ts';
import { extractMessageText } from '../../types.ts';

export function safeDownloadBasename(title: string): string {
  const t = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'chat';
  return t.length > 80 ? t.slice(0, 80) : t;
}

export function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [];
  lines.push(`# ${conv.title.replace(/\n/g, ' ')}`);
  lines.push('');
  lines.push(`_Aktualisiert: ${new Date(conv.updatedAt).toISOString()}_`);
  if (conv.mode) {
    lines.push(`_Modus: ${conv.mode}_`);
  }
  lines.push('');

  for (const m of conv.messages) {
    const role = m.messageType === 'USER' ? 'User' : 'Assistant';
    lines.push(`### ${role}`);
    lines.push('');
    // Render each visible part
    for (const part of m.parts) {
      if (part.type === 'CHAT' || part.type === 'THOUGHTS' || part.type === 'EXPLORING') {
        const body = part.content.trim();
        if (body) {
          lines.push(body);
          lines.push('');
        }
      } else if (part.type === 'READ_FILE') {
        lines.push(`_[Datei gelesen: \`${part.file}\`]_`);
        lines.push('');
      } else if (part.type === 'READ_LINES') {
        lines.push(`_[Zeilen gelesen: \`${part.file}\` ${part.startLine}–${part.endLine}]_`);
        lines.push('');
      }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function downloadMarkdownFile(filenameBase: string, markdown: string): void {
  const name = `${safeDownloadBasename(filenameBase)}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

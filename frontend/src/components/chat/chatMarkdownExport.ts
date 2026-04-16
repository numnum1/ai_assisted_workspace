import type { ChatMessage, Conversation } from '../../types.ts';

export function safeDownloadBasename(title: string): string {
  const t = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'chat';
  return t.length > 80 ? t.slice(0, 80) : t;
}

function roleHeading(role: ChatMessage['role']): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'tool') return 'Tool';
  return role;
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
    if (m.hidden) continue;
    if (m.role === 'system') continue;
    lines.push(`### ${roleHeading(m.role)}`);
    lines.push('');
    const body = (m.content ?? '').trim();
    if (body) {
      lines.push(body);
      lines.push('');
    }
    if (m.toolCalls?.length) {
      lines.push('_(Tool-Aufrufe in dieser Nachricht)_');
      for (const tc of m.toolCalls) {
        const args = tc.function?.arguments ?? '';
        const short = args.length > 400 ? `${args.slice(0, 400)}…` : args;
        lines.push(`- \`${tc.function?.name ?? tc.type}\`: \`${short.replace(/`/g, "'")}\``);
      }
      lines.push('');
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

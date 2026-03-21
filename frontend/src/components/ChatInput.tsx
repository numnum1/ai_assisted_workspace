import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, BookOpen, Layers, Library, Sparkles } from 'lucide-react';
import { FileChip } from './FileChip.tsx';
import type { ChapterNode, WikiType, WikiEntry } from '../types.ts';

type AutocompleteItem = {
  type: 'chapter' | 'scene' | 'wiki' | 'alias';
  title: string;
  path: string;
  breadcrumb: string;
};

const FIXED_ITEMS: AutocompleteItem[] = [
  { type: 'alias', title: 'Story', path: 'Story', breadcrumb: 'Buch-Metadaten' },
];

function filterItems(items: AutocompleteItem[], query: string): AutocompleteItem[] {
  const limit = 20;
  if (!query) return items.slice(0, limit);
  const q = query.toLowerCase();
  return items.filter(item => item.title.toLowerCase().includes(q)).slice(0, limit);
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

export function ChatInput({
  onSend,
  onStop,
  streaming,
  referencedFiles,
  onAddFile,
  onRemoveFile,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [ac, setAc] = useState<{
    query: string;
    atIndex: number;
    items: AutocompleteItem[];
    selectedIdx: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemsCacheRef = useRef<AutocompleteItem[] | null>(null);
  const loadingRef = useRef(false);

  // Close on outside click
  useEffect(() => {
    if (!ac) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current !== e.target
      ) {
        setAc(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [!!ac]);

  // Scroll selected item into view
  useEffect(() => {
    if (!ac || !dropdownRef.current) return;
    const els = dropdownRef.current.querySelectorAll<HTMLElement>('.ac-item');
    const filtered = filterItems(ac.items, ac.query);
    const idx = Math.min(ac.selectedIdx, filtered.length - 1);
    if (idx >= 0 && els[idx]) {
      els[idx].scrollIntoView({ block: 'nearest' });
    }
  }, [ac?.selectedIdx]);

  const loadItems = useCallback(async (): Promise<AutocompleteItem[]> => {
    if (itemsCacheRef.current) return itemsCacheRef.current;

    const [summaries, wikiTypes] = await Promise.all([
      fetch('/api/chapters').then(r => r.json()) as Promise<Array<{ id: string; meta: { title: string } }>>,
      fetch('/api/wiki/types').then(r => r.json()) as Promise<WikiType[]>,
    ]);

    const details = await Promise.all(
      summaries.map(s => fetch(`/api/chapters/${s.id}`).then(r => r.json()) as Promise<ChapterNode>)
    );

    const items: AutocompleteItem[] = [];

    // Chapters and scenes (no actions)
    for (const chapter of details) {
      const chapterTitle = chapter.meta.title || chapter.id;
      items.push({
        type: 'chapter',
        title: chapterTitle,
        path: `.project/chapter/${chapter.id}.json`,
        breadcrumb: '',
      });
      for (const scene of chapter.scenes) {
        const sceneTitle = scene.meta.title || scene.id;
        items.push({
          type: 'scene',
          title: sceneTitle,
          path: `.project/chapter/${chapter.id}/${scene.id}.json`,
          breadcrumb: chapterTitle,
        });
      }
    }

    // Wiki entries (respecting excludeFromMentions)
    const includedTypes = wikiTypes.filter(t => !t.excludeFromMentions);
    const wikiEntries = await Promise.all(
      includedTypes.map(t =>
        fetch(`/api/wiki/types/${t.id}/entries`)
          .then(r => r.json())
          .then((entries: WikiEntry[]) => ({ type: t, entries }))
      )
    );
    for (const { type: wType, entries } of wikiEntries) {
      for (const entry of entries) {
        const displayName = entry.values['name'] || entry.values['title'] || entry.id;
        items.push({
          type: 'wiki',
          title: displayName,
          path: `.wiki/entries/${wType.id}/${entry.id}.json`,
          breadcrumb: wType.name,
        });
      }
    }

    // Fixed aliases always at the top
    const allItems = [...FIXED_ITEMS, ...items];
    itemsCacheRef.current = allItems;
    return allItems;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    onSend(trimmed);
    setText('');
    setAc(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, streaming, onSend]);

  const selectItem = useCallback(
    (item: AutocompleteItem) => {
      if (!ac) return;
      const textarea = textareaRef.current;
      if (!textarea) return;

      const queryEnd = ac.atIndex + 1 + ac.query.length;
      const newText = text.slice(0, ac.atIndex) + '@' + item.path + ' ' + text.slice(queryEnd);
      setText(newText);
      setAc(null);

      const newCursor = ac.atIndex + 1 + item.path.length + 1;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
    [ac, text]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursor = e.target.selectionStart ?? newText.length;
    setText(newText);

    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';

    // Detect @ pattern — stop at whitespace; ignore already-inserted paths (contain / or start with .)
    const textBefore = newText.slice(0, cursor);
    const atMatch = textBefore.match(/@(\S*)$/);

    if (atMatch) {
      const query = atMatch[1];
      if (query.includes('/') || query.startsWith('.')) {
        setAc(null);
        return;
      }
      const atIndex = cursor - atMatch[0].length;

      const cached = itemsCacheRef.current;
      if (cached) {
        setAc({ query, atIndex, items: cached, selectedIdx: 0 });
      } else {
        setAc(prev =>
          prev
            ? { ...prev, query, atIndex, selectedIdx: 0 }
            : { query, atIndex, items: [], selectedIdx: 0 }
        );
        if (!loadingRef.current) {
          loadingRef.current = true;
          loadItems()
            .then(items => {
              loadingRef.current = false;
              setAc(prev => (prev ? { ...prev, items } : null));
            })
            .catch(() => {
              loadingRef.current = false;
            });
        }
      }
    } else {
      setAc(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (ac) {
      const filtered = filterItems(ac.items, ac.query);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAc(prev =>
          prev ? { ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, filtered.length - 1) } : null
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAc(prev =>
          prev ? { ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, 0) } : null
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) {
        e.preventDefault();
        selectItem(filtered[Math.min(ac.selectedIdx, filtered.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAc(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath) onAddFile(filePath);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const filteredItems = ac ? filterItems(ac.items, ac.query) : [];

  return (
    <div className="chat-input-container" onDrop={handleDrop} onDragOver={handleDragOver}>
      {ac && filteredItems.length > 0 && (
        <div ref={dropdownRef} className="ac-dropdown">
          {filteredItems.map((item, idx) => (
            <div
              key={item.path}
              className={`ac-item${idx === ac.selectedIdx ? ' ac-item-active' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                selectItem(item);
              }}
              onMouseEnter={() =>
                setAc(prev => (prev ? { ...prev, selectedIdx: idx } : null))
              }
            >
              <span className="ac-item-icon">
                {item.type === 'alias' ? (
                  <Sparkles size={13} />
                ) : item.type === 'chapter' ? (
                  <BookOpen size={13} />
                ) : item.type === 'scene' ? (
                  <Layers size={13} />
                ) : (
                  <Library size={13} />
                )}
              </span>
              <span className="ac-item-title">{item.title}</span>
              {item.breadcrumb && (
                <span className="ac-item-breadcrumb">{item.breadcrumb}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {referencedFiles.length > 0 && (
        <div className="chat-input-files">
          {referencedFiles.map(f => (
            <FileChip key={f} path={f} onRemove={onRemoveFile} />
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            streaming
              ? 'AI is responding...'
              : 'Nachricht... (Enter senden, Shift+Enter neue Zeile, @ für Kapitel/Szenen/Wiki)'
          }
          disabled={streaming}
          rows={1}
        />
        {streaming ? (
          <button className="chat-send-btn stop" onClick={onStop} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!text.trim()}
            title="Send (Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

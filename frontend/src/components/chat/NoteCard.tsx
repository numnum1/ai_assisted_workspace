import { useState } from 'react';
import { StickyNote, X, Save, BookOpen, ChevronDown, ChevronUp, Check, Loader2, Copy } from 'lucide-react';
import type { NoteProposal, WikiType, WikiEntry } from '../../types.ts';

interface NoteCardProps {
  note: NoteProposal;
  wikiTypes: WikiType[];
  wikiEntriesByType: Record<string, WikiEntry[]>;
  onSaveFree: (note: NoteProposal) => Promise<void>;
  onAttachToEntry: (note: NoteProposal, typeId: string, entryId: string) => Promise<void>;
  onDismiss: (id: string) => void;
  onLoadEntries: (typeId: string) => Promise<void>;
}

type CardState = 'idle' | 'saving' | 'saved' | 'dismissed';

export function NoteCard({
  note,
  wikiTypes,
  wikiEntriesByType,
  onSaveFree,
  onAttachToEntry,
  onDismiss,
  onLoadEntries,
}: NoteCardProps) {
  const [cardState, setCardState] = useState<CardState>('idle');
  const [copied, setCopied] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(() => {
    if (note.wikiHint) {
      const slash = note.wikiHint.indexOf('/');
      return slash > 0 ? note.wikiHint.substring(0, slash) : '';
    }
    return '';
  });
  const [selectedEntryId, setSelectedEntryId] = useState<string>(() => {
    if (note.wikiHint) {
      const slash = note.wikiHint.indexOf('/');
      return slash > 0 ? note.wikiHint.substring(slash + 1) : '';
    }
    return '';
  });

  if (cardState === 'dismissed') return null;

  const handleSaveFree = async () => {
    setCardState('saving');
    try {
      await onSaveFree(note);
      setCardState('saved');
    } catch {
      setCardState('idle');
    }
  };

  const handleToggleAttach = async () => {
    if (!attachOpen && selectedTypeId && !wikiEntriesByType[selectedTypeId]) {
      await onLoadEntries(selectedTypeId);
    }
    setAttachOpen((prev) => !prev);
  };

  const handleTypeChange = async (typeId: string) => {
    setSelectedTypeId(typeId);
    setSelectedEntryId('');
    if (typeId && !wikiEntriesByType[typeId]) {
      await onLoadEntries(typeId);
    }
  };

  const handleAttach = async () => {
    if (!selectedTypeId || !selectedEntryId) return;
    setCardState('saving');
    try {
      await onAttachToEntry(note, selectedTypeId, selectedEntryId);
      setCardState('saved');
    } catch {
      setCardState('idle');
    }
  };

  const entries = selectedTypeId ? (wikiEntriesByType[selectedTypeId] ?? []) : [];

  const handleCopy = async () => {
    const text = `${note.title}\n\n${note.content}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`note-card ${cardState === 'saved' ? 'note-card--saved' : ''}`}>
      <div className="note-card-header">
        <div className="note-card-title-row">
          <StickyNote size={13} className="note-card-icon" />
          <span className="note-card-label">Notiz-Vorschlag</span>
          <button
            type="button"
            className="note-card-copy"
            onClick={handleCopy}
            title={copied ? 'Kopiert' : 'In Zwischenablage kopieren'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {cardState !== 'saved' && (
            <button
              type="button"
              className="note-card-dismiss"
              onClick={() => onDismiss(note.id)}
              title="Verwerfen"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <div className="note-card-title">{note.title}</div>
        {note.wikiHint && cardState !== 'saved' && (
          <div className="note-card-wiki-hint">
            <BookOpen size={11} />
            <span>{note.wikiHint}</span>
          </div>
        )}
      </div>

      <div className="note-card-content">{note.content}</div>

      {cardState === 'saved' ? (
        <div className="note-card-saved-banner">
          <Check size={13} />
          <span>Gespeichert</span>
        </div>
      ) : cardState === 'saving' ? (
        <div className="note-card-saving-banner">
          <Loader2 size={13} className="note-card-spinner" />
          <span>Speichere...</span>
        </div>
      ) : (
        <div className="note-card-actions">
          <button className="note-card-btn note-card-btn--free" onClick={handleSaveFree} title="Frei ablegen">
            <Save size={12} />
            <span>Frei ablegen</span>
          </button>
          <button
            className={`note-card-btn note-card-btn--attach ${attachOpen ? 'active' : ''}`}
            onClick={handleToggleAttach}
            title="An Wiki-Eintrag hängen"
          >
            <BookOpen size={12} />
            <span>An Wiki hängen</span>
            {attachOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      )}

      {attachOpen && cardState === 'idle' && (
        <div className="note-card-attach-picker">
          <select
            className="note-card-select"
            value={selectedTypeId}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <option value="">— Typ wählen —</option>
            {wikiTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            className="note-card-select"
            value={selectedEntryId}
            onChange={(e) => setSelectedEntryId(e.target.value)}
            disabled={!selectedTypeId}
          >
            <option value="">— Eintrag wählen —</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.values['name'] || e.values['title'] || e.id}
              </option>
            ))}
          </select>
          <button
            className="note-card-btn note-card-btn--confirm"
            onClick={handleAttach}
            disabled={!selectedTypeId || !selectedEntryId}
          >
            <Check size={12} />
            <span>Bestätigen</span>
          </button>
        </div>
      )}
    </div>
  );
}

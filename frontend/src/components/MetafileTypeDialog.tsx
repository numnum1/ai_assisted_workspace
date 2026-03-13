import { useEffect } from 'react';
import { X } from 'lucide-react';

export type MetafileType = 'book' | 'chapter' | 'scene' | 'action' | 'arc';

interface MetafileTypeDialogProps {
  onSelect: (type: MetafileType) => void;
  onCancel: () => void;
}

const TYPES: { id: MetafileType; label: string; description: string; icon: string }[] = [
  { id: 'book',    label: 'Buch',    description: 'Gesamtwerk / Manuskript', icon: '📚' },
  { id: 'chapter', label: 'Kapitel', description: 'Kapitel mit Status & Zusammenfassung', icon: '📖' },
  { id: 'scene',   label: 'Szene',   description: 'Einzelne Szene mit Beats & Status', icon: '🎬' },
  { id: 'action',  label: 'Action',  description: 'Einzelne Handlungseinheit einer Szene', icon: '⚡' },
  { id: 'arc',     label: 'Arc',     description: 'Handlungsbogen über mehrere Kapitel', icon: '🌊' },
];

export function MetafileTypeDialog({ onSelect, onCancel }: MetafileTypeDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div className="mftd-overlay" onClick={onCancel}>
      <div className="mftd-dialog" onClick={e => e.stopPropagation()}>
        <div className="mftd-header">
          <span className="mftd-title">Welcher Typ?</span>
          <button className="mftd-close" onClick={onCancel} title="Abbrechen (Esc)">
            <X size={14} />
          </button>
        </div>
        <div className="mftd-grid">
          {TYPES.map(t => (
            <button
              key={t.id}
              className="mftd-card"
              onClick={() => onSelect(t.id)}
            >
              <span className="mftd-card-icon">{t.icon}</span>
              <span className="mftd-card-label">{t.label}</span>
              <span className="mftd-card-desc">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

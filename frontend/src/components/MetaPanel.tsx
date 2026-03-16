import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import type { MetaSelection, NodeMeta, MetaNodeType } from '../types.ts';

interface MetaPanelProps {
  selection: MetaSelection;
  onSave: (type: MetaNodeType, meta: NodeMeta, chapterId: string, sceneId?: string, actionId?: string) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<MetaNodeType, string> = {
  chapter: 'kapitel.json',
  scene: 'szene.json',
  action: 'akt.json',
};

export function MetaPanel({ selection, onSave, onClose }: MetaPanelProps) {
  const [title, setTitle] = useState(selection.meta.title);
  const [description, setDescription] = useState(selection.meta.description ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(selection.meta.title);
    setDescription(selection.meta.description ?? '');
    setDirty(false);
  }, [selection]);

  const handleSave = () => {
    const meta: NodeMeta = {
      title: title.trim(),
      description: description.trim(),
      sortOrder: selection.meta.sortOrder,
    };
    onSave(selection.type, meta, selection.chapterId, selection.sceneId, selection.actionId);
    setDirty(false);
  };

  const markDirty = () => setDirty(true);

  return (
    <div className="meta-panel">
      <div className="meta-panel-header">
        <span className="meta-panel-filename">{TYPE_LABELS[selection.type]}</span>
        <div className="meta-panel-header-actions">
          {dirty && (
            <button className="meta-panel-save-btn" onClick={handleSave} title="Speichern">
              <Save size={13} />
            </button>
          )}
          <button className="meta-panel-close-btn" onClick={onClose} title="Schließen">
            <X size={13} />
          </button>
        </div>
      </div>

      <div className="meta-panel-body">
        <div className="meta-field">
          <label className="meta-field-label">Titel</label>
          <input
            className="meta-field-input"
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty(); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="Titel..."
          />
        </div>

        <div className="meta-field">
          <label className="meta-field-label">Beschreibung</label>
          <textarea
            className="meta-field-textarea"
            value={description}
            onChange={e => { setDescription(e.target.value); markDirty(); }}
            placeholder="Beschreibung..."
            rows={4}
          />
        </div>

        {dirty && (
          <button className="meta-panel-save-full-btn" onClick={handleSave}>
            <Save size={13} />
            Speichern
          </button>
        )}
      </div>
    </div>
  );
}

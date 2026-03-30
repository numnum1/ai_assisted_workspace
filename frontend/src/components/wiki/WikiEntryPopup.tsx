import { useEffect } from 'react';
import type { EditingWikiEntry } from '../../hooks/useWiki.ts';
import type { MetaTypeSchema } from '../../meta/metaSchema.ts';
import { AssetPanel } from '../meta/AssetPanel.tsx';

interface WikiEntryPopupProps {
  editing: EditingWikiEntry;
  onSave: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

function wikiTypeToSchema(editing: EditingWikiEntry): MetaTypeSchema {
  return {
    filename: editing.type.name,
    fields: editing.type.fields.map(f => ({
      key: f.key,
      label: f.label,
      type: f.type,
      placeholder: f.placeholder,
      defaultValue: f.defaultValue,
      config: f.config,
    })),
  };
}

export function WikiEntryPopup({ editing, onSave, onClose }: WikiEntryPopupProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const schema = wikiTypeToSchema(editing);
  const entryName = editing.entry.values['name'] || editing.entry.values['title'] || editing.entry.id;

  return (
    <div className="wiki-entry-popup-overlay" onClick={onClose}>
      <div className="wiki-entry-popup" onClick={e => e.stopPropagation()}>
        <div className="wiki-entry-popup-type-label">{editing.type.name}</div>
        <AssetPanel
          schema={schema}
          values={editing.entry.values}
          title={entryName}
          onSave={onSave}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

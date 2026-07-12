import { useState } from 'react';

interface ChapterMetaEditorProps {
  label: string;
  title: string;
  description: string;
  top: number;
  width: number;
  textColor: string;
  mutedColor: string;
  onSave: (patch: { title: string; description: string }) => void;
}

/**
 * Compact inline card for editing a chapter/scene/action's title and
 * description, anchored next to the corresponding outline bracket. Remounted
 * (via `key`) whenever the selection changes, so local edit state always
 * starts fresh from the newly selected node's meta.
 */
export function ChapterMetaEditor({
  label, title, description, top, width, textColor, mutedColor, onSave,
}: ChapterMetaEditorProps) {
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);

  const commit = () => {
    if (titleValue !== title || descriptionValue !== description) {
      onSave({ title: titleValue, description: descriptionValue });
    }
  };

  return (
    <div className="chapter-meta-editor" style={{ top, width }}>
      <div className="chapter-meta-editor-label" style={{ color: mutedColor }}>{label}</div>
      <input
        type="text"
        className="chapter-meta-editor-title"
        style={{ color: textColor }}
        value={titleValue}
        placeholder="Titel"
        onChange={e => setTitleValue(e.target.value)}
        onBlur={commit}
      />
      <textarea
        className="chapter-meta-editor-description"
        style={{ color: textColor }}
        value={descriptionValue}
        placeholder="Beschreibung"
        rows={4}
        onChange={e => setDescriptionValue(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

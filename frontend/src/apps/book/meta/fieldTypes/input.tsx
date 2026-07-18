import type { FieldRendererProps } from '../metaSchema.ts';

export function inputRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  return (
    <input
      className="meta-field-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onCommit?.(); }}
      placeholder={field.placeholder}
    />
  );
}

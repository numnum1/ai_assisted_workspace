import type { FieldRendererProps } from '../metaSchema.ts';

export function textareaRenderer({ field, value, onChange }: FieldRendererProps) {
  return (
    <textarea
      className="meta-field-textarea"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder}
      rows={4}
    />
  );
}

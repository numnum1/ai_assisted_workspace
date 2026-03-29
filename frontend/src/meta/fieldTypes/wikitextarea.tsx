import type { FieldRendererProps } from '../metaSchema.ts';
import { WikiTextarea } from '../../components/WikiTextarea.tsx';

export function wikiTextareaRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  return (
    <WikiTextarea
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      placeholder={field.placeholder}
      rows={(field.config?.rows as number) ?? (field.type === 'largetextarea' ? 9 : 4)}
    />
  );
}

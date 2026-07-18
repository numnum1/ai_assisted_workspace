import type { FieldRendererProps } from '../metaSchema.ts';

export function selectorRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  const baseOptions = field.options ?? [];
  // Falls gespeicherter Wert nicht in options (z.B. alte Daten), trotzdem anzeigen
  const options = value && !baseOptions.includes(value)
    ? [...baseOptions, value]
    : baseOptions;
  const labels = (field.config?.labels as Record<string, string> | undefined) ?? {};
  return (
    <select
      className="meta-field-select"
      value={value}
      onChange={e => { onChange(e.target.value); onCommit?.(); }}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{labels[opt] ?? opt}</option>
      ))}
    </select>
  );
}

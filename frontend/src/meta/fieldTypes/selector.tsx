import type { FieldRendererProps } from '../metaSchema.ts';

export function selectorRenderer({ field, value, onChange }: FieldRendererProps) {
  const baseOptions = field.options ?? [];
  // Falls gespeicherter Wert nicht in options (z.B. alte Daten), trotzdem anzeigen
  const options = value && !baseOptions.includes(value)
    ? [...baseOptions, value]
    : baseOptions;
  return (
    <select
      className="meta-field-select"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

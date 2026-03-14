import type { FieldRenderer } from '../metaformConfig.tsx';

export const renderSelectField: FieldRenderer = ({ field, value, onChange }) => (
  <div className="mfe-field">
    <label className="mfe-label">{field.label}</label>
    <select
      className="mfe-select"
      value={value || (field.options?.[0] ?? '')}
      onChange={e => onChange(e.target.value)}
    >
      {field.options?.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

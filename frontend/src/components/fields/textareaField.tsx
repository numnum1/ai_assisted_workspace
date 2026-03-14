import type { FieldRenderer } from '../metaformConfig.tsx';

export const renderTextareaField: FieldRenderer = ({ field, value, onChange }) => (
  <div className="mfe-field">
    <label className="mfe-label">{field.label}</label>
    <textarea
      className="mfe-textarea"
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={field.rows ?? 3}
      placeholder={field.placeholder}
    />
  </div>
);

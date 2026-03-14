import type { FieldRenderer } from '../metaformConfig.tsx';

export const renderTextField: FieldRenderer = ({ field, value, onChange }) => (
  <div className="mfe-field">
    <label className="mfe-label">{field.label}</label>
    <input
      className="mfe-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder}
    />
  </div>
);

import type { ReactElement } from 'react';

export interface FieldRendererProps {
  field: MetaFieldDef;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
}

export type FieldRenderer = (props: FieldRendererProps) => ReactElement;

export interface MetaFieldDef {
  key: string;
  label: string;
  type: string;
  placeholder?: string;
  defaultValue: string;
  options?: string[];  // für type: 'selector'
  config?: Record<string, unknown>;
}

export interface MetaTypeSchema {
  filename: string;
  fields: MetaFieldDef[];
}

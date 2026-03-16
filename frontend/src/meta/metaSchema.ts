export interface MetaFieldDef {
  key: string;
  label: string;
  type: 'input' | 'textarea';
  placeholder?: string;
  defaultValue: string;
}

export interface MetaTypeSchema {
  filename: string;
  fields: MetaFieldDef[];
}

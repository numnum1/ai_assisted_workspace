/**
 * Converts legacy wiki entry JSON ({ id, typeId, values: { ... } }) to Markdown
 * with YAML frontmatter and ## sections per field.
 */

const FIELD_LABELS_DE: Record<string, string> = {
  name: 'Name',
  titel: 'Titel',
  rolle: 'Rolle',
  gruppe: 'Gruppe',
  alignment: 'Alignment',
  status: 'Status',
  alter: 'Alter',
  herkunft: 'Herkunft',
  aussehen: 'Aussehen',
  persoenlichkeit: 'Persönlichkeit',
  motivation: 'Motivation',
  hintergrund: 'Hintergrund',
  beziehungen: 'Beziehungen',
  namenskonvention: 'Namenskonvention',
  ki_hinweise: 'KI-Hinweise',
};

/** Preferred order for character-style entries; unknown keys follow alphabetically. */
const FIELD_ORDER: string[] = [
  'name',
  'titel',
  'rolle',
  'gruppe',
  'alignment',
  'status',
  'alter',
  'herkunft',
  'aussehen',
  'persoenlichkeit',
  'motivation',
  'hintergrund',
  'beziehungen',
  'namenskonvention',
  'ki_hinweise',
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function yamlScalar(value: string): string {
  if (value === '') return '""';
  const safePlain = /^[\w.-]+$/u.test(value) && !/^\d/u.test(value.charAt(0));
  if (safePlain && !value.includes('\n') && !value.includes(':')) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function formatBodyValue(raw: string): string {
  const t = raw.trim();
  return t === '' ? '_(leer)_' : raw.trimEnd();
}

export interface LegacyWikiConversion {
  markdown: string;
  /** Human-readable title for dialogs */
  title: string;
}

/**
 * Returns null if the JSON is not a recognizable legacy wiki shape.
 */
export function convertLegacyWikiJsonToMarkdown(jsonText: string): LegacyWikiConversion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) return null;

  const valuesRaw = parsed.values;
  if (!isPlainObject(valuesRaw)) return null;

  const id = typeof parsed.id === 'string' ? parsed.id : '';
  const typeId = typeof parsed.typeId === 'string' ? parsed.typeId : '';

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(valuesRaw)) {
    if (typeof v === 'string') {
      values[k] = v;
    } else if (v === null || v === undefined) {
      values[k] = '';
    } else {
      values[k] = JSON.stringify(v, null, 2);
    }
  }

  if (Object.keys(values).length === 0 && !id && !typeId) return null;

  const displayName = values.name?.trim() || id || 'Wiki-Eintrag';

  const fmLines = ['---'];
  if (id) fmLines.push(`id: ${yamlScalar(id)}`);
  if (typeId) fmLines.push(`typeId: ${yamlScalar(typeId)}`);
  if (values.name?.trim()) fmLines.push(`name: ${yamlScalar(values.name.trim())}`);
  fmLines.push('---');

  const skipNameSection = Boolean(values.name?.trim());
  const orderedKeys: string[] = [];
  for (const k of FIELD_ORDER) {
    if (k in values && !(skipNameSection && k === 'name')) orderedKeys.push(k);
  }
  const rest = Object.keys(values)
    .filter((k) => !(skipNameSection && k === 'name') && !orderedKeys.includes(k))
    .sort((a, b) => a.localeCompare(b));
  orderedKeys.push(...rest);

  const bodyParts: string[] = [`# ${displayName}`, ''];
  for (const key of orderedKeys) {
    const label = FIELD_LABELS_DE[key] ?? key.replace(/_/g, ' ');
    bodyParts.push(`## ${label}`);
    bodyParts.push('');
    bodyParts.push(formatBodyValue(values[key] ?? ''));
    bodyParts.push('');
  }

  const markdown = `${fmLines.join('\n')}\n\n${bodyParts.join('\n').trimEnd()}\n`;
  return { markdown, title: displayName };
}

/**
 * Generic fallback: flat JSON object of string fields → markdown (no legacy `values` wrapper).
 */
export function convertFlatJsonObjectToMarkdown(jsonText: string): LegacyWikiConversion | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if ('values' in parsed && isPlainObject(parsed.values)) return null;

  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') values[k] = v;
    else if (v === null || v === undefined) values[k] = '';
    else return null;
  }
  if (Object.keys(values).length === 0) return null;

  const first =
    values.name || values.title || values.titel || Object.keys(values)[0];
  const displayName = (typeof first === 'string' && first.trim()) || 'Eintrag';

  const bodyParts: string[] = [`# ${displayName}`, ''];
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  for (const key of keys) {
    if (key === 'name' && values[key]?.trim() === displayName) continue;
    const label = FIELD_LABELS_DE[key] ?? key.replace(/_/g, ' ');
    bodyParts.push(`## ${label}`);
    bodyParts.push('');
    bodyParts.push(formatBodyValue(values[key] ?? ''));
    bodyParts.push('');
  }

  const markdown = `${bodyParts.join('\n').trimEnd()}\n`;
  return { markdown, title: displayName };
}

export function convertWikiOrFlatJsonToMarkdown(jsonText: string): LegacyWikiConversion | null {
  return convertLegacyWikiJsonToMarkdown(jsonText) ?? convertFlatJsonObjectToMarkdown(jsonText);
}

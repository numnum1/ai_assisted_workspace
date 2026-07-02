import type {
  MetaSelection,
  NodeMeta,
  MetaNodeType,
  EnsembleCharacterInput,
  EnsembleSceneContext,
} from '../../types.ts';
import type { MetaTypeSchema } from '../../meta/metaSchema.ts';
import { AssetPanel } from './AssetPanel.tsx';
import { EnsembleRunButton } from '../ensemble/EnsembleRunButton.tsx';

interface MetaPanelProps {
  selection: MetaSelection;
  metaSchemas: Record<MetaNodeType, MetaTypeSchema>;
  onSave: (type: MetaNodeType, meta: NodeMeta, chapterId: string, sceneId?: string, actionId?: string) => void;
  onClose: () => void;
  onExpand?: () => void;
  expanded?: boolean;
  onFocusField?: (fieldKey: string, fieldLabel: string, value: string) => void;
  onOpenFile?: (path: string) => void;
}

/** Parse `@[Name](wiki/path.md)` mentions from a scene's characters field. */
function parseCharacterMentions(raw: string | undefined): EnsembleCharacterInput[] {
  if (!raw) return [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const items: EnsembleCharacterInput[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].trim();
    const wikiPath = m[2].trim();
    if (name && wikiPath) items.push({ name, wikiPath });
  }
  return items;
}

/** Build the ensemble scene context from a scene node's persisted meta. */
function sceneContextFromMeta(meta: NodeMeta): EnsembleSceneContext {
  const e = meta.extras ?? {};
  return {
    title: meta.title,
    location: e['location'],
    time: e['time'],
    initialSituation: e['initial_situation'],
    goal: e['goal'],
    tone: e['tone'],
    pov: e['pov'],
  };
}

function buildInitialValues(selection: MetaSelection, metaSchemas: Record<MetaNodeType, MetaTypeSchema>): Record<string, string> {
  const schema = metaSchemas[selection.type];
  const values: Record<string, string> = {};
  for (const field of schema.fields) {
    if (field.key === 'title') {
      values[field.key] = selection.meta.title ?? field.defaultValue;
    } else if (field.key === 'description') {
      values[field.key] = selection.meta.description ?? field.defaultValue;
    } else {
      values[field.key] = selection.meta.extras?.[field.key] ?? field.defaultValue;
    }
  }
  return values;
}

export function MetaPanel({ selection, metaSchemas, onSave, onClose, onExpand, expanded, onFocusField, onOpenFile }: MetaPanelProps) {
  const schema = metaSchemas[selection.type];
  const initialValues = buildInitialValues(selection, metaSchemas);

  const isScene = selection.type === 'scene';
  const sceneCharacters = isScene
    ? parseCharacterMentions(selection.meta.extras?.['characters'])
    : [];

  const handleSave = (values: Record<string, string>) => {
    const extras: Record<string, string> = {};
    for (const key of Object.keys(values)) {
      if (key !== 'title' && key !== 'description') {
        extras[key] = values[key];
      }
    }
    const meta: NodeMeta = {
      title: (values['title'] ?? '').trim(),
      description: (values['description'] ?? '').trim(),
      sortOrder: selection.meta.sortOrder,
      extras: Object.keys(extras).length > 0 ? extras : undefined,
    };
    onSave(selection.type, meta, selection.chapterId, selection.sceneId, selection.actionId);
  };

  // key ensures AssetPanel fully re-mounts when the selected node changes
  const panelKey = `${selection.type}-${selection.chapterId}-${selection.sceneId ?? ''}-${selection.actionId ?? ''}`;

  return (
    <>
      <AssetPanel
        key={panelKey}
        schema={schema}
        values={initialValues}
        title={schema.filename}
        onSave={handleSave}
        onClose={onClose}
        onExpand={onExpand}
        expanded={expanded}
        onFocusField={onFocusField}
      />
      {isScene && (
        <EnsembleRunButton
          scene={sceneContextFromMeta(selection.meta)}
          characters={sceneCharacters}
          onOpenFile={onOpenFile}
        />
      )}
    </>
  );
}

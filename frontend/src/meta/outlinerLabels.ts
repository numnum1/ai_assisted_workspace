import type { OutlinerLevelConfig, WorkspaceModeSchema } from '../types.ts';

const FALLBACK: OutlinerLevelConfig = {
  chapter: { label: 'Kapitel', labelNew: 'Neues Kapitel', icon: 'book' },
  scene: { label: 'Szene', labelNew: 'Neue Szene', icon: 'layers' },
  action: { label: 'Handlungseinheit', labelNew: 'Neue Handlungseinheit', icon: 'align-left' },
  proseLeafAtScene: false,
  rootMetaLabel: 'Buch-Metadaten',
  rootMetaIcon: 'book',
  rootMetaRelativePath: '.project/book.json',
  folderIcon: 'folder',
};

function pick(ws: WorkspaceModeSchema, key: 'chapter' | 'scene' | 'action') {
  const lvl = ws.levels?.find((l) => l.key === key);
  return {
    label: lvl?.label || FALLBACK[key].label,
    labelNew: lvl?.labelNew || FALLBACK[key].labelNew,
    icon: lvl?.icon || FALLBACK[key].icon,
  };
}

export function buildOutlinerLevelConfig(ws: WorkspaceModeSchema | null): OutlinerLevelConfig {
  if (!ws?.levels?.length) return FALLBACK;
  const rootIcon = ws.rootMetaIcon?.trim() || FALLBACK.rootMetaIcon;
  const proseLeafAtScene = ws.proseLeafLevel === 'scene';
  const sceneCfg = pick(ws, 'scene');
  const rootFilename = ws.metaSchemas?.root?.filename?.trim() || 'book.json';
  return {
    chapter: pick(ws, 'chapter'),
    scene: sceneCfg,
    action: proseLeafAtScene ? sceneCfg : pick(ws, 'action'),
    proseLeafAtScene,
    rootMetaLabel: ws.rootMetaLabel?.trim() || FALLBACK.rootMetaLabel,
    rootMetaIcon: rootIcon,
    rootMetaRelativePath: `.project/${rootFilename}`,
    folderIcon: ws.icon?.trim() || rootIcon || FALLBACK.folderIcon,
  };
}

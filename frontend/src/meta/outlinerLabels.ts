import type { OutlinerLevelConfig, WorkspaceModeSchema } from '../types.ts';

const FALLBACK: OutlinerLevelConfig = {
  chapter: { label: 'Kapitel', labelNew: 'Neues Kapitel', icon: 'book' },
  scene: { label: 'Szene', labelNew: 'Neue Szene', icon: 'layers' },
  action: { label: 'Handlungseinheit', labelNew: 'Neue Handlungseinheit', icon: 'align-left' },
  rootMetaLabel: 'Buch-Metadaten',
  rootMetaIcon: 'book',
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
  return {
    chapter: pick(ws, 'chapter'),
    scene: pick(ws, 'scene'),
    action: pick(ws, 'action'),
    rootMetaLabel: ws.rootMetaLabel?.trim() || FALLBACK.rootMetaLabel,
    rootMetaIcon: rootIcon,
    folderIcon: ws.icon?.trim() || rootIcon || FALLBACK.folderIcon,
  };
}

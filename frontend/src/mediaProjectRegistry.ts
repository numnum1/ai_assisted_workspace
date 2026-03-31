import type { ComponentType } from 'react';
import type { ChapterNode, ScrollTarget, SelectionContext, AltVersionSession } from './types.ts';

/** Props for the main editor area when a chapter is open in a media subproject */
export interface MediaProjectEditorProps {
  editorMode: string;
  /** Prose body is one block per scene (no visible action tier in the tree). */
  proseLeafAtScene?: boolean;
  chapter: ChapterNode;
  actionContents: Map<string, { content: string; dirty: boolean }>;
  scrollTarget: ScrollTarget | null;
  hasDirtyActions: boolean;
  onActionChange: (chapterId: string, sceneId: string, actionId: string, content: string) => void;
  onActionSave: (chapterId: string, sceneId: string, actionId: string) => void;
  onSaveAll: () => void;
  onClose: () => void;
  onScrollTargetConsumed: () => void;
  onEditorFocus?: (sceneId: string, actionId: string) => void;
  onCtrlL?: (sel: SelectionContext, replaceFn: (from: number, to: number, text: string) => void) => void;
  onAltVersion?: (session: AltVersionSession) => void;
}

export interface MediaProjectPlugin {
  id: string;
  /** When omitted, {@link DefaultMediaProjectEditor} is used (user YAML plugins). */
  ViewComponent?: ComponentType<MediaProjectEditorProps>;
}

const registry = new Map<string, MediaProjectPlugin>();

export function registerMediaProjectPlugin(plugin: MediaProjectPlugin) {
  registry.set(plugin.id, plugin);
}

export function getMediaProjectPlugin(id: string): MediaProjectPlugin | undefined {
  return registry.get(id);
}

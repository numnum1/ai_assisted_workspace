import type { ComponentType } from 'react';
import type { ChapterNode, ChapterSummary, ScrollTarget, SelectionContext, AltVersionSession, UserChapterSelection, NodeMeta, MetaNodeType } from './types.ts';
import type { MetaTypeSchema } from './meta/metaSchema.ts';
import type { BookProject } from './utils/bookProjects.ts';

/** Props for the main editor area when a chapter is open in a media subproject */
export interface MediaProjectEditorProps {
  editorMode: string;
  /** Prose body is one block per scene (no visible action tier in the tree). */
  proseLeafAtScene?: boolean;
  chapter: ChapterNode;
  /** Subproject/workspace root the chapter lives under (null = project root). Used to resolve git history paths. */
  structureRoot?: string | null;
  /** Root project plus every book-like subproject, for the project picker. */
  bookProjects: BookProject[];
  /** Path of the currently active book project ("." for the project root). */
  currentBookProjectPath: string;
  onSelectBookProject: (path: string, subprojectType: string | null) => void;
  /** Chapters of the currently active book project, for the chapter tab strip. */
  chapterTabs: ChapterSummary[];
  onSelectChapterTab: (chapterId: string) => void;
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
  /** Scene/action the user currently has selected (outline click or text focus); drives the metadata editor and AI context panel. */
  selection?: UserChapterSelection;
  onSelectionChange?: (selection: UserChapterSelection) => void;
  /** Persist an edit made in the inline metadata editor. */
  onSaveChapterMeta?: (chapterId: string, meta: NodeMeta) => void;
  onSaveSceneMeta?: (chapterId: string, sceneId: string, meta: NodeMeta) => void;
  onSaveActionMeta?: (chapterId: string, sceneId: string, actionId: string, meta: NodeMeta) => void;
  /** Schema per node type (title/description + workspace-configured extra fields), for the inline metadata editor. */
  workspaceMetaSchemas?: Record<MetaNodeType, MetaTypeSchema>;
  /** Opens a file in the main editor (used by the ensemble "run scene" result). */
  onOpenFile?: (path: string) => void;
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

import { StateField } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import type { Extension, Transaction } from '@codemirror/state';
import type { ViewUpdate, DecorationSet } from '@codemirror/view';

export interface SceneInfo {
  id: string;
  from: number;
  to: number;
}

const SCENE_MARKER_RE = /<!--\s*@scene:([^\s>]+)\s*-->/g;

function parseScenes(docStr: string): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  SCENE_MARKER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCENE_MARKER_RE.exec(docStr)) !== null) {
    scenes.push({ id: match[1], from: match.index, to: match.index + match[0].length });
  }
  return scenes;
}

export const sceneField = StateField.define<SceneInfo[]>({
  create(state) {
    return parseScenes(state.doc.toString());
  },
  update(scenes, tr: Transaction) {
    if (!tr.docChanged) return scenes;
    return parseScenes(tr.newDoc.toString());
  },
});

class SceneDividerWidget extends WidgetType {
  constructor(readonly sceneId: string) {
    super();
  }

  eq(other: SceneDividerWidget) {
    return other.sceneId === this.sceneId;
  }

  toDOM() {
    const el = document.createElement('div');
    el.className = 'cm-scene-divider';
    const line = document.createElement('hr');
    line.className = 'cm-scene-divider-line';
    const label = document.createElement('span');
    label.className = 'cm-scene-divider-label';
    label.textContent = this.sceneId;
    el.appendChild(line);
    el.appendChild(label);
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

function buildSceneDecorations(view: EditorView): DecorationSet {
  const scenes = view.state.field(sceneField);
  if (scenes.length === 0) return Decoration.none;
  const decos = scenes.map(scene =>
    Decoration.replace({ widget: new SceneDividerWidget(scene.id) }).range(scene.from, scene.to)
  );
  return Decoration.set(decos);
}

const hideSceneMarkersPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildSceneDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSceneDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations }
);

function createActiveSceneTrackerPlugin(onActiveSceneChange: (sceneId: string | null) => void) {
  let lastId: string | null | undefined = undefined;
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        this.track(view);
      }
      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          this.track(update.view);
        }
      }
      track(view: EditorView) {
        const scenes = view.state.field(sceneField);
        const pos = view.state.selection.main.head;
        let active: string | null = null;
        for (const scene of scenes) {
          if (scene.from <= pos) active = scene.id;
          else break;
        }
        if (active !== lastId) {
          lastId = active;
          onActiveSceneChange(active);
        }
      }
    }
  );
}

export function createSceneMarkerExtension(
  onActiveSceneChange: (sceneId: string | null) => void
): Extension[] {
  return [
    sceneField,
    hideSceneMarkersPlugin,
    createActiveSceneTrackerPlugin(onActiveSceneChange),
  ];
}

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  BookMarked,
  FileText,
  FileQuestion,
  Plus,
  LayoutList,
} from "lucide-react";
import { typedFilesApi } from "../api.ts";
import { useTextPrompt } from "../hooks/useTextPrompt.tsx";

interface OutlinerScene {
  path: string;
  name: string;
  summary?: string | null;
  textPath: string;
  metaPath: string;
  hasText: boolean;
  hasMetadata: boolean;
}

interface OutlinerChapter {
  path: string;
  name: string;
  summary?: string | null;
  metaPath: string;
  hasMetadata: boolean;
  scenes: OutlinerScene[];
}

interface OutlinerTree {
  chapters: OutlinerChapter[];
}

interface OutlinerPanelProps {
  tree: OutlinerTree | null;
  loading: boolean;
  error: string | null;
  activeFile: string | null;
  onOpenText: (path: string) => void;
  onOpenMeta: (path: string) => void;
  onCreateChapter: (name: string) => Promise<string>;
  onCreateScene: (
    chapterPath: string,
    name: string,
    withMetadata: boolean,
  ) => Promise<{ textPath: string; metaPath: string }>;
  onRefresh: () => void;
}

export function OutlinerPanel({
  tree,
  loading,
  error,
  activeFile,
  onOpenText,
  onOpenMeta,
  onCreateChapter,
  onCreateScene,
  onRefresh,
}: OutlinerPanelProps) {
  const [promptDialog, prompt] = useTextPrompt();

  const handleAddChapter = async () => {
    const name = await prompt("Kapitelname (z.B. kapitel-08):");
    if (!name?.trim()) return;
    try {
      await onCreateChapter(name.trim());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Erstellen");
    }
  };

  if (!tree && loading) {
    return <div className="outliner-empty">Wird geladen…</div>;
  }

  if (error) {
    return (
      <div className="outliner-empty">
        <span style={{ color: "var(--red)" }}>{error}</span>
        <button
          className="outliner-icon-btn"
          onClick={onRefresh}
          style={{ marginTop: 8 }}
        >
          Neu laden
        </button>
      </div>
    );
  }

  return (
    <div className="file-tree" data-testid="OutlinerPanel">
      <div className="file-tree-header">
        <LayoutList size={14} />
        <span>Struktur</span>
        <button
          className="outliner-icon-btn"
          title="Neues Kapitel"
          onClick={handleAddChapter}
          style={{ marginLeft: "auto" }}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="file-tree-content">
        {!tree || tree.chapters.length === 0 ? (
          <div className="outliner-empty">Kein chapters/-Ordner gefunden.</div>
        ) : (
          tree.chapters.map((chapter) => (
            <ChapterNode
              key={chapter.path}
              chapter={chapter}
              activeFile={activeFile}
              onOpenText={onOpenText}
              onOpenMeta={onOpenMeta}
              onCreateScene={onCreateScene}
            />
          ))
        )}
      </div>
      {promptDialog}
    </div>
  );
}

// ─── Chapter Node ──────────────────────────────────────────────────────────────

interface ChapterNodeProps {
  chapter: OutlinerChapter;
  activeFile: string | null;
  onOpenText: (path: string) => void;
  onOpenMeta: (path: string) => void;
  onCreateScene: (
    chapterPath: string,
    name: string,
    withMetadata: boolean,
  ) => Promise<{ textPath: string; metaPath: string }>;
}

function ChapterNode({
  chapter,
  activeFile,
  onOpenText,
  onOpenMeta,
  onCreateScene,
}: ChapterNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [promptDialog, prompt] = useTextPrompt();

  const chapterMetaPath = chapter.metaPath;
  const isMetaActive = activeFile === chapterMetaPath;

  const handleAddScene = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const name = await prompt("Szenenname (z.B. szene-04):");
    if (!name?.trim()) return;
    try {
      const result = await onCreateScene(chapter.path, name.trim(), true);
      onOpenText(result.textPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Erstellen");
    }
  };

  return (
    <div className="outliner-chapter">
      <div
        className={`outliner-chapter-header tree-node ${isMetaActive ? "active" : ""}`}
        onClick={() => setExpanded((v) => !v)}
        title={chapter.summary ?? chapter.name}
      >
        <span className="tree-node-icon">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="tree-node-type-icon">
          {chapter.hasMetadata ? (
            <BookMarked size={14} style={{ color: "var(--accent)" }} />
          ) : (
            <BookOpen size={14} />
          )}
        </span>
        <span className="tree-node-name" style={{ flex: 1 }}>
          {chapter.name}
        </span>

        {/* Metadata indicator / create button */}
        {chapter.hasMetadata ? (
          <button
            className="outliner-badge outliner-badge-meta"
            title="Kapitel-Metadaten öffnen"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMeta(chapterMetaPath);
            }}
          >
            M
          </button>
        ) : (
          <button
            className="outliner-badge outliner-badge-missing"
            title=".chapter.json erstellen"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await typedFilesApi.saveContent(chapterMetaPath, {});
                onOpenMeta(chapterMetaPath);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Fehler");
              }
            }}
          >
            +M
          </button>
        )}

        <button
          className="outliner-icon-btn"
          title="Neue Szene"
          onClick={handleAddScene}
        >
          <Plus size={12} />
        </button>
      </div>

      {expanded &&
        chapter.scenes.map((scene) => (
          <SceneNode
            key={scene.path}
            scene={scene}
            activeFile={activeFile}
            onOpenText={onOpenText}
            onOpenMeta={onOpenMeta}
            onCreateScene={onCreateScene}
            chapterPath={chapter.path}
          />
        ))}
      {promptDialog}
    </div>
  );
}

// ─── Scene Node ────────────────────────────────────────────────────────────────

interface SceneNodeProps {
  scene: OutlinerScene;
  activeFile: string | null;
  onOpenText: (path: string) => void;
  onOpenMeta: (path: string) => void;
  onCreateScene: (
    chapterPath: string,
    name: string,
    withMetadata: boolean,
  ) => Promise<{ textPath: string; metaPath: string }>;
  chapterPath: string;
}

function SceneNode({
  scene,
  activeFile,
  onOpenText,
  onOpenMeta,
  onCreateScene,
  chapterPath,
}: SceneNodeProps) {
  const isTextActive = activeFile === scene.textPath;
  const isMetaActive = activeFile === scene.metaPath;
  const isActive = isTextActive || isMetaActive;

  return (
    <div
      className={`outliner-scene tree-node ${isActive ? "active" : ""}`}
      style={{ paddingLeft: "28px" }}
      title={scene.summary ?? scene.name}
    >
      {/* Text file indicator */}
      {scene.hasText ? (
        <button
          className="outliner-badge outliner-badge-text"
          title="Volltext öffnen"
          onClick={() => onOpenText(scene.textPath)}
        >
          <FileText size={11} />
        </button>
      ) : (
        <span
          className="outliner-badge outliner-badge-empty"
          title="Kein Volltext"
        >
          <FileQuestion size={11} />
        </span>
      )}

      {/* Scene name */}
      <span
        className="tree-node-name"
        style={{ flex: 1, cursor: scene.hasText ? "pointer" : "default" }}
        onClick={() => scene.hasText && onOpenText(scene.textPath)}
      >
        {scene.name}
      </span>

      {/* Metadata indicator */}
      {scene.hasMetadata ? (
        <button
          className="outliner-badge outliner-badge-meta"
          title="Szenen-Metadaten öffnen"
          onClick={() => onOpenMeta(scene.metaPath)}
        >
          M
        </button>
      ) : (
        <button
          className="outliner-badge outliner-badge-missing"
          title=".scene.json erstellen"
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const result = await onCreateScene(chapterPath, scene.name, true);
              onOpenMeta(result.metaPath);
            } catch (err) {
              alert(err instanceof Error ? err.message : "Fehler");
            }
          }}
        >
          +M
        </button>
      )}
    </div>
  );
}

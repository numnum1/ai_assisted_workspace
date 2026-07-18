import type { Dispatch, SetStateAction } from "react";
import {
  Save,
  Moon,
  Sun,
  Palette,
  MoveHorizontal,
  MoveVertical,
  History,
  MessageSquareText,
  Sparkles,
  Loader2,
  Info,
} from "lucide-react";
import type {
  ChapterSummary,
  CommentCategory,
  CommentCategoryDef,
} from "../../../../shared/types.ts";
import type { BookProject } from "../../../../shared/utils/bookProjects.ts";
import { READING_PADDING_SLIDER_STEP } from "../../hooks/useReadingPaddingMax.ts";

const LINE_HEIGHT_MIN = 1.1;
const LINE_HEIGHT_MAX = 2.4;
const LINE_HEIGHT_STEP = 0.1;

/**
 * Writer (ChapterView) tools rendered into the app-wide TopBar: book-project
 * picker, chapter tabs, reading sliders, night mode, save, AI comments, and
 * git history. Purely presentational — all state lives in {@link ChapterView}.
 */
export interface ChapterViewToolbarProps {
  // Theming
  headerBg: string;
  borderColor: string;
  mutedText: string;
  textColor: string;
  // Navigation
  currentBookProjectPath: string;
  bookProjects: BookProject[];
  onSelectBookProject: (path: string, subprojectType: string | null) => void;
  chapterTabs: ChapterSummary[];
  chapterId: string;
  hasDirtyActions: boolean;
  onSelectChapterTab: (chapterId: string) => void;
  /** Clicking the already-active chapter tab selects the chapter itself (for the metadata editor). */
  onSelectChapterMeta?: () => void;
  /** Scene/action currently being written in, shown as a breadcrumb after the chapter tabs. */
  breadcrumbSceneLabel?: string | null;
  breadcrumbActionLabel?: string | null;
  // Reading controls
  paddingSliderMax: number;
  effectivePadding: number;
  setPadding: (value: number) => void;
  lineHeight: number;
  setLineHeight: (value: number) => void;
  // Night mode
  nightMode: boolean;
  setNightMode: Dispatch<SetStateAction<boolean>>;
  setNightVariant: Dispatch<SetStateAction<number>>;
  nightPalettesLength: number;
  // Metadata editor
  metaPanelVisible: boolean;
  setMetaPanelVisible: Dispatch<SetStateAction<boolean>>;
  // Save
  onSaveAll: () => void;
  // AI comments
  commentPanelOpen: boolean;
  setCommentPanelOpen: Dispatch<SetStateAction<boolean>>;
  categoryDefs: CommentCategoryDef[];
  activeCategories: Set<CommentCategory>;
  onToggleCategory: (id: CommentCategory) => void;
  commentFreeText: string;
  setCommentFreeText: (value: string) => void;
  commentsError: string | null;
  onGenerateComments: () => void;
  commentsLoading: boolean;
  commentsCount: number;
  sidebarVisible: boolean;
  setSidebarVisible: Dispatch<SetStateAction<boolean>>;
  // History
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
}

export function ChapterViewToolbar({
  headerBg,
  borderColor,
  mutedText,
  textColor,
  currentBookProjectPath,
  bookProjects,
  onSelectBookProject,
  chapterTabs,
  chapterId,
  hasDirtyActions,
  onSelectChapterTab,
  onSelectChapterMeta,
  breadcrumbSceneLabel,
  breadcrumbActionLabel,
  paddingSliderMax,
  effectivePadding,
  setPadding,
  lineHeight,
  setLineHeight,
  nightMode,
  setNightMode,
  setNightVariant,
  nightPalettesLength,
  metaPanelVisible,
  setMetaPanelVisible,
  onSaveAll,
  commentPanelOpen,
  setCommentPanelOpen,
  categoryDefs,
  activeCategories,
  onToggleCategory,
  commentFreeText,
  setCommentFreeText,
  commentsError,
  onGenerateComments,
  commentsLoading,
  commentsCount,
  sidebarVisible,
  setSidebarVisible,
  setHistoryOpen,
}: ChapterViewToolbarProps) {
  return (
    <div
      className="top-bar-tools top-bar-tools--writer"
      style={{ backgroundColor: headerBg, borderBottomColor: borderColor }}
    >
      <div className="chapter-view-toolbar-nav">
        <select
          className="chapter-view-project-select"
          style={{ color: mutedText, borderColor: borderColor }}
          value={currentBookProjectPath}
          onChange={(e) => {
            const proj = bookProjects.find((p) => p.path === e.target.value);
            onSelectBookProject(e.target.value, proj?.subprojectType ?? null);
          }}
          title="Buchprojekt wählen"
        >
          {bookProjects.map((p) => (
            <option key={p.path} value={p.path}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="chapter-view-chapter-tabs">
          {chapterTabs.map((c) => {
            const active = c.id === chapterId;
            return (
              <span key={c.id} className="chapter-view-chapter-tab-group">
                <button
                  type="button"
                  className={`chapter-view-chapter-tab${active ? " active" : ""}`}
                  style={active ? { color: textColor } : { color: mutedText }}
                  onClick={() => active ? onSelectChapterMeta?.() : onSelectChapterTab(c.id)}
                  title={c.meta.title || c.id}
                >
                  {c.meta.title || c.id}
                  {active && hasDirtyActions && <span className="editor-dirty"> *</span>}
                </button>
                {active && (breadcrumbSceneLabel || breadcrumbActionLabel) && (
                  <span className="chapter-view-breadcrumb" style={{ color: mutedText }}>
                    {breadcrumbSceneLabel && <span>&gt;&gt; {breadcrumbSceneLabel}</span>}
                    {breadcrumbActionLabel && <span>&gt;&gt; {breadcrumbActionLabel}</span>}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      <div className="chapter-view-toolbar-actions">
        <div className="reading-padding-control" title="Seitenabstand">
          <MoveHorizontal size={12} />
          <input
            type="range"
            className="reading-padding-slider"
            min={0}
            max={paddingSliderMax}
            step={READING_PADDING_SLIDER_STEP}
            value={effectivePadding}
            onChange={(e) => setPadding(Number(e.target.value))}
          />
        </div>
        <div className="reading-padding-control" title="Zeilenabstand">
          <MoveVertical size={12} />
          <input
            type="range"
            className="reading-padding-slider"
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
          />
        </div>
        <button
          className={`editor-mode-btn${nightMode ? " active" : ""}`}
          onClick={() => setNightMode((prev) => !prev)}
          title={nightMode ? "Tagmodus" : "Nachtmodus"}
        >
          {nightMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        {nightMode && (
          <button
            className="editor-mode-btn"
            onClick={() => setNightVariant((prev) => (prev + 1) % nightPalettesLength)}
            title="Nachtmodus-Palette wechseln"
          >
            <Palette size={14} />
          </button>
        )}
        <button
          className={`editor-mode-btn${metaPanelVisible ? " active" : ""}`}
          onClick={() => setMetaPanelVisible((prev) => !prev)}
          title={metaPanelVisible ? "Metadaten-Editor ausblenden" : "Metadaten-Editor einblenden"}
        >
          <Info size={14} />
        </button>
        <button
          className="editor-save-btn"
          onClick={onSaveAll}
          disabled={!hasDirtyActions}
          title="Alles speichern (Ctrl+S)"
        >
          <Save size={14} />
        </button>
        <div className="comment-menu-anchor">
          <button
            className={`editor-mode-btn${commentPanelOpen ? " active" : ""}`}
            onClick={() => setCommentPanelOpen((o) => !o)}
            title="KI-Kommentare"
          >
            <Sparkles size={14} />
          </button>
          {commentPanelOpen && (
            <div className="comment-menu">
              <div className="comment-menu-title">KI-Kommentare</div>
              <div className="comment-menu-chips">
                {categoryDefs.map((cat) => {
                  const active = activeCategories.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`comment-chip${active ? " active" : ""}`}
                      style={active ? { borderColor: cat.color, color: cat.color } : undefined}
                      onClick={() => onToggleCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                className="comment-menu-freetext"
                placeholder="Zusätzliche Anweisung (optional)…"
                value={commentFreeText}
                onChange={(e) => setCommentFreeText(e.target.value)}
                rows={2}
              />
              {commentsError && <div className="comment-menu-error">{commentsError}</div>}
              <div className="comment-menu-actions">
                <button
                  type="button"
                  className="comment-menu-run"
                  onClick={onGenerateComments}
                  disabled={
                    commentsLoading ||
                    (activeCategories.size === 0 && commentFreeText.trim().length === 0)
                  }
                >
                  {commentsLoading ? (
                    <>
                      <Loader2 size={13} className="comment-spin" /> Analysiere…
                    </>
                  ) : (
                    <>
                      <MessageSquareText size={13} /> Kommentieren
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        {commentsCount > 0 && (
          <button
            className={`editor-mode-btn${sidebarVisible ? " active" : ""}`}
            onClick={() => setSidebarVisible((v) => !v)}
            title={sidebarVisible ? "Kommentarspalte ausblenden" : "Kommentarspalte einblenden"}
          >
            <MessageSquareText size={14} />
          </button>
        )}
        <button
          className="editor-mode-btn"
          onClick={() => setHistoryOpen(true)}
          title="Git-Verlauf des Kapitels"
        >
          <History size={14} />
        </button>
      </div>
    </div>
  );
}

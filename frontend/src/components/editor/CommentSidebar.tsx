import type { RefObject } from 'react';
import { MessageSquareText, X, Check } from 'lucide-react';
import type { ChapterComment, CommentCategoryDef } from '../../types.ts';
import { categoryColor, categoryLabel } from './commentCategories.ts';

/** A comment plus the vertical offset at which its card should render. */
export interface PositionedComment {
  comment: ChapterComment;
  /** Top offset (px) within the sidebar's inner scroll area. */
  top: number;
  /** Whether the quote was located in the chapter text. */
  matched: boolean;
  /**
   * True when the suggestion can be applied safely: the quote occurs exactly
   * once in its action, so the replacement is unambiguous.
   */
  canApply: boolean;
}

interface CommentSidebarProps {
  comments: PositionedComment[];
  /** Currently configured categories, used to resolve colour/label per comment. */
  categories: CommentCategoryDef[];
  /** Height of the scrollable editor content, so the sidebar can match it. */
  contentHeight: number;
  /** Width (px) of the column, user-adjustable via the drag handle in ChapterView. */
  width: number;
  sidebarRef: RefObject<HTMLDivElement | null>;
  onDismiss: (id: string) => void;
  /** Accept a comment's suggestion (replace the quoted text). */
  onAccept: (id: string) => void;
}

const CARD_MIN_HEIGHT = 64;

/**
 * Right-hand column that renders AI comment cards, each vertically aligned with
 * the passage it refers to. Cards that would overlap are pushed down.
 */
export function CommentSidebar({
  comments,
  categories,
  contentHeight,
  width,
  sidebarRef,
  onDismiss,
  onAccept,
}: CommentSidebarProps) {
  if (comments.length === 0) {
    return null;
  }

  const positioned = avoidOverlap(comments);

  return (
    <div className="comment-sidebar" ref={sidebarRef} style={{ width }}>
      <div className="comment-sidebar-inner" style={{ height: contentHeight }}>
        {positioned.map(({ comment, top, matched, canApply }) => {
          const color = categoryColor(categories, comment.category);
          const accepted = comment.accepted === true;
          return (
            <div
              key={comment.id}
              className={`comment-card${matched ? '' : ' comment-card-unmatched'}${accepted ? ' comment-card-accepted' : ''}`}
              style={{ top, borderLeftColor: color }}
            >
              <div className="comment-card-icon" style={{ color }}>
                <MessageSquareText size={12} />
              </div>
              <div className="comment-card-body">
                <div className="comment-card-header">
                  <span className="comment-card-category" style={{ color }}>
                    {categoryLabel(categories, comment.category)}
                  </span>
                  <button
                    type="button"
                    className="comment-card-dismiss"
                    onClick={() => onDismiss(comment.id)}
                    title="Kommentar verwerfen"
                  >
                    <X size={11} />
                  </button>
                </div>
                {comment.quote && (
                  <div className="comment-card-quote">„{comment.quote}"</div>
                )}
                <div className="comment-card-text">{comment.comment}</div>
                {comment.suggestion && (
                  <div className="comment-card-suggestion">
                    <div className="comment-card-suggestion-label">Vorschlag</div>
                    <div className="comment-card-suggestion-text">{comment.suggestion}</div>
                    {accepted ? (
                      <div className="comment-card-accepted-badge">
                        <Check size={11} /> Übernommen
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="comment-card-accept"
                        onClick={() => onAccept(comment.id)}
                        disabled={!canApply}
                        title={
                          canApply
                            ? 'Vorschlag in den Text übernehmen'
                            : 'Textstelle nicht eindeutig auffindbar — kann nicht automatisch übernommen werden'
                        }
                      >
                        <Check size={11} /> Übernehmen
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Push cards down so they never overlap, preserving their relative order. */
function avoidOverlap(comments: PositionedComment[]): PositionedComment[] {
  if (comments.length <= 1) return comments;
  const sorted = [...comments].sort((a, b) => a.top - b.top);
  const result = sorted.map((c) => ({ ...c }));
  for (let i = 1; i < result.length; i++) {
    const prevBottom = result[i - 1]!.top + CARD_MIN_HEIGHT;
    if (result[i]!.top < prevBottom) {
      result[i]!.top = prevBottom;
    }
  }
  return result;
}

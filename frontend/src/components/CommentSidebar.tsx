import type { RefObject } from 'react';
import type { CommentPosition } from './commentExtension';
import { MessageSquareText } from 'lucide-react';

interface CommentSidebarProps {
  comments: CommentPosition[];
  contentHeight: number;
  sidebarRef: RefObject<HTMLDivElement | null>;
}

export function CommentSidebar({ comments, contentHeight, sidebarRef }: CommentSidebarProps) {
  if (comments.length === 0) {
    return null;
  }

  const positioned = avoidOverlap(comments);

  return (
    <div className="comment-sidebar" ref={sidebarRef}>
      <div className="comment-sidebar-inner" style={{ height: contentHeight }}>
        {positioned.map((comment, i) => (
          <div key={i} className="comment-card" style={{ top: comment.top }}>
            <div className="comment-card-icon">
              <MessageSquareText size={11} />
            </div>
            <div className="comment-card-text">{comment.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CARD_MIN_HEIGHT = 36;

function avoidOverlap(comments: CommentPosition[]): CommentPosition[] {
  if (comments.length <= 1) return comments;
  const result = comments.map((c) => ({ ...c }));
  for (let i = 1; i < result.length; i++) {
    const prevBottom = result[i - 1].top + CARD_MIN_HEIGHT;
    if (result[i].top < prevBottom) {
      result[i].top = prevBottom;
    }
  }
  return result;
}

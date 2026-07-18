import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { X } from 'lucide-react';
import { ChatPanel } from '../../../../shared/components/chat/ChatPanel.tsx';
import type { AltVersionSession, SelectionContext, ClarificationData } from '../../../../shared/types.ts';

type ChatPanelPassthroughProps = Omit<
  ComponentProps<typeof ChatPanel>,
  'activeSelection' | 'onDismissSelection' | 'onReplaceSelection' | 'onSend'
>;

interface InlineChatWindowProps extends ChatPanelPassthroughProps {
  session: AltVersionSession;
  onClose: () => void;
  onSend: (
    message: string,
    selection: SelectionContext | null,
    clarificationData?: ClarificationData,
  ) => void;
}

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 600;
const MARGIN = 8;

function calcPosition(
  coords: { top: number; bottom: number; left: number; right: number },
  width: number,
  height: number,
): { top: number; left: number } {
  let left = coords.right + 16;
  let top = coords.top - 4;

  if (left + width > window.innerWidth - MARGIN) {
    const leftSide = coords.left - width - 16;
    if (leftSide >= MARGIN) {
      left = leftSide;
    } else {
      left = Math.max(MARGIN, Math.min(coords.left, window.innerWidth - width - MARGIN));
      top = coords.bottom + 8;
    }
  }

  top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
  return { top, left };
}

export function InlineChatWindow({ session, onClose, onSend, ...chatPanelProps }: InlineChatWindowProps) {
  const [pos, setPos] = useState<{ top: number; left: number }>(() => {
    const coords = session.getAnchorCoords();
    return coords ? calcPosition(coords, PANEL_WIDTH, PANEL_HEIGHT) : { top: 80, left: 80 };
  });
  const [selection, setSelection] = useState<SelectionContext | null>({
    text: session.originalText,
    from: session.from,
    to: session.to,
    editorId: session.editorId,
  });

  useEffect(() => {
    let raf: number;
    const update = () => {
      const coords = session.getAnchorCoords();
      if (coords) setPos(calcPosition(coords, PANEL_WIDTH, PANEL_HEIGHT));
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose]);

  const handleSend = useCallback(
    (message: string, clarificationData?: ClarificationData) => {
      onSend(message, selection, clarificationData);
    },
    [onSend, selection],
  );

  return (
    <div
      className="inline-chat-window"
      style={{ top: pos.top, left: pos.left, width: PANEL_WIDTH, height: PANEL_HEIGHT }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="inline-chat-window-header">
        <span>Inline · KI-Chat</span>
        <button className="inline-chat-window-close" onClick={onClose} title="Schließen (Esc)">
          <X size={14} />
        </button>
      </div>
      <div className="inline-chat-window-body">
        <ChatPanel
          {...chatPanelProps}
          onSend={handleSend}
          activeSelection={selection}
          onDismissSelection={() => setSelection(null)}
          onReplaceSelection={(text, ctx) => session.replaceFn(ctx.from, ctx.to, text)}
        />
      </div>
    </div>
  );
}

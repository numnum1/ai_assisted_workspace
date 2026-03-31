import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeftRight } from 'lucide-react';
import type { AltVersionSession } from '../../types.ts';

interface AlternativeVersionPanelProps {
  session: AltVersionSession;
  onClose: () => void;
}

const PANEL_MAX_WIDTH = 1000;
const PANEL_MIN_WIDTH = 400;
const MARGIN = 8;

/** Estimate how many textarea rows are needed to display a text of similar length. */
function estimateRows(text: string, charsPerLine: number): number {
  const lines = text.split('\n');
  const total = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil((line.length || 1) / charsPerLine)),
    0,
  );
  return Math.max(6, Math.min(30, total + 1));
}

function calcPosition(
  coords: { top: number; bottom: number; left: number; right: number },
  panelHeight: number,
): { top: number; left: number; width: number } {
  // Use all available space to the right of the editor
  const availableRight = window.innerWidth - MARGIN - coords.right - 16;
  const width = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, availableRight));

  let left = coords.right + 16;
  let top = coords.top - 4;

  // Not enough space to the right → try left side
  if (left + width > window.innerWidth - MARGIN) {
    const leftSide = coords.left - width - 16;
    if (leftSide >= MARGIN) {
      left = leftSide;
    } else {
      left = Math.max(MARGIN, Math.min(coords.left, window.innerWidth - width - MARGIN));
      top = coords.bottom + 8;
    }
  }

  // Clamp vertical to viewport
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - panelHeight - MARGIN));

  return { top, left, width };
}

export function AlternativeVersionPanel({ session, onClose }: AlternativeVersionPanelProps) {
  const [altText, setAltText] = useState('');
  // Track what's currently in the editor at the selection (changes on swap)
  const [editorText, setEditorText] = useState(session.originalText);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>(() => {
    const coords = session.getAnchorCoords();
    return coords ? calcPosition(coords, 200) : { top: 100, left: 100, width: PANEL_MIN_WIDTH };
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const altTextRef = useRef('');
  altTextRef.current = altText;
  // Track current `to` offset – it shifts when swap changes text length
  const currentToRef = useRef(session.to);

  // Auto-focus textarea on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Track selection position with requestAnimationFrame
  useEffect(() => {
    let raf: number;
    const update = () => {
      const coords = session.getAnchorCoords();
      if (coords) {
        const panelHeight = panelRef.current?.offsetHeight ?? 200;
        setPos(calcPosition(coords, panelHeight));
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [session]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const text = altTextRef.current.trim();
        if (!text) return;
        session.replaceFn(session.from, currentToRef.current, altTextRef.current);
        onClose();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [session, onClose]);

  const handleAccept = () => {
    const text = altText.trim();
    if (!text) return;
    session.replaceFn(session.from, currentToRef.current, altText);
    onClose();
  };

  const handleKeepBoth = () => {
    const text = altText.trim();
    if (!text) return;
    session.replaceFn(session.from, currentToRef.current, `${editorText}\n\n${altText}`);
    onClose();
  };

  const handleSwap = () => {
    // Put textarea content into the editor, editor content into textarea
    session.replaceFn(session.from, currentToRef.current, altText);
    currentToRef.current = session.from + altText.length;
    setAltText(editorText);
    setEditorText(altText);
  };

  // Chars per line scales with panel width for better row estimation
  const charsPerLine = Math.round(pos.width / 8.5);

  return (
    <div
      ref={panelRef}
      className="alt-version-panel"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="alt-version-panel-header">
        <span>Alternative Version</span>
        <div className="alt-version-panel-header-actions">
          <button
            className="alt-version-btn-swap"
            onClick={handleSwap}
            title="Tauschen: Fenster-Text in Editor, Editor-Text ins Fenster"
          >
            <ArrowLeftRight size={13} />
            Tauschen
          </button>
          <button onClick={onClose} title="Schließen (Esc)">
            <X size={14} />
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="alt-version-textarea"
        value={altText}
        onChange={e => setAltText(e.target.value)}
        placeholder="Alternative Version eingeben…"
        rows={estimateRows(session.originalText, charsPerLine)}
      />

      <div className="alt-version-hint">Ctrl+Enter = Übernehmen · Esc = Verwerfen</div>

      <div className="alt-version-actions">
        <button
          className="alt-version-btn-accept"
          onClick={handleAccept}
          disabled={!altText.trim()}
          title="Fenster-Text in Editor übernehmen (Ctrl+Enter)"
        >
          Übernehmen
        </button>
        <button
          className="alt-version-btn-keep-both"
          onClick={handleKeepBoth}
          disabled={!altText.trim()}
          title="Beide Versionen behalten (Alternative wird angehängt)"
        >
          Beide behalten
        </button>
        <button
          className="alt-version-btn-discard"
          onClick={onClose}
          title="Verwerfen (Esc)"
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}

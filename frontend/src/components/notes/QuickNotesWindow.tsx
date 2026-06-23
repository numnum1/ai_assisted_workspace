import { useState, useCallback, useEffect, useRef } from 'react';
import { X, GripHorizontal, NotebookPen, Check, Loader2, AlertTriangle } from 'lucide-react';
import {
  useQuickNotes,
  loadQuickNotesPos,
  QUICK_NOTES_STORAGE_KEY,
  type QuickNotesPersistedV1,
  type QuickNotesStatus,
} from '../../hooks/useQuickNotes.ts';

interface QuickNotesWindowProps {
  open: boolean;
  onClose: () => void;
  projectPath: string | null;
}

const WINDOW_WIDTH = 384;

function StatusIndicator({ status, hasProject }: { status: QuickNotesStatus; hasProject: boolean }) {
  if (!hasProject) {
    return <span className="quick-notes-status">Kein Projekt geöffnet</span>;
  }
  if (status === 'saving' || status === 'loading') {
    return (
      <span className="quick-notes-status">
        <Loader2 size={12} className="quick-notes-spin" aria-hidden />
        {status === 'loading' ? 'Lade…' : 'Speichere…'}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="quick-notes-status quick-notes-status--error">
        <AlertTriangle size={12} aria-hidden />
        Fehler
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="quick-notes-status">
        <Check size={12} aria-hidden />
        Gespeichert
      </span>
    );
  }
  return null;
}

export function QuickNotesWindow({ open, onClose, projectPath }: QuickNotesWindowProps) {
  const { text, status, updateText, hasProject } = useQuickNotes(projectPath, open);
  const [pos, setPos] = useState(() => loadQuickNotesPos());
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  // Persist window position.
  useEffect(() => {
    const payload: QuickNotesPersistedV1 = { v: 1, pos };
    try {
      localStorage.setItem(QUICK_NOTES_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [pos]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };
    },
    [pos.x, pos.y],
  );

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nx = Math.min(
      Math.max(4, dragRef.current.origX + dx),
      Math.max(4, (typeof window !== 'undefined' ? window.innerWidth : 800) - WINDOW_WIDTH - 4),
    );
    const ny = Math.min(
      Math.max(4, dragRef.current.origY + dy),
      Math.max(4, (typeof window !== 'undefined' ? window.innerHeight : 600) - 120),
    );
    setPos({ x: nx, y: ny });
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragRef.current && e.pointerId === dragRef.current.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="quick-notes-window"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Quick Notes"
    >
      <div
        className="quick-notes-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <GripHorizontal size={16} className="quick-notes-grip" aria-hidden />
        <NotebookPen size={14} className="quick-notes-grip" aria-hidden />
        <span className="quick-notes-title">Notizen</span>
        <StatusIndicator status={status} hasProject={hasProject} />
        <span className="quick-notes-hint" title="Tastenkürzel">
          Alt+N
        </span>
        <button type="button" className="quick-notes-icon-btn" onClick={onClose} title="Schließen">
          <X size={16} />
        </button>
      </div>

      {!hasProject && (
        <div className="quick-notes-banner">
          Öffne ein Projekt, um Notizen zu speichern. Sie werden in <code>.assistant/notes.md</code> abgelegt.
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="quick-notes-textarea"
        value={text}
        onChange={(e) => updateText(e.target.value)}
        placeholder={
          hasProject
            ? 'Schnelle Notizen — werden automatisch im Projekt gespeichert…'
            : 'Kein Projekt geöffnet.'
        }
        disabled={!hasProject || status === 'loading'}
        spellCheck={false}
      />
    </div>
  );
}

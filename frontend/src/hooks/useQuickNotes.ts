import { useState, useCallback, useEffect, useRef } from 'react';
import { filesApi } from '../api.ts';

/** Project-relative file backing the Quick Notes scratchpad. */
export const QUICK_NOTES_FILE_PATH = '.assistant/notes.md';

/** localStorage key for the floating window position (project-independent). */
export const QUICK_NOTES_STORAGE_KEY = 'markdown-project-quick-notes-v1';

export type QuickNotesStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export interface QuickNotesPersistedV1 {
  v: 1;
  pos: { x: number; y: number };
}

const SAVE_DEBOUNCE_MS = 700;

function defaultQuickNotesPos(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 40, y: 80 };
  }
  const w = 384;
  return {
    x: Math.max(8, Math.min(window.innerWidth - w - 8, window.innerWidth - w - 16)),
    y: Math.max(8, Math.round(window.innerHeight * 0.16)),
  };
}

/** Load persisted window position; falls back to a sensible default. */
export function loadQuickNotesPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(QUICK_NOTES_STORAGE_KEY);
    if (!raw) return defaultQuickNotesPos();
    const p = JSON.parse(raw) as Partial<QuickNotesPersistedV1>;
    if (p.v !== 1 || !p.pos || typeof p.pos.x !== 'number' || typeof p.pos.y !== 'number') {
      return defaultQuickNotesPos();
    }
    return p.pos;
  } catch {
    return defaultQuickNotesPos();
  }
}

function isMissingFileError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // filesService throws ENOENT (stat) or "Not a file" before the notes file is created.
  return /ENOENT|no such file|Not a file/i.test(msg);
}

/**
 * Per-project notes scratchpad backed by {@link QUICK_NOTES_FILE_PATH}. Loads the
 * file when the project changes (or the window first opens), and debounce-saves
 * edits back to disk. The file is created lazily on the first save — a missing
 * file simply reads as empty.
 */
export function useQuickNotes(projectPath: string | null, open: boolean) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<QuickNotesStatus>('idle');

  /** Guards the debounced save so we never persist before the initial load completes. */
  const loadedForRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const flushSave = useCallback(async () => {
    if (!projectPath) return;
    const pending = textRef.current;
    setStatus('saving');
    try {
      await filesApi.saveContent(QUICK_NOTES_FILE_PATH, pending);
      // A newer edit may have queued another save in the meantime — keep "saved"
      // only if what we wrote is still current.
      setStatus(textRef.current === pending ? 'saved' : 'saving');
    } catch (err) {
      console.error('[quick-notes] save failed:', err);
      setStatus('error');
    }
  }, [projectPath]);

  // Load notes for the active project (once per project, when the window is open).
  useEffect(() => {
    if (!open || !projectPath) return;
    if (loadedForRef.current === projectPath) return;
    loadedForRef.current = projectPath;
    let cancelled = false;
    setStatus('loading');
    void (async () => {
      try {
        const res = await filesApi.getContent(QUICK_NOTES_FILE_PATH);
        if (cancelled) return;
        setText(typeof res.content === 'string' ? res.content : '');
        setStatus('saved');
      } catch (err) {
        if (cancelled) return;
        if (isMissingFileError(err)) {
          setText('');
          setStatus('idle');
        } else {
          console.error('[quick-notes] load failed:', err);
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectPath]);

  // Reset the load guard when the project closes/changes so notes reload next open.
  useEffect(() => {
    if (loadedForRef.current && loadedForRef.current !== projectPath) {
      loadedForRef.current = null;
      setText('');
      setStatus('idle');
    }
  }, [projectPath]);

  const updateText = useCallback(
    (next: string) => {
      setText(next);
      if (!projectPath || loadedForRef.current !== projectPath) return;
      setStatus('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [projectPath, flushSave],
  );

  // Persist immediately on unmount / project switch if an edit is still pending.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, []);

  return { text, status, updateText, hasProject: !!projectPath };
}

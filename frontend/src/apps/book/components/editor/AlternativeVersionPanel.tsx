import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeftRight, StickyNote, Copy, Check, Sparkles, Loader2, Square } from 'lucide-react';
import type { AltVersionSession, InlineUnitContext } from '../../../../shared/types.ts';

type WriteScope = 'selection' | 'unit';

interface AlternativeVersionPanelProps {
  session: AltVersionSession;
  onClose: () => void;
  /**
   * Streams a one-shot inline completion. Returns an AbortController so the panel
   * can stop generation. When omitted, the AI section is hidden (manual mode only).
   */
  onGenerate?: (
    prompt: string,
    cbs: {
      onToken: (t: string) => void;
      onDone: (full: string) => void;
      onError: (e: Error) => void;
    },
  ) => AbortController;
}

const PANEL_MAX_WIDTH = 1000;
const PANEL_MIN_WIDTH = 400;
const MARGIN = 8;

/** Length presets — the "wie viel schreibt die KI" control. */
const LENGTH_OPTIONS: { key: string; label: string; hint: string }[] = [
  { key: 'short', label: 'Kurz', hint: 'Halte dich sehr knapp: höchstens ein bis zwei Sätze.' },
  { key: 'medium', label: 'Mittel', hint: 'Schreibe etwa einen Absatz.' },
  { key: 'long', label: 'Lang', hint: 'Schreibe ausführlich, mehrere Absätze wenn nötig.' },
  { key: 'free', label: 'Frei', hint: '' },
];

/** Estimate how many textarea rows are needed to display a text of similar length. */
function estimateRows(text: string, charsPerLine: number): number {
  const lines = text.split('\n');
  const total = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil((line.length || 1) / charsPerLine)),
    0,
  );
  return Math.max(6, Math.min(30, total + 1));
}

/**
 * Assemble a self-contained prompt for inline generation. The full unit content is
 * always included (context, never repeated in the output); description/extras convey
 * author intent; the write scope decides whether the model rewrites the selection or
 * the whole unit; the length hint controls output size.
 */
function buildInlinePrompt(opts: {
  instruction: string;
  scope: WriteScope;
  selectionText: string;
  fullText: string;
  inlineContext?: InlineUnitContext;
  lengthKey: string;
}): string {
  const { instruction, scope, selectionText, fullText, inlineContext, lengthKey } = opts;
  const label = inlineContext?.unitLabel ?? 'Textabschnitt';
  const title = inlineContext?.title;
  const lengthHint = LENGTH_OPTIONS.find(o => o.key === lengthKey)?.hint ?? '';
  const parts: string[] = [];

  parts.push(
    `Du arbeitest als Autor direkt im Fließtext eines Buches${title ? ` (${label}: „${title}“)` : ''}.`,
  );
  parts.push('');
  parts.push(`VOLLSTÄNDIGER INHALT DER ${label.toUpperCase()} (Kontext — nicht erneut ausgeben):`);
  parts.push('"""');
  parts.push(fullText.trim() || '(noch leer)');
  parts.push('"""');

  if (inlineContext?.description) {
    parts.push('');
    parts.push('ABSICHT / BESCHREIBUNG DIESER EINHEIT:');
    parts.push(inlineContext.description);
  }

  const extras = inlineContext?.extras;
  if (extras && Object.keys(extras).length > 0) {
    const lines = Object.entries(extras).filter(([, v]) => v && v.trim());
    if (lines.length > 0) {
      parts.push('');
      parts.push('WEITERE VORGABEN:');
      for (const [k, v] of lines) parts.push(`- ${k}: ${v}`);
    }
  }

  parts.push('');
  if (scope === 'unit') {
    parts.push('ARBEITSBEREICH: die GESAMTE Einheit oben. Du darfst sie vollständig neu schreiben.');
  } else {
    parts.push('ARBEITSBEREICH: NUR der folgende markierte Ausschnitt aus der Einheit:');
    parts.push('"""');
    parts.push(selectionText.trim() || '(leer)');
    parts.push('"""');
  }

  parts.push('');
  parts.push(
    `AUFGABE: ${instruction || 'Schreibe den Arbeitsbereich stimmig weiter bzw. überarbeite ihn.'}`,
  );
  if (lengthHint) parts.push(`UMFANG: ${lengthHint}`);

  parts.push('');
  parts.push(
    'Antworte AUSSCHLIESSLICH mit dem neuen Text für den Arbeitsbereich — ohne Vorwort, ohne Erklärung, ohne umschließende Anführungszeichen.',
  );
  return parts.join('\n');
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

export function AlternativeVersionPanel({ session, onClose, onGenerate }: AlternativeVersionPanelProps) {
  const hasUnit = session.inlineContext != null;
  const fullText = session.fullText ?? session.originalText;

  const [altText, setAltText] = useState('');
  const [scope, setScope] = useState<WriteScope>('selection');
  // Base text currently occupying the write target (changes with scope + swap)
  const [editorText, setEditorText] = useState(session.originalText);
  const [instruction, setInstruction] = useState('');
  const [lengthKey, setLengthKey] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesCopied, setNotesCopied] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>(() => {
    const coords = session.getAnchorCoords();
    return coords ? calcPosition(coords, 200) : { top: 100, left: 100, width: PANEL_MIN_WIDTH };
  });

  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const altTextRef = useRef('');
  const genAbortRef = useRef<AbortController | null>(null);

  // Write target for the current scope. `from` is fixed per scope; `to` shifts on swap.
  const currentFromRef = useRef(session.from);
  const currentToRef = useRef(session.to);

  // Auto-focus the instruction field (or the alt textarea in pure manual mode)
  useEffect(() => {
    if (onGenerate) instructionRef.current?.focus();
    else textareaRef.current?.focus();
  }, [onGenerate]);

  // Keep the latest altText available to the global keydown handler without re-binding it
  useEffect(() => {
    altTextRef.current = altText;
  }, [altText]);

  // Abort any in-flight generation on unmount
  useEffect(() => () => genAbortRef.current?.abort(), []);

  // Switch write target: `unit` targets the whole action content, `selection` the marked range.
  const changeScope = (next: WriteScope) => {
    if (next === scope) return;
    if (next === 'unit') {
      currentFromRef.current = 0;
      currentToRef.current = fullText.length;
      setEditorText(fullText);
    } else {
      currentFromRef.current = session.from;
      currentToRef.current = session.to;
      setEditorText(session.originalText);
    }
    setScope(next);
  };

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
        session.replaceFn(currentFromRef.current, currentToRef.current, altTextRef.current);
        onClose();
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [session, onClose]);

  const handleGenerate = () => {
    if (!onGenerate || generating) return;
    const prompt = buildInlinePrompt({
      instruction: instruction.trim(),
      scope,
      selectionText: session.originalText,
      fullText,
      inlineContext: session.inlineContext,
      lengthKey,
    });
    setGenerating(true);
    setGenError(null);
    setAltText('');
    let acc = '';
    genAbortRef.current = onGenerate(prompt, {
      onToken: t => {
        acc += t;
        setAltText(acc);
      },
      onDone: full => {
        setGenerating(false);
        if (full && full.trim()) setAltText(full);
      },
      onError: e => {
        setGenerating(false);
        setGenError(e.message);
      },
    });
  };

  const handleStopGen = () => {
    genAbortRef.current?.abort();
    genAbortRef.current = null;
    setGenerating(false);
  };

  const handleAccept = () => {
    const text = altText.trim();
    if (!text) return;
    session.replaceFn(currentFromRef.current, currentToRef.current, altText);
    onClose();
  };

  const handleKeepBoth = () => {
    const text = altText.trim();
    if (!text) return;
    session.replaceFn(currentFromRef.current, currentToRef.current, `${editorText}\n\n${altText}`);
    onClose();
  };

  const handleSwap = () => {
    // Put textarea content into the editor, editor content into textarea
    session.replaceFn(currentFromRef.current, currentToRef.current, altText);
    currentToRef.current = currentFromRef.current + altText.length;
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
        <span>Inline · KI &amp; alternative Version</span>
        <div className="alt-version-panel-header-actions">
          <button
            className="alt-version-btn-swap"
            onClick={handleSwap}
            title="Tauschen: Fenster-Text in Editor, Editor-Text ins Fenster"
          >
            <ArrowLeftRight size={13} />
            Tauschen
          </button>
          <button
            className={`alt-version-btn-notes-toggle${notesOpen ? ' active' : ''}`}
            onClick={() => setNotesOpen(v => !v)}
            title={notesOpen ? 'Notizfeld ausblenden' : 'Notizfeld einblenden'}
          >
            <StickyNote size={13} />
            Notizen
          </button>
          <button onClick={onClose} title="Schließen (Esc)">
            <X size={14} />
          </button>
        </div>
      </div>

      {onGenerate && (
        <div className="inline-ai-block">
          <div className="inline-ai-row">
            {hasUnit && (
              <div className="inline-ai-scope" role="group" aria-label="Arbeitsbereich">
                <button
                  className={scope === 'selection' ? 'active' : ''}
                  onClick={() => changeScope('selection')}
                  title="Die KI überarbeitet nur den markierten Ausschnitt"
                >
                  Nur Auswahl
                </button>
                <button
                  className={scope === 'unit' ? 'active' : ''}
                  onClick={() => changeScope('unit')}
                  title={`Die KI überarbeitet die ganze ${session.inlineContext?.unitLabel ?? 'Einheit'}`}
                >
                  Ganze {session.inlineContext?.unitLabel ?? 'Einheit'}
                </button>
              </div>
            )}
            <div className="inline-ai-length" role="group" aria-label="Umfang">
              {LENGTH_OPTIONS.map(o => (
                <button
                  key={o.key}
                  className={lengthKey === o.key ? 'active' : ''}
                  onClick={() => setLengthKey(o.key)}
                  title={o.hint || 'Kein Umfangslimit'}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="inline-ai-prompt-row">
            <textarea
              ref={instructionRef}
              className="inline-ai-instruction"
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') return; // handled globally (accept)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="Was soll die KI tun? (z. B. „weiterschreiben“, „spannungsvoller“, „Dialog ergänzen“) — Enter zum Generieren"
              rows={2}
            />
            {generating ? (
              <button className="inline-ai-generate stop" onClick={handleStopGen} title="Generierung stoppen">
                <Square size={13} />
                Stopp
              </button>
            ) : (
              <button className="inline-ai-generate" onClick={handleGenerate} title="Text generieren (Enter)">
                <Sparkles size={13} />
                Generieren
              </button>
            )}
          </div>

          {hasUnit && (
            <div className="inline-ai-context-note">
              {generating && <Loader2 size={11} className="inline-ai-spin" />}
              Kontext: komplette {session.inlineContext?.unitLabel ?? 'Einheit'}
              {session.inlineContext?.description ? ' + Beschreibung' : ''}
              {session.inlineContext?.extras && Object.keys(session.inlineContext.extras).length > 0
                ? ' + Vorgaben'
                : ''}
            </div>
          )}
          {genError && <div className="inline-ai-error">{genError}</div>}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="alt-version-textarea"
        value={altText}
        onChange={e => setAltText(e.target.value)}
        placeholder="Ergebnis der KI erscheint hier – oder Text selbst eingeben…"
        rows={estimateRows(editorText, charsPerLine)}
      />

      {notesOpen && (
        <div className="alt-version-notes-block">
          <div className="alt-version-notes-toolbar">
            <button
              type="button"
              title={notesCopied ? 'Kopiert' : 'Notizen in Zwischenablage kopieren'}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(notes);
                  setNotesCopied(true);
                  setTimeout(() => setNotesCopied(false), 2000);
                } catch {
                  /* ignore */
                }
              }}
            >
              {notesCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <textarea
            className="alt-version-textarea alt-version-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notizen…"
            rows={4}
          />
        </div>
      )}

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

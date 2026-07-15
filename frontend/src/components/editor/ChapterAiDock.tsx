import { useEffect, useRef, useState } from 'react';
import {
  MessageSquareText,
  PenLine,
  Lightbulb,
  Sparkles,
  Send,
  Square,
  Loader2,
  Plus,
  Check,
} from 'lucide-react';
import type { CommentCategory, CommentCategoryDef, ChatMessage } from '../../types.ts';
import { categoryColor, categoryLabel } from './commentCategories.ts';
import { usePanelChat } from '../../hooks/usePanelChat.ts';

/** The three mutually-exclusive AI functions that share the right-hand dock. */
export type AiFeature = 'kommentare' | 'schreiben' | 'ideen';

/** Context handed to the Schreibhilfe chat so the model sees what's being written. */
export interface WritingContext {
  unitLabel: string;
  unitText: string;
  chapterTitle: string;
}

interface ChapterAiDockProps {
  activeFeature: AiFeature | null;
  onSelectFeature: (f: AiFeature | null) => void;
  night: boolean;
  mutedText: string;
  textColor: string;

  // ── Kommentare ──────────────────────────────────────────────
  categoryDefs: CommentCategoryDef[];
  activeCategories: Set<CommentCategory>;
  onToggleCategory: (id: CommentCategory) => void;
  commentFreeText: string;
  setCommentFreeText: (s: string) => void;
  onGenerateComments: () => void;
  commentsLoading: boolean;
  commentsError: string | null;
  commentsCount: number;

  // ── Chats (Schreibhilfe / Ideenfinder) ──────────────────────
  getWritingContext: () => WritingContext;
  getIdeaContext: () => string;
  /** Insert text into the unit the author is currently writing in. */
  onInsertText: (text: string) => boolean;
  llmId?: string;
  disabledToolkits?: ReadonlySet<string>;
}

const RAIL_ITEMS: { id: AiFeature; icon: typeof MessageSquareText; label: string }[] = [
  { id: 'kommentare', icon: MessageSquareText, label: 'Kommentare' },
  { id: 'schreiben', icon: PenLine, label: 'Schreibhilfe' },
  { id: 'ideen', icon: Lightbulb, label: 'Ideenfinder' },
];

/**
 * Right-hand AI dock: a slim vertical icon rail at the far edge picks exactly
 * one of three functions, and the wider body left of the rail shows the active
 * one. Comments manifest as controls here plus anchored cards in the text; the
 * two chats live entirely in the body.
 */
export function ChapterAiDock({
  activeFeature,
  onSelectFeature,
  night,
  mutedText,
  textColor,
  categoryDefs,
  activeCategories,
  onToggleCategory,
  commentFreeText,
  setCommentFreeText,
  onGenerateComments,
  commentsLoading,
  commentsError,
  commentsCount,
  getWritingContext,
  getIdeaContext,
  onInsertText,
  llmId,
  disabledToolkits,
}: ChapterAiDockProps) {
  const write = usePanelChat();
  const ideas = usePanelChat();
  const { setLlmId: setWriteLlm } = write;
  const { setLlmId: setIdeasLlm } = ideas;

  useEffect(() => {
    setWriteLlm(llmId);
    setIdeasLlm(llmId);
  }, [llmId, setWriteLlm, setIdeasLlm]);

  const bodyOpen = activeFeature !== null;

  return (
    <div className={`chapter-ai-dock${bodyOpen ? ' chapter-ai-dock-open' : ''}${night ? ' chapter-ai-dock-night' : ''}`}>
      {bodyOpen && (
        <div className="chapter-ai-dock-body" style={{ color: textColor }}>
          {activeFeature === 'kommentare' && (
            <CommentControls
              categoryDefs={categoryDefs}
              activeCategories={activeCategories}
              onToggleCategory={onToggleCategory}
              freeText={commentFreeText}
              setFreeText={setCommentFreeText}
              onGenerate={onGenerateComments}
              loading={commentsLoading}
              error={commentsError}
              count={commentsCount}
              mutedText={mutedText}
            />
          )}
          {activeFeature === 'schreiben' && (
            <PanelChat
              kind="schreiben"
              chat={write}
              getWritingContext={getWritingContext}
              getIdeaContext={getIdeaContext}
              onInsertText={onInsertText}
              disabledToolkits={disabledToolkits}
              mutedText={mutedText}
            />
          )}
          {activeFeature === 'ideen' && (
            <PanelChat
              kind="ideen"
              chat={ideas}
              getWritingContext={getWritingContext}
              getIdeaContext={getIdeaContext}
              onInsertText={onInsertText}
              disabledToolkits={disabledToolkits}
              mutedText={mutedText}
            />
          )}
        </div>
      )}

      <div className="chapter-ai-rail" role="tablist" aria-label="KI-Funktionen">
        {RAIL_ITEMS.map(({ id, icon: Icon, label }) => {
          const active = activeFeature === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`chapter-ai-rail-btn${active ? ' active' : ''}`}
              title={label}
              onClick={() => onSelectFeature(active ? null : id)}
            >
              <Icon size={18} />
              {id === 'kommentare' && commentsCount > 0 && (
                <span className="chapter-ai-rail-dot" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Kommentare — controls that drive the existing (wiki-aware) comment engine.
// The generated cards render anchored in the text via ChapterView.
// ─────────────────────────────────────────────────────────────────────────
interface CommentControlsProps {
  categoryDefs: CommentCategoryDef[];
  activeCategories: Set<CommentCategory>;
  onToggleCategory: (id: CommentCategory) => void;
  freeText: string;
  setFreeText: (s: string) => void;
  onGenerate: () => void;
  loading: boolean;
  error: string | null;
  count: number;
  mutedText: string;
}

function CommentControls({
  categoryDefs,
  activeCategories,
  onToggleCategory,
  freeText,
  setFreeText,
  onGenerate,
  loading,
  error,
  count,
  mutedText,
}: CommentControlsProps) {
  return (
    <div className="chapter-ai-panel">
      <div className="chapter-ai-panel-head">
        <MessageSquareText size={14} />
        <span>Kommentare</span>
      </div>
      <p className="chapter-ai-panel-hint" style={{ color: mutedText }}>
        Rechtschreibung, Formulierung und Lore — die KI heftet Anmerkungen an die passende
        Textstelle.
      </p>

      <div className="chapter-ai-cat-chips">
        {categoryDefs.map((c) => {
          const on = activeCategories.has(c.id);
          const color = categoryColor(categoryDefs, c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`chapter-ai-cat-chip${on ? ' on' : ''}`}
              style={on ? { borderColor: color, color } : undefined}
              onClick={() => onToggleCategory(c.id)}
            >
              {categoryLabel(categoryDefs, c.id)}
            </button>
          );
        })}
      </div>

      <textarea
        className="chapter-ai-freetext"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder="Worauf soll die KI besonders achten? (optional)"
        rows={3}
      />

      <button
        type="button"
        className="chapter-ai-primary-btn"
        onClick={onGenerate}
        disabled={loading || activeCategories.size === 0}
      >
        {loading ? <Loader2 size={14} className="chapter-ai-spin" /> : <Sparkles size={14} />}
        {loading ? 'Wird geprüft…' : 'Kommentare erzeugen'}
      </button>

      {error && <div className="chapter-ai-error">{error}</div>}
      {!error && count > 0 && (
        <div className="chapter-ai-panel-note" style={{ color: mutedText }}>
          {count} {count === 1 ? 'Anmerkung' : 'Anmerkungen'} am Text.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Schreibhilfe / Ideenfinder — an ephemeral chat that sees the current text.
// ─────────────────────────────────────────────────────────────────────────
type PanelChatHook = ReturnType<typeof usePanelChat>;

interface PanelChatProps {
  kind: 'schreiben' | 'ideen';
  chat: PanelChatHook;
  getWritingContext: () => WritingContext;
  getIdeaContext: () => string;
  onInsertText: (text: string) => boolean;
  disabledToolkits?: ReadonlySet<string>;
  mutedText: string;
}

function buildResolved(kind: 'schreiben' | 'ideen', display: string, ctx: WritingContext, ideaCtx: string): string {
  if (kind === 'schreiben') {
    return [
      `Du bist eine literarische Schreibhilfe und arbeitest direkt im Fließtext eines Romans${ctx.chapterTitle ? ` (Kapitel: „${ctx.chapterTitle}“)` : ''}.`,
      'Antworte auf Deutsch. Wenn du Prosa lieferst, gib nur den Text aus — ohne Vorrede, ohne Anführungszeichen.',
      '',
      `AKTUELLER TEXT DER ${ctx.unitLabel.toUpperCase()} (Kontext, nicht wiederholen):`,
      '"""',
      ctx.unitText.trim() || '(noch leer)',
      '"""',
      '',
      'AUFGABE DES AUTORS:',
      display,
    ].join('\n');
  }
  return [
    'Du bist ein kreativer Ideengeber für die Entwicklung eines Romans.',
    'Antworte auf Deutsch, konkret und knapp; biete mehrere Optionen zur Auswahl an.',
    '',
    'KONTEXT (Überblick):',
    '"""',
    ideaCtx.trim() || '(kein Kontext verfügbar)',
    '"""',
    '',
    'FRAGE / IMPULS DES AUTORS:',
    display,
  ].join('\n');
}

function PanelChat({
  kind,
  chat,
  getWritingContext,
  getIdeaContext,
  onInsertText,
  disabledToolkits,
  mutedText,
}: PanelChatProps) {
  const { messages, streaming, error, toolActivity, sendMessage, stopStreaming, retry, clearMessages } = chat;
  const [draft, setDraft] = useState('');
  const [inserted, setInserted] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, toolActivity]);

  useEffect(() => {
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, []);

  const handleSend = () => {
    const t = draft.trim();
    if (!t || streaming) return;
    setDraft('');
    const resolved = buildResolved(kind, t, getWritingContext(), getIdeaContext());
    const kits = disabledToolkits && disabledToolkits.size > 0 ? [...disabledToolkits] : undefined;
    sendMessage(t, resolved, kits ? { disabledToolkits: kits } : undefined);
  };

  const visible = messages.filter((m: ChatMessage) => !m.hidden && (m.role === 'user' || m.role === 'assistant'));

  const placeholder =
    kind === 'schreiben'
      ? 'z. B. „Schreib die Ankunft am Hafen weiter" oder „Mach den Absatz düsterer"'
      : 'z. B. „Gib mir drei Wendungen für dieses Kapitel"';

  return (
    <div className="chapter-ai-chat">
      <div className="chapter-ai-panel-head">
        {kind === 'schreiben' ? <PenLine size={14} /> : <Lightbulb size={14} />}
        <span>{kind === 'schreiben' ? 'Schreibhilfe' : 'Ideenfinder'}</span>
        {visible.length > 0 && (
          <button
            type="button"
            className="chapter-ai-clear-btn"
            onClick={() => clearMessages()}
            disabled={streaming}
            title="Verlauf leeren"
          >
            Leeren
          </button>
        )}
      </div>

      <div className="chapter-ai-chat-scroll" ref={scrollRef}>
        {visible.length === 0 && (
          <p className="chapter-ai-panel-hint" style={{ color: mutedText }}>
            {kind === 'schreiben'
              ? 'Bitte um Fortsetzung, Umschreibung oder Verdichtung — jede Antwort lässt sich mit einem Klick in den Text einfügen.'
              : 'Frei denken: Wendungen, Figuren-Motive, Was-wäre-wenn. Ergebnisse bleiben hier, nichts wird gespeichert.'}
          </p>
        )}
        {visible.map((m, i) => (
          <div key={i} className={`chapter-ai-bubble chapter-ai-bubble-${m.role}`}>
            <div className="chapter-ai-bubble-label">{m.role === 'user' ? 'Du' : 'KI'}</div>
            <div className="chapter-ai-bubble-text">{m.content}</div>
            {kind === 'schreiben' && m.role === 'assistant' && m.content.trim() && !streaming && (
              <button
                type="button"
                className="chapter-ai-insert-btn"
                onClick={() => {
                  if (onInsertText(m.content)) {
                    setInserted(i);
                    window.setTimeout(() => setInserted((cur) => (cur === i ? null : cur)), 1500);
                  }
                }}
                title="An der Cursor-Position in den Text einfügen"
              >
                {inserted === i ? <Check size={12} /> : <Plus size={12} />}
                {inserted === i ? 'Eingefügt' : 'In Text einfügen'}
              </button>
            )}
          </div>
        ))}
        {toolActivity && streaming && <div className="chapter-ai-tool">{toolActivity}</div>}
        {error && (
          <div className="chapter-ai-error">
            {error === 'NETWORK_ERROR'
              ? 'Verbindungsproblem: Die KI-API ist nicht erreichbar.'
              : error === 'MODEL_EMPTY_RESPONSE'
                ? 'Das Modell hat keine Antwort geliefert.'
                : error}
            <button className="chapter-ai-retry-btn" onClick={retry}>
              Erneut versuchen
            </button>
          </div>
        )}
      </div>

      <div className="chapter-ai-input-row">
        <textarea
          ref={textareaRef}
          className="chapter-ai-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          rows={3}
          disabled={streaming}
        />
        {streaming ? (
          <button type="button" className="chapter-ai-send stop" onClick={stopStreaming} title="Stop">
            <Square size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="chapter-ai-send"
            onClick={handleSend}
            disabled={!draft.trim()}
            title="Senden (Enter)"
          >
            <Send size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

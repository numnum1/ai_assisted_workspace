import { useState, useCallback, useEffect, useRef } from 'react';
import { X, GripHorizontal, Trash2, Send, Square } from 'lucide-react';
import type { LlmPublic } from '../../types.ts';
import { projectConfigApi } from '../../api.ts';
import {
  useQuickChat,
  loadQuickChatPersisted,
  QUICK_CHAT_STORAGE_KEY,
  type QuickChatPersistedV1,
} from '../../hooks/useQuickChat.ts';

interface QuickChatWindowProps {
  open: boolean;
  onClose: () => void;
  llms: LlmPublic[];
  webSearchAvailable: boolean;
  /** Same preference as main chat: no tools in API when true. */
  toolsDisabled?: boolean;
}

export function QuickChatWindow({ open, onClose, llms, webSearchAvailable, toolsDisabled = false }: QuickChatWindowProps) {
  const {
    messages,
    streaming,
    error,
    toolActivity,
    sendMessage,
    stopStreaming,
    retry,
    clearMessages,
    setLlmId,
  } = useQuickChat();
  const [pos, setPos] = useState(() => loadQuickChatPersisted().pos);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');

  const resolvedLlmId = useCallback(async (): Promise<string | undefined> => {
    try {
      const status = await projectConfigApi.status();
      if (status.initialized) {
        const cfg = await projectConfigApi.get();
        const id = cfg.quickChatLlmId?.trim();
        if (id && llms.some((l) => l.id === id)) {
          return id;
        }
      }
    } catch {
      /* ignore */
    }
    return llms[0]?.id;
  }, [llms]);

  useEffect(() => {
    if (!open) return;
    void resolvedLlmId().then((id) => setLlmId(id));
  }, [open, resolvedLlmId, setLlmId]);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  useEffect(() => {
    const payload: QuickChatPersistedV1 = {
      v: 1,
      messages,
      pos,
    };
    try {
      localStorage.setItem(QUICK_CHAT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [messages, pos]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
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
  }, [pos.x, pos.y]);

  const onHeaderPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const w = 384;
      const nx = Math.min(
        Math.max(4, dragRef.current.origX + dx),
        Math.max(4, (typeof window !== 'undefined' ? window.innerWidth : 800) - w - 4),
      );
      const ny = Math.min(
        Math.max(4, dragRef.current.origY + dy),
        Math.max(4, (typeof window !== 'undefined' ? window.innerHeight : 600) - 120),
      );
      setPos({ x: nx, y: ny });
    },
    [],
  );

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

  const handleSend = useCallback(() => {
    const t = draft.trim();
    if (!t || streaming) return;
    setDraft('');
    sendMessage(t, { disableTools: toolsDisabled });
  }, [draft, streaming, sendMessage, toolsDisabled]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="quick-chat-window"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="Quick Chat"
    >
      <div
        className="quick-chat-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <GripHorizontal size={16} className="quick-chat-grip" aria-hidden />
        <span className="quick-chat-title">Quick Chat</span>
        <span className="quick-chat-hint" title="Tastenkürzel">
          Alt+E
        </span>
        <button
          type="button"
          className="quick-chat-icon-btn"
          onClick={() => clearMessages()}
          title="Verlauf leeren"
          disabled={streaming}
        >
          <Trash2 size={15} />
        </button>
        <button type="button" className="quick-chat-icon-btn" onClick={onClose} title="Schließen">
          <X size={16} />
        </button>
      </div>

      {!webSearchAvailable && (
        <div className="quick-chat-banner">
          Websuche nicht konfiguriert — setze <code>TAVILY_API_KEY</code> / <code>app.web-search.api-key</code> im
          Backend.
        </div>
      )}

      <div className="quick-chat-messages">
        {messages.filter((m) => !m.hidden).length === 0 && (
          <p className="quick-chat-empty">
            Kurze Fragen, Begriffe oder Formulierungen — ohne Projekt-Kontext. Mit Websuche (wenn konfiguriert).
          </p>
        )}
        {messages
          .filter((m) => !m.hidden)
          .map((m, idx) => (
            <div key={idx} className={`quick-chat-bubble quick-chat-bubble--${m.role}`}>
              <div className="quick-chat-bubble-label">
                {m.role === 'user' ? 'Du' : 'KI'}
              </div>
              <div className="quick-chat-bubble-text">{m.content}</div>
            </div>
          ))}
        {toolActivity && streaming && (
          <div className="quick-chat-tool">{toolActivity}</div>
        )}
        {error && (
          <div className="quick-chat-error">
            {error === 'NETWORK_ERROR' ? (
              <>
                <strong>Verbindungsproblem:</strong> Die KI-API ist nicht erreichbar.
                <br />
                Bitte VPN-Verbindung prüfen — aktive VPN-Verbindungen können die DNS-Auflösung blockieren.
              </>
            ) : error === 'MODEL_EMPTY_RESPONSE' ? (
              'Das Modell hat keine Antwort geliefert (Kontext zu lang oder Inhaltsfilter).'
            ) : (
              error
            )}
            {(error === 'MODEL_EMPTY_RESPONSE' || error === 'NETWORK_ERROR') && (
              <button className="quick-chat-retry-btn" onClick={retry}>
                Erneut versuchen
              </button>
            )}
          </div>
        )}
      </div>

      <div className="quick-chat-input-row">
        <textarea
          ref={textareaRef}
          className="quick-chat-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Nachricht…"
          disabled={streaming}
          rows={2}
        />
        {streaming ? (
          <button
            type="button"
            className="quick-chat-send stop"
            onClick={() => stopStreaming()}
            title="Stop"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="quick-chat-send"
            onClick={handleSend}
            disabled={!draft.trim()}
            title="Senden (Enter)"
          >
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

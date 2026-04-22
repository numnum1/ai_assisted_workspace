import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Plus, Wand2 } from 'lucide-react';
import { chatApi, chapterApi } from '../../api.ts';
import { FileChip } from '../common/FileChip.tsx';

/** User-visible instruction templates (fill only the instruction field). */
const TEMPLATES: { id: string; label: string; instruction: string }[] = [
  {
    id: 'scene',
    label: 'Szene ausarbeiten',
    instruction:
      'Ich möchte an folgender Szene arbeiten:\n\n' +
      '[Kapitel / Szene nennen]\n\n' +
      'Ziel: [z. B. erste Fassung, Überarbeitung, Spannung erhöhen …]',
  },
  {
    id: 'dialog',
    label: 'Dialog schärfen',
    instruction:
      'Ich möchte Dialoge in folgender Szene schärfen:\n\n' +
      '[Szene / Figuren]\n\n' +
      'Fokus: [Stimme, Subtext, Tempo …]',
  },
  {
    id: 'plot',
    label: 'Plotloch analysieren',
    instruction:
      'Ich möchte ein Plot- oder Logikproblem klären:\n\n' +
      '[Wo klemmt es? Welche Kapitel/Szenen?]',
  },
  {
    id: 'character',
    label: 'Figurenentwicklung',
    instruction:
      'Ich möchte bei folgender Figur weiterdenken:\n\n' +
      '[Name / Rolle]\n\n' +
      'Thema: [Motivation, Bogen, Beziehung …]',
  },
  {
    id: 'free',
    label: 'Frei / Allgemein',
    instruction: 'Beschreibe hier, was der externe Chatbot für dich leisten soll:\n\n',
  },
];

export function buildPromptPackUserMessage(instruction: string, paths: string[]): string {
  const trimmed = instruction.trim();
  const sourcesBlock =
    paths.length > 0
      ? paths.map(p => `- ${p}`).join('\n')
      : '- (keine zusätzlichen Dateien angehängt)';

  return (
    'Bitte baue den vollständigen Export-Prompt für ein externes LLM (ChatGPT/Grok).\n\n' +
    '## Meine Anweisung\n' +
    trimmed +
    '\n\n' +
    '## Angehängte Quellen (Inhalte sind im Kontext mitgeliefert)\n' +
    sourcesBlock
  );
}

type SourceItem = { label: string; path: string };

const PROMPT_PACK_MODE_ID = 'prompt-pack';

interface PromptPackPanelProps {
  referencedFiles: string[];
  onAddFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  /** Full message plus file list for the API request. */
  onSubmit: (message: string, referencedFiles: string[]) => void;
  streaming: boolean;
  /** Hide top title/hint when the modal provides its own header. */
  embeddedInModal?: boolean;
}

export function PromptPackPanel({
  referencedFiles,
  onAddFile,
  onRemoveFile,
  onSubmit,
  streaming,
  embeddedInModal = false,
}: PromptPackPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [tokens, setTokens] = useState<number | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceWrapRef = useRef<HTMLDivElement>(null);
  const templateSelectRef = useRef<HTMLSelectElement>(null);

  const loadSources = useCallback(async () => {
    try {
      const summaries = await chapterApi.list();
      const details = await Promise.all(summaries.map(s => chapterApi.getStructure(s.id)));
      const items: SourceItem[] = [];
      for (const chapter of details) {
        const ct = chapter.meta.title || chapter.id;
        items.push({
          label: `Kapitel: ${ct}`,
          path: `.project/chapter/${chapter.id}.json`,
        });
        for (const scene of chapter.scenes) {
          const st = scene.meta.title || scene.id;
          items.push({
            label: `Szene: ${st} (${ct})`,
            path: `.project/chapter/${chapter.id}/${scene.id}.json`,
          });
        }
      }
      setSourceItems(items);
    } catch {
      setSourceItems([]);
    }
  }, []);

  useEffect(() => {
    if (sourceOpen && sourceItems.length === 0) loadSources();
  }, [sourceOpen, sourceItems.length, loadSources]);

  useEffect(() => {
    if (!sourceOpen) return;
    const close = (e: MouseEvent) => {
      if (sourceWrapRef.current && !sourceWrapRef.current.contains(e.target as Node)) {
        setSourceOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [sourceOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      chatApi
        .previewContext({
          message: '',
          mode: PROMPT_PACK_MODE_ID,
          referencedFiles,
          history: [],
        })
        .then(res => setTokens(res.estimatedTokens))
        .catch(() => setTokens(null));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [referencedFiles]);

  const tokenClass =
    tokens == null
      ? 'token-meter-neutral'
      : tokens < 8000
        ? 'token-meter-green'
        : tokens < 16000
          ? 'token-meter-yellow'
          : 'token-meter-red';

  const pct = tokens == null ? 0 : Math.min(100, (tokens / 32000) * 100);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const filePath = e.dataTransfer.getData('text/plain');
    if (filePath) onAddFile(filePath);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleGenerate = () => {
    const trimmed = instruction.trim();
    if (!trimmed || streaming) return;
    onSubmit(buildPromptPackUserMessage(trimmed, referencedFiles), referencedFiles);
  };

  return (
    <div
      className="prompt-pack-panel prompt-pack-dropzone"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {!embeddedInModal && (
        <>
          <div className="prompt-pack-panel-title">Prompt-Paket</div>
          <p className="prompt-pack-panel-hint">
            Dateien aus dem Projektbaum hierher ziehen oder über „Quelle“ Kapitel/Szenen-Meta anhängen.
          </p>
        </>
      )}

      <div className="prompt-pack-sources-section">
        <div className="prompt-pack-sources-header">
          <span className="prompt-pack-sources-label">Angehängte Quellen</span>
          <div className="prompt-pack-row prompt-pack-row-inline">
            <label className="prompt-pack-label prompt-pack-label-compact">
              Vorlage
              <select
                ref={templateSelectRef}
                className="prompt-pack-select"
                defaultValue=""
                onChange={e => {
                  const t = TEMPLATES.find(x => x.id === e.target.value);
                  if (t) setInstruction(t.instruction);
                  if (templateSelectRef.current) templateSelectRef.current.value = '';
                }}
              >
                <option value="" disabled>
                  Kurzvorlage…
                </option>
                {TEMPLATES.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="prompt-pack-source-wrap" ref={sourceWrapRef}>
              <button
                type="button"
                className="prompt-pack-source-btn"
                onClick={() => setSourceOpen(o => !o)}
                title="Kapitel- oder Szenen-Meta als Referenz hinzufügen"
              >
                <Plus size={14} />
                Quelle
                <ChevronDown size={14} className={sourceOpen ? 'prompt-pack-chevron-open' : ''} />
              </button>
              {sourceOpen && (
                <div className="prompt-pack-source-dropdown">
                  {sourceItems.length === 0 ? (
                    <div className="prompt-pack-source-empty">Lade…</div>
                  ) : (
                    sourceItems.map(item => (
                      <button
                        key={item.path}
                        type="button"
                        className="prompt-pack-source-item"
                        onClick={() => {
                          onAddFile(item.path);
                          setSourceOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {referencedFiles.length > 0 ? (
          <div className="prompt-pack-chips">
            {referencedFiles.map(f => (
              <FileChip key={f} path={f} onRemove={onRemoveFile} />
            ))}
          </div>
        ) : (
          <div className="prompt-pack-chips-empty">Noch keine Dateien angehängt.</div>
        )}
      </div>

      <label className="prompt-pack-instruction-label">
        Anweisung
        <textarea
          className="prompt-pack-instruction"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="z. B. Ich möchte an Szene X in Kapitel Y arbeiten und …"
          disabled={streaming}
          rows={6}
        />
      </label>

      <div className="prompt-pack-token-meter">
        <div className="prompt-pack-token-label">
          Geschätztes Kontext-Budget
          {tokens != null && (
            <span className="prompt-pack-token-value"> ~{tokens.toLocaleString()} Tokens</span>
          )}
        </div>
        <div className="token-meter-track">
          <div className={`token-meter-bar ${tokenClass}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="prompt-pack-token-hint">Grün &lt;8k · Gelb &lt;16k · Rot ≥16k (Richtwert)</div>
      </div>

      <button
        type="button"
        className="prompt-pack-generate-btn"
        onClick={handleGenerate}
        disabled={!instruction.trim() || streaming}
      >
        <Wand2 size={16} />
        Prompt generieren
      </button>
    </div>
  );
}

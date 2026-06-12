import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import type { FieldRendererProps } from "../metaSchema.ts";
import { arcApi } from "../../api.ts";

/**
 * Reference field linking a structure node (scene/chapter) to the arc workspace:
 * the implementation (book) points at the declaration (arc plan), never the
 * reverse. A scene can name the arc points it realizes and/or whole arcs it
 * belongs to. Stored as @[Titel](arcpoint:ID) / @[Titel](arc:ID) mentions,
 * mirroring the wikilist format so it round-trips through NodeMeta.extras.
 */

interface ArcRefOption {
  kind: "arc" | "arcpoint";
  id: string;
  label: string;
  /** Dropdown group header — arc title for points, "Bögen" for arcs. */
  group: string;
}

const KIND_TAG: Record<"arc" | "arcpoint", string> = {
  arc: "Bogen",
  arcpoint: "Punkt",
};

function parseMentions(value: string): Array<{ name: string; ref: string }> {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const items: Array<{ name: string; ref: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    items.push({ name: m[1].trim(), ref: m[2].trim() });
  }
  return items;
}

function serialiseMentions(items: Array<{ name: string; ref: string }>): string {
  return items.map((i) => `@[${i.name}](${i.ref})`).join(" ");
}

function refKind(ref: string): "arc" | "arcpoint" {
  return ref.startsWith("arc:") ? "arc" : "arcpoint";
}

export function arcRefRenderer({ field, value, onChange, onCommit }: FieldRendererProps) {
  const items = parseMentions(value);

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [options, setOptions] = useState<ArcRefOption[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [filteredOptions, setFilteredOptions] = useState<ArcRefOption[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [dropdownTop, setDropdownTop] = useState(0);

  const loadOptions = useCallback(async () => {
    try {
      const data = await arcApi.read();
      const arcTitle = new Map(data.arcs.map((a) => [a.id, a.title]));
      const opts: ArcRefOption[] = [
        ...data.arcs.map((a) => ({
          kind: "arc" as const,
          id: a.id,
          label: a.title,
          group: "Bögen",
        })),
        ...data.points.map((p) => ({
          kind: "arcpoint" as const,
          id: p.id,
          label: p.title,
          group: arcTitle.get(p.arcId) ?? "Punkte",
        })),
      ];
      setOptions(opts);
    } catch {
      setOptions([]);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const closeMention = useCallback(() => {
    setMentionQuery(null);
    setFilteredOptions([]);
    setActiveIdx(0);
  }, []);

  const filterOptions = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      const hits = options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q),
      );
      setFilteredOptions(hits.slice(0, 12));
      setActiveIdx(0);
    },
    [options],
  );

  useEffect(() => {
    if (mentionQuery !== null) filterOptions(mentionQuery);
  }, [mentionQuery, filterOptions]);

  const removeItem = (idx: number) => {
    onChange(serialiseMentions(items.filter((_, i) => i !== idx)));
  };

  const insertMention = useCallback(
    (option: ArcRefOption) => {
      const ref = `${option.kind}:${option.id}`;
      const already = items.some((i) => i.ref === ref);
      if (!already) {
        onChange(serialiseMentions([...items, { name: option.label, ref }]));
      }
      setInputVal("");
      closeMention();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [items, onChange, closeMention],
  );

  const calcDropdownTop = useCallback(() => {
    const inp = inputRef.current;
    const wrap = wrapRef.current;
    if (!inp || !wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const inpRect = inp.getBoundingClientRect();
    setDropdownTop(inpRect.bottom - wrapRect.top + 4);
  }, []);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputVal(val);

      const cursor = e.target.selectionStart ?? 0;
      const textBefore = val.slice(0, cursor);
      const atIdx = textBefore.lastIndexOf("@");

      if (atIdx === -1 || /[\s\n]/.test(textBefore.slice(atIdx + 1))) {
        closeMention();
        return;
      }

      const fragment = textBefore.slice(atIdx + 1);
      setMentionQuery(fragment);
      calcDropdownTop();
      filterOptions(fragment);
    },
    [closeMention, calcDropdownTop, filterOptions],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mentionQuery !== null) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filteredOptions.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
        if ((e.key === "Enter" || e.key === "Tab") && filteredOptions.length > 0) {
          e.preventDefault();
          insertMention(filteredOptions[activeIdx]);
          return;
        }
        if (e.key === "Escape") { e.preventDefault(); closeMention(); return; }
      }
      if (e.key === "Enter") { e.preventDefault(); onCommit?.(); }
    },
    [mentionQuery, filteredOptions, activeIdx, insertMention, closeMention, onCommit],
  );

  useEffect(() => {
    if (mentionQuery === null) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) closeMention();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mentionQuery, closeMention]);

  // Group filtered options for the dropdown.
  const grouped = filteredOptions.reduce<Record<string, ArcRefOption[]>>((acc, o) => {
    (acc[o.group] ??= []).push(o);
    return acc;
  }, {});
  let flatIdx = 0;

  return (
    <div ref={wrapRef} className="wikilist-wrap">
      {items.length > 0 && (
        <div className="wikilist-items">
          {items.map((item, i) => (
            <div key={item.ref || i} className="wikilist-item">
              <span className="wikilist-item-name">{item.name}</span>
              <span className="wikilist-item-path">{KIND_TAG[refKind(item.ref)]}</span>
              <button
                type="button"
                className="wikilist-item-remove"
                onClick={() => removeItem(i)}
                title="Entfernen"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="wikilist-add-row">
        <input
          ref={inputRef}
          className="wikilist-add-input"
          value={inputVal}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={() => { setTimeout(closeMention, 150); }}
          placeholder={
            items.length === 0
              ? (field.placeholder ?? "@ für Punkt oder Bogen…")
              : "@ weiteren hinzufügen…"
          }
        />
      </div>

      {mentionQuery !== null && filteredOptions.length > 0 && (
        <div
          className="wiki-mention-dropdown"
          style={{ top: dropdownTop, left: 0 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {Object.entries(grouped).map(([group, opts]) => (
            <div key={group}>
              <div className="wiki-mention-group">{group}</div>
              {opts.map((option) => {
                const idx = flatIdx++;
                return (
                  <div
                    key={`${option.kind}:${option.id}`}
                    className={`wiki-mention-item${idx === activeIdx ? " active" : ""}`}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onMouseDown={() => insertMention(option)}
                  >
                    {option.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {mentionQuery !== null && filteredOptions.length === 0 && (
        <div className="wiki-mention-dropdown" style={{ top: dropdownTop, left: 0 }}>
          <div className="wiki-mention-group">Keine Treffer</div>
        </div>
      )}
    </div>
  );
}

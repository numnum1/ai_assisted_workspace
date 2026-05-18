import { useState, useRef, useEffect, useContext, useMemo } from "react";
import { Wrench } from "lucide-react";
import type { ChatViewModel } from "../../chat-view-model";
import ChatContext from "../../chat-context";
import { toolList } from "../../../toolkit/Tools";
import { ToolkitEntry } from "./ToolkitEntry";

export function ToolkitMenu() {
  const {
    streaming,
    settings: { enabledToolIds },
  } = useContext<ChatViewModel>(ChatContext);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const wrenchClass = useMemo(() => {
    const n = toolList.length - enabledToolIds.length;
    const total = toolList.length;
    let wrenchClassTmp = "chat-tools-toggle-btn";
    if (n === total) wrenchClassTmp += " chat-tools-toggle-btn--off";
    else if (n > 0) wrenchClassTmp += " chat-tools-toggle-btn--partial";
    else wrenchClassTmp += " active";
    return wrenchClassTmp;
  }, [enabledToolIds]);

  const title = useMemo(() => {
    const n = toolList.length - enabledToolIds.length;
    const total = toolList.length;
    const titleTmp =
      n === 0
        ? "Toolkits — alle aktiv (klicken für Einstellungen)"
        : n === total
          ? "Toolkits — alle aus (klicken für Einstellungen)"
          : `Toolkits — ${total - n} von ${total} aktiv (klicken für Einstellungen)`;
    return titleTmp;
  }, [enabledToolIds]);

  return (
    <div ref={wrapRef} className="chat-toolkit-wrap">
      <button
        type="button"
        className={wrenchClass}
        onClick={() => setOpen((o) => !o)}
        title={title}
        disabled={streaming}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Wrench size={15} />
      </button>
      {open && (
        <div
          className="chat-toolkit-popover"
          role="menu"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="chat-toolkit-popover-title">KI-Toolkits</div>
          {toolList.map((tool) => {
            return (
              <div key={tool.id} className="chat-toolkit-row" role="none">
                <ToolkitEntry {...tool} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

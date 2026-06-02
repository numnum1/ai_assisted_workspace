import { useState, useEffect, useRef } from "react";
import { ChatThreadsRail } from "./chat/ChatThreadsRail.tsx";
import { NaviStatePanel } from "./chat/NaviStatePanel.tsx";
import type { Conversation } from "../types.ts";

type SlotTool = "threads" | "navi-state" | "plans";

const TOOL_LABELS: Record<SlotTool, string> = {
  threads: "Threads",
  "navi-state": "Navi State",
  plans: "Plans",
};

const ALL_TOOLS: SlotTool[] = ["threads", "navi-state", "plans"];

export interface PanelSlotProps {
  storageKey: string;
  defaultTool?: SlotTool;
  conversations: Conversation[];
  activeConversationId: string;
  onSwitchChat: (id: string) => void;
  naviStateId?: string | null;
  naviResults?: Record<string, string>;
  naviPlan?: string | null;
  naviCoveredTips?: string[];
}

function loadSlotTool(key: string, defaultTool: SlotTool): SlotTool {
  try {
    const v = localStorage.getItem(key);
    if (v && (ALL_TOOLS as string[]).includes(v)) return v as SlotTool;
  } catch {
    /* ignore */
  }
  return defaultTool;
}

export function PanelSlot({
  storageKey,
  defaultTool = "threads",
  conversations,
  activeConversationId,
  onSwitchChat,
  naviStateId,
  naviResults,
  naviPlan,
  naviCoveredTips,
}: PanelSlotProps) {
  const [selectedTool, setSelectedTool] = useState<SlotTool>(() =>
    loadSlotTool(storageKey, defaultTool),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  function selectTool(tool: SlotTool) {
    setSelectedTool(tool);
    try {
      localStorage.setItem(storageKey, tool);
    } catch {
      /* ignore */
    }
    setMenuOpen(false);
  }

  return (
    <div className="panel-slot">
      <div className="panel-slot-header" ref={menuRef}>
        <button
          type="button"
          className="panel-slot-picker"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
        >
          {TOOL_LABELS[selectedTool]}
          <span className="panel-slot-chevron" aria-hidden>▾</span>
        </button>
        {menuOpen && (
          <div className="panel-slot-menu" role="listbox">
            {ALL_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                role="option"
                aria-selected={tool === selectedTool}
                className={`panel-slot-menu-item${tool === selectedTool ? " active" : ""}`}
                onClick={() => selectTool(tool)}
              >
                {TOOL_LABELS[tool]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="panel-slot-content">
        {selectedTool === "threads" && (
          <ChatThreadsRail
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSwitchChat={onSwitchChat}
          />
        )}
        {selectedTool === "navi-state" && naviStateId && (
          <NaviStatePanel
            naviStateId={naviStateId}
            naviResults={naviResults}
            naviPlan={naviPlan}
            naviCoveredTips={naviCoveredTips}
          />
        )}
        {selectedTool === "plans" && (
          <div className="panel-slot-placeholder">Plans (coming soon)</div>
        )}
      </div>
    </div>
  );
}

import { useRef } from 'react';
import { X } from 'lucide-react';
import type { FileTab } from '../../hooks/useFileTabs.ts';

interface EditorTabsProps {
  tabs: FileTab[];
  activeTabPath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function EditorTabs({ tabs, activeTabPath, onSelectTab, onCloseTab }: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="editor-tabs" ref={scrollRef} onWheel={handleWheel}>
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`editor-tab ${tab.path === activeTabPath ? 'editor-tab--active' : ''}`}
          title={tab.path}
          onClick={() => onSelectTab(tab.path)}
        >
          <span className="editor-tab-name">
            {fileName(tab.path)}
            {tab.dirty && <span className="editor-tab-dirty" title="Ungespeichert">●</span>}
          </span>
          <button
            className="editor-tab-close"
            title="Schließen"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.path);
            }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

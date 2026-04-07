import { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { FileTab } from '../../hooks/useFileTabs.ts';

interface EditorTabsProps {
  tabs: FileTab[];
  activeTabPath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (keepPath: string) => void;
}

function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export function EditorTabs({
  tabs,
  activeTabPath,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
}: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

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
          onContextMenu={(e) => {
            if (tabs.length <= 1) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, path: tab.path });
          }}
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
      {menu && (
        <div
          className="file-tree-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(ev) => ev.stopPropagation()}
          onMouseDown={(ev) => ev.stopPropagation()}
        >
          <button
            type="button"
            className="file-tree-context-item"
            onClick={() => {
              onCloseOtherTabs(menu.path);
              setMenu(null);
            }}
          >
            Andere Tabs schließen
          </button>
        </div>
      )}
    </div>
  );
}

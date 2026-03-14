import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, ChevronRight, ChevronDown, FileText, Trash2 } from 'lucide-react';
import type { PlanningNode } from '../types.ts';
import { planningApi } from '../api.ts';

interface PlanningPanelProps {
  activeFile: string | null;
  onOpenMetafile: (path: string) => void;
  onCreateMetafile: (parentFolder: string, suggestedType?: string) => void;
  onDeleteMetafile?: (path: string, hasChildren: boolean) => void | Promise<void>;
  refreshTrigger?: number;
}

const TYPE_ICON: Record<string, string> = {
  book:    '📚',
  chapter: '📖',
  scene:   '🎬',
  action:  '⚡',
  arc:     '🌊',
};

const TYPE_ORDER: Record<string, number> = {
  book: 0, chapter: 1, scene: 2, action: 3, arc: 4,
};

// Fixed hierarchy: what type a child should be for each parent type
const CHILD_TYPE: Record<string, string> = {
  book:    'chapter',
  chapter: 'scene',
  scene:   'action',
};

function typeIcon(type: string | null): string {
  return type ? (TYPE_ICON[type.toLowerCase()] ?? '📄') : '📄';
}

function displayTitle(node: PlanningNode): string {
  if (node.title && node.title.trim() !== '' && node.title !== '""') return node.title;
  const filename = node.path.split('/').pop() ?? node.path;
  return filename.replace(/\.md$/, '');
}

function PlanningNodeRow({
  node,
  depth,
  activeFile,
  onOpenMetafile,
  onCreateChild,
  onDeleteMetafile,
}: {
  node: PlanningNode;
  depth: number;
  activeFile: string | null;
  onOpenMetafile: (path: string) => void;
  onCreateChild: (parentFolder: string, suggestedType?: string) => void;
  onDeleteMetafile?: (path: string, hasChildren: boolean) => Promise<void>;
}) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const isActive = activeFile === node.path;

  const folderPath = node.path.replace(/\.md$/, '');
  const nodeType = node.type?.toLowerCase() ?? '';
  const childType = CHILD_TYPE[nodeType];
  const canHaveChildren = nodeType !== 'action';

  return (
    <div className="pp-node">
      <div
        className={`pp-row${isActive ? ' pp-row-active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onOpenMetafile(node.path)}
        title={node.path}
      >
        <span
          className="pp-chevron"
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        >
          {hasChildren
            ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)
            : <span style={{ width: 11, display: 'inline-block' }} />}
        </span>
        <span className="pp-type-icon">{typeIcon(node.type)}</span>
        <span className="pp-title">{displayTitle(node)}</span>
        {node.status && (
          <span className={`pp-status pp-status-${node.status}`}>{node.status}</span>
        )}
        {canHaveChildren && (
          <button
            className="pp-add-btn"
            title={childType ? `${childType} hinzufügen` : 'Untergeordnetes Metafile erstellen'}
            onClick={(e) => { e.stopPropagation(); onCreateChild(folderPath, childType); }}
          >
            <Plus size={10} />
          </button>
        )}
        {onDeleteMetafile && (
          <button
            className="pp-delete-btn"
            title="Löschen"
            onClick={(e) => { e.stopPropagation(); onDeleteMetafile(node.path, hasChildren); }}
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
      {expanded && hasChildren && (
        <div className="pp-children">
          {node.children
            .slice()
            .sort((a, b) => {
              const ao = TYPE_ORDER[a.type?.toLowerCase() ?? ''] ?? 99;
              const bo = TYPE_ORDER[b.type?.toLowerCase() ?? ''] ?? 99;
              return ao !== bo ? ao - bo : displayTitle(a).localeCompare(displayTitle(b));
            })
            .map(child => (
              <PlanningNodeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onOpenMetafile={onOpenMetafile}
                onCreateChild={onCreateChild}
                onDeleteMetafile={onDeleteMetafile}
              />
            ))}

        </div>
      )}
    </div>
  );
}

export function PlanningPanel({ activeFile, onOpenMetafile, onCreateMetafile, onDeleteMetafile, refreshTrigger }: PlanningPanelProps) {
  const [nodes, setNodes] = useState<PlanningNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    planningApi.getOutline()
      .then(setNodes)
      .catch(err => setError(err.message ?? 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const sorted = nodes.slice().sort((a, b) => {
    const ao = TYPE_ORDER[a.type?.toLowerCase() ?? ''] ?? 99;
    const bo = TYPE_ORDER[b.type?.toLowerCase() ?? ''] ?? 99;
    return ao !== bo ? ao - bo : displayTitle(a).localeCompare(displayTitle(b));
  });

  return (
    <div className="pp-panel">
      <div className="pp-header">
        <span className="pp-header-title">Planung</span>
        <div className="pp-header-actions">
          <button className="pp-icon-btn" onClick={() => onCreateMetafile('.planning')} title="Neues Metafile">
            <Plus size={13} />
          </button>
          <button className="pp-icon-btn" onClick={load} title="Aktualisieren">
            <RefreshCw size={12} className={loading ? 'pp-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="pp-content">
        {error && (
          <div className="pp-error">{error}</div>
        )}
        {!error && sorted.length === 0 && !loading && (
          <div className="pp-empty">
            <FileText size={28} />
            <span>Noch keine Planung vorhanden.</span>
            <button className="pp-empty-btn" onClick={() => onCreateMetafile('.planning')}>
              <Plus size={12} /> Erstes Metafile erstellen
            </button>
          </div>
        )}
        {sorted.map(node => (
          <PlanningNodeRow
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onOpenMetafile={onOpenMetafile}
            onCreateChild={onCreateMetafile}
            onDeleteMetafile={onDeleteMetafile}
          />
        ))}
      </div>
    </div>
  );
}

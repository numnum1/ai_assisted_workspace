import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Plus, ChevronRight, ChevronDown, FileText, Trash2 } from 'lucide-react';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { PlanningNode } from '../types.ts';
import { planningApi, filesApi } from '../api.ts';

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

// Fixed hierarchy: what type a child should be for each parent type
const CHILD_TYPE: Record<string, string> = {
  book:    'chapter',
  chapter: 'scene',
  scene:   'action',
};

function typeIcon(type: string | null): string {
  return type ? (TYPE_ICON[type.toLowerCase()] ?? '📄') : '📄';
}

export function displayTitle(node: PlanningNode): string {
  if (node.title && node.title.trim() !== '' && node.title !== '""') return node.title;
  const filename = node.path.split('/').pop() ?? node.path;
  return filename.replace(/\.md$/, '');
}

// ── child_order helpers (frontend mirror of backend logic) ────────────────────

function parseChildOrder(content: string): string[] {
  try {
    const fm = parseFm(content);
    const co = fm?.child_order;
    if (Array.isArray(co)) return co.map(String);
  } catch { /* ignore */ }
  return [];
}

function parseFm(content: string): Record<string, unknown> | null {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const fmStr = content.slice(4, end);
  try { return (parseYaml(fmStr) ?? {}) as Record<string, unknown>; } catch { return null; }
}

function serializeWithChildOrder(content: string, order: string[]): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  const fmStr = content.slice(4, end);
  const body = content.slice(end + 4);
  let fm: Record<string, unknown> = {};
  try { fm = (parseYaml(fmStr) ?? {}) as Record<string, unknown>; } catch { /* keep empty */ }
  fm['child_order'] = order;
  return `---\n${stringifyYaml(fm, { lineWidth: 0 }).trimEnd()}\n---${body}`;
}

// ── Drag state (module-level ref to avoid re-renders) ─────────────────────────

interface DragState {
  path: string;          // dragged node path
  parentPath: string;    // parent dir of dragged node
  fileName: string;      // just the .md filename
}

// ── PlanningNodeRow ───────────────────────────────────────────────────────────

function PlanningNodeRow({
  node,
  depth,
  activeFile,
  onOpenMetafile,
  onCreateChild,
  onDeleteMetafile,
  dragState,
  onDragStart,
  onReorder,
  onMove,
}: {
  node: PlanningNode;
  depth: number;
  activeFile: string | null;
  onOpenMetafile: (path: string) => void;
  onCreateChild: (parentFolder: string, suggestedType?: string) => void;
  onDeleteMetafile?: (path: string, hasChildren: boolean) => Promise<void>;
  dragState: React.MutableRefObject<DragState | null>;
  onDragStart: (node: PlanningNode) => void;
  onReorder: (parentPath: string, newOrder: string[]) => void;
  onMove: (fromPath: string, toParentPath: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = useState(true);
  const isActive = activeFile === node.path;

  const folderPath = node.path.replace(/\.md$/, '');
  const nodeType = node.type?.toLowerCase() ?? '';
  const childType = CHILD_TYPE[nodeType];
  const canHaveChildren = nodeType !== 'action';

  // Drop indicator index: -1 = none, 0..n = before child at that index, n = after last
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const getParentPathOfNode = (n: PlanningNode) => {
    const parts = n.path.split('/');
    parts.pop();
    return parts.join('/');
  };

  const isSameParent = () => {
    if (!dragState.current) return false;
    return dragState.current.parentPath === folderPath;
  };

  const isDifferentParent = () => {
    if (!dragState.current) return false;
    return dragState.current.parentPath !== folderPath;
  };

  const handleChildDragOver = (e: React.DragEvent, index: number) => {
    if (!dragState.current) return;
    // Only allow drop if dragging a compatible child type
    if (!canHaveChildren) return;
    e.preventDefault();
    e.stopPropagation();
    setDropIndex(index);
  };

  const handleChildDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const ds = dragState.current;
    if (!ds || !canHaveChildren) { setDropIndex(null); return; }

    const fileName = ds.fileName;

    if (isSameParent()) {
      // Reorder within this parent
      const currentOrder = node.children.map(c => c.path.split('/').pop()!);
      const fromIdx = currentOrder.indexOf(fileName);
      if (fromIdx === -1) { setDropIndex(null); return; }
      const newOrder = [...currentOrder];
      newOrder.splice(fromIdx, 1);
      const insertAt = index > fromIdx ? index - 1 : index;
      newOrder.splice(insertAt, 0, fileName);
      onReorder(folderPath, newOrder);
    } else if (isDifferentParent()) {
      // Move to this parent
      onMove(ds.path, folderPath);
    }
    setDropIndex(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the container entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropIndex(null);
    }
  };

  return (
    <div className="pp-node">
      {/* Row itself */}
      <div
        className={`pp-row${isActive ? ' pp-row-active' : ''}${dragState.current?.path === node.path ? ' pp-row-dragging' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        draggable
        onDragStart={e => { e.stopPropagation(); onDragStart(node); }}
        onDragEnd={() => { dragState.current = null; }}
        onClick={() => onOpenMetafile(node.path)}
        title={node.path}
      >
        <span
          className="pp-drag-handle"
          title="Verschieben"
        >⠿</span>
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
        {['chapter', 'scene', 'action'].includes(nodeType) && (
          <span className={`pp-status pp-status-${node.status || 'draft'}`}>{node.status || 'draft'}</span>
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

      {/* Children list with drop zones */}
      {expanded && hasChildren && (
        <div
          className="pp-children"
          onDragLeave={handleDragLeave}
        >
          {node.children.map((child, i) => (
            <div key={child.path}>
              {/* Drop zone BEFORE this child */}
              <div
                className={`pp-drop-zone${dropIndex === i ? ' pp-drop-zone-active' : ''}`}
                onDragOver={e => handleChildDragOver(e, i)}
                onDrop={e => handleChildDrop(e, i)}
              />
              <PlanningNodeRow
                node={child}
                depth={depth + 1}
                activeFile={activeFile}
                onOpenMetafile={onOpenMetafile}
                onCreateChild={onCreateChild}
                onDeleteMetafile={onDeleteMetafile}
                dragState={dragState}
                onDragStart={onDragStart}
                onReorder={onReorder}
                onMove={onMove}
              />
            </div>
          ))}
          {/* Drop zone AFTER last child */}
          <div
            className={`pp-drop-zone${dropIndex === node.children.length ? ' pp-drop-zone-active' : ''}`}
            onDragOver={e => handleChildDragOver(e, node.children.length)}
            onDrop={e => handleChildDrop(e, node.children.length)}
          />
        </div>
      )}

      {/* Empty children drop zone when collapsed or no children (for cross-parent moves) */}
      {canHaveChildren && (!hasChildren || !expanded) && (
        <div
          className={`pp-drop-zone pp-drop-zone-empty${dropIndex === 0 ? ' pp-drop-zone-active' : ''}`}
          style={{ paddingLeft: `${8 + (depth + 1) * 14}px` }}
          onDragOver={e => { if (dragState.current) { e.preventDefault(); e.stopPropagation(); setDropIndex(0); } }}
          onDrop={e => handleChildDrop(e, 0)}
          onDragLeave={() => setDropIndex(null)}
        />
      )}
    </div>
  );
}

// ── PlanningPanel ─────────────────────────────────────────────────────────────

export function PlanningPanel({ activeFile, onOpenMetafile, onCreateMetafile, onDeleteMetafile, refreshTrigger }: PlanningPanelProps) {
  const [nodes, setNodes] = useState<PlanningNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragState = useRef<DragState | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    planningApi.getOutline()
      .then(setNodes)
      .catch(err => setError(err.message ?? 'Fehler beim Laden'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const handleDragStart = useCallback((node: PlanningNode) => {
    const parts = node.path.split('/');
    const fileName = parts.pop() ?? '';
    dragState.current = {
      path: node.path,
      parentPath: parts.join('/'),
      fileName,
    };
  }, []);

  /**
   * Reorder within the same parent: update the parent metafile's child_order
   * and apply optimistic re-render.
   */
  const handleReorder = useCallback(async (parentPath: string, newOrder: string[]) => {
    // Optimistic update
    setNodes(prev => applyOrderToTree(prev, parentPath, newOrder));

    // Persist: read parent .md, update child_order, save
    const parentMdPath = parentPath + '.md';
    try {
      const data = await filesApi.getContent(parentMdPath);
      const updated = serializeWithChildOrder(data.content, newOrder);
      await filesApi.saveContent(parentMdPath, updated);
    } catch (err) {
      console.error('Failed to save child_order:', err);
      load(); // reload on failure
    }
  }, [load]);

  /**
   * Move a node to a different parent via the backend API, then reload.
   */
  const handleMove = useCallback(async (fromPath: string, toParentPath: string) => {
    try {
      await planningApi.move(fromPath, toParentPath);
      load();
    } catch (err) {
      console.error('Move failed:', err);
      alert(err instanceof Error ? err.message : 'Verschieben fehlgeschlagen.');
    }
  }, [load]);

  // Root-level drop zone (for top-level nodes only)
  const [rootDropActive, setRootDropActive] = useState(false);

  const handleRootDragOver = (e: React.DragEvent) => {
    if (!dragState.current) return;
    e.preventDefault();
    setRootDropActive(true);
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setRootDropActive(false);
    const ds = dragState.current;
    if (!ds) return;
    const isAlreadyRoot = ds.parentPath === '.planning';
    if (!isAlreadyRoot) {
      await handleMove(ds.path, '.planning');
    }
  };

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

      <div
        className={`pp-content${rootDropActive ? ' pp-drop-active' : ''}`}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
        onDragLeave={() => setRootDropActive(false)}
      >
        {error && (
          <div className="pp-error">{error}</div>
        )}
        {!error && nodes.length === 0 && !loading && (
          <div className="pp-empty">
            <FileText size={28} />
            <span>Noch keine Planung vorhanden.</span>
            <button className="pp-empty-btn" onClick={() => onCreateMetafile('.planning')}>
              <Plus size={12} /> Erstes Metafile erstellen
            </button>
          </div>
        )}
        {nodes.map(node => (
          <PlanningNodeRow
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            onOpenMetafile={onOpenMetafile}
            onCreateChild={onCreateMetafile}
            onDeleteMetafile={onDeleteMetafile}
            dragState={dragState}
            onDragStart={handleDragStart}
            onReorder={handleReorder}
            onMove={handleMove}
          />
        ))}
      </div>
    </div>
  );
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

/**
 * Applies a new child order to the node whose folder path equals parentPath.
 * Returns a new node array with the children reordered.
 */
function applyOrderToTree(nodes: PlanningNode[], parentPath: string, newOrder: string[]): PlanningNode[] {
  return nodes.map(node => {
    const nodeFolderPath = node.path.replace(/\.md$/, '');
    if (nodeFolderPath === parentPath) {
      const reordered = [...node.children].sort((a, b) => {
        const aName = a.path.split('/').pop() ?? '';
        const bName = b.path.split('/').pop() ?? '';
        const ai = newOrder.indexOf(aName);
        const bi = newOrder.indexOf(bName);
        if (ai === -1 && bi === -1) return aName.localeCompare(bName);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return { ...node, children: reordered };
    }
    if (node.children.length > 0) {
      return { ...node, children: applyOrderToTree(node.children, parentPath, newOrder) };
    }
    return node;
  });
}

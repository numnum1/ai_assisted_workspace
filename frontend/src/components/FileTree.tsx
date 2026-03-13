import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import type { FileNode } from '../types.ts';
import type { Bookmark } from './bookmarkExtension';

interface FileTreeProps {
  tree: FileNode | null;
  activeFile: string | null;
  bookmark: Bookmark | null;
  onFileClick: (path: string) => void;
  onFileDragStart: (path: string) => void;
  onJumpToBookmark?: () => void;
  changedPaths?: Set<string>;
  onFileContextMenu?: (path: string, x: number, y: number, isDirectory: boolean) => void;
  hasPlanning?: boolean;
  onOpenMetafile?: (path: string) => void;
}

export function FileTree({ tree, activeFile, bookmark, onFileClick, onFileDragStart, onJumpToBookmark, changedPaths, onFileContextMenu, hasPlanning, onOpenMetafile }: FileTreeProps) {
  if (!tree) {
    return <div className="file-tree-empty">Shift + Ctrl + A to open a project...</div>;
  }

  return (
    <div className="file-tree">
      <div
        className="file-tree-header"
        onContextMenu={(e) => {
          e.preventDefault();
          onFileContextMenu?.(tree.path, e.clientX, e.clientY, true);
        }}
      >
        <Folder size={14} />
        <span>{tree.name}</span>
        {bookmark && onJumpToBookmark && (
          <button
            type="button"
            className="file-tree-bookmark-link"
            onClick={(e) => { e.stopPropagation(); onJumpToBookmark(); }}
            title={`Zum Lesezeichen springen (${bookmark.filePath}:${bookmark.line})`}
          >
            Zum Lesezeichen springen
          </button>
        )}
      </div>
      <div className="file-tree-content">
        {tree.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={0}
            activeFile={activeFile}
            onFileClick={onFileClick}
            onFileDragStart={onFileDragStart}
            changedPaths={changedPaths}
            onFileContextMenu={onFileContextMenu}
            hasPlanning={hasPlanning}
            onOpenMetafile={onOpenMetafile}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  onFileClick: (path: string) => void;
  onFileDragStart: (path: string) => void;
  changedPaths?: Set<string>;
  onFileContextMenu?: (path: string, x: number, y: number, isDirectory: boolean) => void;
  hasPlanning?: boolean;
  onOpenMetafile?: (path: string) => void;
}

function TreeNode({ node, depth, activeFile, onFileClick, onFileDragStart, changedPaths, onFileContextMenu, hasPlanning, onOpenMetafile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const isActive = node.path === activeFile;

  const handleClick = () => {
    if (node.directory) {
      setExpanded(!expanded);
    } else {
      onFileClick(node.path);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    const dragPath = node.directory ? node.path + '/' : node.path;
    e.dataTransfer.setData('text/plain', dragPath);
    e.dataTransfer.effectAllowed = 'copy';
    onFileDragStart(dragPath);
  };

  return (
    <div>
      <div
        className={`tree-node ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        draggable
        onDragStart={handleDragStart}
        title={node.path}
        onContextMenu={(e) => {
          e.preventDefault();
          onFileContextMenu?.(node.path, e.clientX, e.clientY, node.directory);
        }}
      >
        <span className="tree-node-icon">
          {node.directory ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span style={{ width: 14 }} />
          )}
        </span>
        <span className="tree-node-type-icon">
          {node.directory ? (
            expanded ? <FolderOpen size={14} /> : <Folder size={14} />
          ) : (
            <FileText size={14} />
          )}
        </span>
        <span className="tree-node-name">{node.name}</span>
        {!node.directory && changedPaths?.has(node.path) && (
          <span className="tree-node-git-dot" />
        )}
      </div>
      {node.directory && expanded && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          activeFile={activeFile}
          onFileClick={onFileClick}
          onFileDragStart={onFileDragStart}
          changedPaths={changedPaths}
          onFileContextMenu={onFileContextMenu}
          hasPlanning={hasPlanning}
          onOpenMetafile={onOpenMetafile}
        />
      ))}
    </div>
  );
}

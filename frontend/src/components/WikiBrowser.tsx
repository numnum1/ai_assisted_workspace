import { useEffect, useState, useCallback } from 'react';
import { X, Folder, FileText, ChevronRight } from 'lucide-react';
import type { WikiState } from '../hooks/useWiki.ts';
import type { WikiEntry, WikiType } from '../types.ts';

interface WikiBrowserProps {
  wiki: WikiState;
  onClose: () => void;
}

type ContextMenuTarget =
  | { kind: 'root-empty'; x: number; y: number }
  | { kind: 'folder'; x: number; y: number; typeId: string }
  | { kind: 'type-empty'; x: number; y: number }
  | { kind: 'entry'; x: number; y: number; typeId: string; entryId: string };

export function WikiBrowser({ wiki, onClose }: WikiBrowserProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);

  useEffect(() => {
    wiki.loadTypes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu]);

  const handleCreateType = useCallback(async () => {
    setContextMenu(null);
    const name = window.prompt('Name des neuen Wiki-Typs:');
    if (!name?.trim()) return;
    await wiki.createType(name.trim());
  }, [wiki]);

  const handleDeleteType = useCallback(async (typeId: string) => {
    setContextMenu(null);
    const type = wiki.types.find(t => t.id === typeId);
    if (!window.confirm(`Typ "${type?.name}" und alle Einträge löschen?`)) return;
    await wiki.deleteType(typeId);
  }, [wiki]);

  const handleCreateEntry = useCallback(async () => {
    setContextMenu(null);
    if (!wiki.currentType) return;
    const name = window.prompt(`Name des neuen ${wiki.currentType.name}:`);
    if (!name?.trim()) return;
    await wiki.createEntry(name.trim());
  }, [wiki]);

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    setContextMenu(null);
    if (!window.confirm('Eintrag löschen?')) return;
    await wiki.deleteEntry(entryId);
  }, [wiki]);

  const entryDisplayName = (entry: WikiEntry) =>
    entry.values['name'] || entry.values['title'] || entry.id;

  return (
    <div className="wiki-browser-overlay">
      <div
        className="wiki-browser-panel"
      >
        {/* Header */}
        <div className="wiki-browser-header">
          <div className="wiki-browser-breadcrumb">
            <span
              className={`wiki-browser-breadcrumb-item${wiki.currentType ? ' clickable' : ' active'}`}
              onClick={wiki.currentType ? wiki.goBack : undefined}
            >
              Wiki
            </span>
            {wiki.currentType && (
              <>
                <ChevronRight size={13} className="wiki-browser-breadcrumb-sep" />
                <span className="wiki-browser-breadcrumb-item active">
                  {wiki.currentType.name}
                </span>
              </>
            )}
          </div>
          <button className="wiki-browser-close" onClick={onClose} title="Schließen">
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div
          className="wiki-browser-content"
          onContextMenu={e => {
            const isItem = (e.target as HTMLElement).closest('.wiki-browser-item');
            if (!isItem) {
              e.preventDefault();
              if (wiki.currentType) {
                setContextMenu({ kind: 'type-empty', x: e.clientX, y: e.clientY });
              } else {
                setContextMenu({ kind: 'root-empty', x: e.clientX, y: e.clientY });
              }
            }
          }}
        >
          {!wiki.currentType ? (
            /* Root view: Type folders */
            <>
              {wiki.types.length === 0 && (
                <div className="wiki-browser-empty">
                  Rechtsklick um einen Wiki-Typ zu erstellen
                </div>
              )}
              <div className="wiki-browser-grid">
                {wiki.types.map((type: WikiType) => (
                  <div
                    key={type.id}
                    className="wiki-browser-item wiki-browser-type-item"
                    onDoubleClick={() => wiki.enterType(type.id)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ kind: 'folder', x: e.clientX, y: e.clientY, typeId: type.id });
                    }}
                    title={`${type.name} – Doppelklick zum Öffnen`}
                  >
                    <Folder size={32} className="wiki-browser-item-icon" />
                    <span className="wiki-browser-item-name">{type.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Type view: Entry list */
            <>
              {wiki.entries.length === 0 && (
                <div className="wiki-browser-empty">
                  Rechtsklick um einen neuen {wiki.currentType.name} zu erstellen
                </div>
              )}
              <div className="wiki-browser-grid">
                {wiki.entries.map((entry: WikiEntry) => (
                  <div
                    key={entry.id}
                    className="wiki-browser-item wiki-browser-entry-item"
                    onClick={() => wiki.openEntry(entry)}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ kind: 'entry', x: e.clientX, y: e.clientY, typeId: entry.typeId, entryId: entry.id });
                    }}
                    title={entryDisplayName(entry)}
                  >
                    <FileText size={32} className="wiki-browser-item-icon" />
                    <span className="wiki-browser-item-name">{entryDisplayName(entry)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="tree-context-menu wiki-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.kind === 'root-empty' && (
            <div className="tree-context-menu-item" onClick={handleCreateType}>
              Neuer Wiki-Typ
            </div>
          )}
          {contextMenu.kind === 'folder' && (
            <>
              <div className="tree-context-menu-item" onClick={() => {
                setContextMenu(null);
                wiki.enterType(contextMenu.typeId);
              }}>
                Öffnen
              </div>
              <div className="tree-context-menu-item" onClick={() => {
                setContextMenu(null);
                wiki.openTypeEditor(contextMenu.typeId);
              }}>
                Typ bearbeiten
              </div>
              <div
                className="tree-context-menu-item tree-context-menu-item-danger"
                onClick={() => handleDeleteType(contextMenu.typeId)}
              >
                Typ löschen
              </div>
            </>
          )}
          {contextMenu.kind === 'type-empty' && wiki.currentType && (
            <div className="tree-context-menu-item" onClick={handleCreateEntry}>
              Neues {wiki.currentType.name}
            </div>
          )}
          {contextMenu.kind === 'entry' && (
            <div
              className="tree-context-menu-item tree-context-menu-item-danger"
              onClick={() => handleDeleteEntry(contextMenu.entryId)}
            >
              Eintrag löschen
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Lock, Plus, Copy, Pencil, Trash2, Download, Upload, Users } from "lucide-react";
import { isBuiltInProfile, type NaviProfileMeta } from "../../naviProfile.ts";
import "./NaviProfileBar.css";

interface Props {
  profiles: NaviProfileMeta[];
  activeProfileId: string;
  /** Import/export need native dialogs, so they only exist in the desktop build. */
  canTransfer: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string, fromId?: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onImport: () => void;
}

/**
 * Profile switcher above the Navi panel. The built-in profile carries the shipped defaults and
 * is read-only — editing it forks into a fresh profile on save (see NaviStatePanel).
 */
export function NaviProfileBar({
  profiles,
  activeProfileId,
  canTransfer,
  error,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onExport,
  onImport,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  const active = profiles.find((p) => p.id === activeProfileId);
  const activeIsBuiltIn = isBuiltInProfile(activeProfileId);

  const startRename = () => {
    setDraftName(active?.name ?? "");
    setRenaming(true);
  };

  const commitRename = () => {
    const name = draftName.trim();
    if (name && name !== active?.name) onRename(activeProfileId, name);
    setRenaming(false);
  };

  const handleCreate = () => {
    const name = window.prompt("Name des neuen Profils:", "Neues Profil");
    if (name?.trim()) onCreate(name.trim());
  };

  const handleDuplicate = () => {
    const name = window.prompt(
      "Name der Kopie:",
      `${active?.name ?? "Profil"} (Kopie)`,
    );
    if (name?.trim()) onCreate(name.trim(), activeProfileId);
  };

  const handleDelete = () => {
    if (!active) return;
    const confirmed = window.confirm(
      `Profil "${active.name}" endgültig löschen? Alle Änderungen darin gehen verloren.`,
    );
    if (confirmed) onDelete(activeProfileId);
  };

  return (
    <div className="navi-profile-bar">
      <div className="navi-profile-row">
        <Users size={11} className="navi-profile-icon" />
        {renaming ? (
          <input
            className="navi-profile-rename-input"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <select
            className="navi-profile-select"
            value={activeProfileId}
            onChange={(e) => onSelect(e.target.value)}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.builtIn ? " (Standard)" : ""}
              </option>
            ))}
          </select>
        )}
        {activeIsBuiltIn && (
          <span className="navi-profile-lock" title="Schreibgeschützt — Änderungen landen in einem neuen Profil">
            <Lock size={10} />
          </span>
        )}
      </div>

      <div className="navi-profile-actions">
        <button type="button" className="navi-profile-action" onClick={handleCreate} title="Neues Profil auf Basis der Standardeinstellungen">
          <Plus size={11} />
        </button>
        <button type="button" className="navi-profile-action" onClick={handleDuplicate} title="Aktuelles Profil duplizieren">
          <Copy size={11} />
        </button>
        <button
          type="button"
          className="navi-profile-action"
          onClick={startRename}
          disabled={activeIsBuiltIn}
          title={activeIsBuiltIn ? "Das Standardprofil kann nicht umbenannt werden" : "Profil umbenennen"}
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          className="navi-profile-action navi-profile-action--danger"
          onClick={handleDelete}
          disabled={activeIsBuiltIn}
          title={activeIsBuiltIn ? "Das Standardprofil kann nicht gelöscht werden" : "Profil löschen"}
        >
          <Trash2 size={11} />
        </button>
        {canTransfer && (
          <>
            <button
              type="button"
              className="navi-profile-action"
              onClick={() => onExport(activeProfileId)}
              title="Profil als Datei exportieren"
            >
              <Download size={11} />
            </button>
            <button type="button" className="navi-profile-action" onClick={onImport} title="Profil aus Datei importieren">
              <Upload size={11} />
            </button>
          </>
        )}
      </div>

      {error && <div className="navi-profile-error">{error}</div>}
    </div>
  );
}

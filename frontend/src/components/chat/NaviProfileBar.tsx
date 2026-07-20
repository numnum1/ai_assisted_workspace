import { useState } from "react";
import { Lock, Plus, Copy, Pencil, Trash2, Download, Upload, Users, Check, X } from "lucide-react";
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
  /** Which name-entry flow is open, if any. Electron has no `window.prompt`, so the name is typed inline. */
  const [pending, setPending] = useState<"create" | "duplicate" | "rename" | null>(null);
  const [draftName, setDraftName] = useState("");

  const active = profiles.find((p) => p.id === activeProfileId);
  const activeIsBuiltIn = isBuiltInProfile(activeProfileId);

  const startNaming = (mode: "create" | "duplicate" | "rename") => {
    setDraftName(
      mode === "create"
        ? "Neues Profil"
        : mode === "duplicate"
          ? `${active?.name ?? "Profil"} (Kopie)`
          : (active?.name ?? ""),
    );
    setPending(mode);
  };

  const commitName = () => {
    const name = draftName.trim();
    if (name) {
      if (pending === "create") onCreate(name);
      else if (pending === "duplicate") onCreate(name, activeProfileId);
      else if (pending === "rename" && name !== active?.name) onRename(activeProfileId, name);
    }
    setPending(null);
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
        {pending ? (
          <input
            className="navi-profile-rename-input"
            value={draftName}
            autoFocus
            placeholder="Profilname"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setPending(null);
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
        {pending ? (
          <>
            <button
              type="button"
              className="navi-profile-action"
              onClick={commitName}
              disabled={!draftName.trim()}
              title="Übernehmen"
            >
              <Check size={11} />
            </button>
            <button
              type="button"
              className="navi-profile-action"
              onClick={() => setPending(null)}
              title="Abbrechen"
            >
              <X size={11} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="navi-profile-action"
              onClick={() => startNaming("create")}
              title="Neues Profil auf Basis der Standardeinstellungen"
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              className="navi-profile-action"
              onClick={() => startNaming("duplicate")}
              title="Aktuelles Profil duplizieren"
            >
              <Copy size={11} />
            </button>
            <button
              type="button"
              className="navi-profile-action"
              onClick={() => startNaming("rename")}
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
                <button
                  type="button"
                  className="navi-profile-action"
                  onClick={onImport}
                  title="Profil aus Datei importieren"
                >
                  <Upload size={11} />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {error && <div className="navi-profile-error">{error}</div>}
    </div>
  );
}

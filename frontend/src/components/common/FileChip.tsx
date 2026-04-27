import { X, FileText, Folder } from "lucide-react";

interface FileChipProps {
  path: string;
  onRemove: (path: string) => void;
}

export function FileChip({ path, onRemove }: FileChipProps) {
  const isDirectory = path.endsWith("/");
  const segments = path.replace(/\/+$/, "").split("/");
  const displayName = segments.pop() || path;

  return (
    <span className="file-chip" data-testid="FileChip" title={path}>
      {isDirectory ? <Folder size={12} /> : <FileText size={12} />}
      <span className="file-chip-name">
        {displayName}
        {isDirectory ? "/" : ""}
      </span>
      <button
        className="file-chip-remove"
        onClick={() => onRemove(path)}
        title="Remove"
      >
        <X size={12} />
      </button>
    </span>
  );
}

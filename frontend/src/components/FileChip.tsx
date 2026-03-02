import { X, FileText } from 'lucide-react';

interface FileChipProps {
  path: string;
  onRemove: (path: string) => void;
}

export function FileChip({ path, onRemove }: FileChipProps) {
  const fileName = path.split('/').pop() || path;

  return (
    <span className="file-chip" title={path}>
      <FileText size={12} />
      <span className="file-chip-name">{fileName}</span>
      <button className="file-chip-remove" onClick={() => onRemove(path)} title="Remove">
        <X size={12} />
      </button>
    </span>
  );
}

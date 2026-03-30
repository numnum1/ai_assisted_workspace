import type { LucideIcon } from 'lucide-react';
import { BookOpen, Layers, AlignLeft, Sword, Music, Disc, FileText, Folder, Minus } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  book: BookOpen,
  layers: Layers,
  'align-left': AlignLeft,
  sword: Sword,
  music: Music,
  disc: Disc,
  'file-text': FileText,
  folder: Folder,
  minus: Minus,
};

export function OutlinerIcon({ name, size, className }: { name: string; size: number; className?: string }) {
  const Cmp = ICON_MAP[name] ?? BookOpen;
  return <Cmp size={size} className={className} />;
}

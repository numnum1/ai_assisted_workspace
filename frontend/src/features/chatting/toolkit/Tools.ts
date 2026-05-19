import { Wrench, type LucideIcon } from 'lucide-react';

export type ToolId = 'web' | 'wiki' | 'filesystem';

export type Tool = {
  id: ToolId;
  label: string;
  Icon: LucideIcon;
};

export const toolList: Tool[] = [
  { id: 'web', label: 'Web-Suche', Icon: Wrench },
  { id: 'wiki', label: 'Wiki', Icon: Wrench },
  { id: 'filesystem', label: 'Dateisystem', Icon: Wrench },
];

export function findToolById (id: ToolId) : Tool | null {
  const tool = toolList.find(tool => tool.id === id);
  return tool || null;
}
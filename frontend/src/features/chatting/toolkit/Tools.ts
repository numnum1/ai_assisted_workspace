import { Wrench, type LucideIcon } from "lucide-react";

export type Tool = {
  id: string;
  label: string;
  Icon: LucideIcon;
};

export const toolList = [
  { id: "web", label: "Web-Suche", Icon: Wrench },
  { id: "wiki", label: "Wiki", Icon: Wrench },
  { id: "filesystem", label: "Dateisystem", Icon: Wrench },
];

export function findToolById (id: string) : Tool | null {
  const tool = toolList.find(tool => tool.id === id);
  return tool || null;
}
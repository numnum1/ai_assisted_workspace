import type { LucideIcon } from "lucide-react";
import type { Tool } from "./tool";

export type ToolkitId = 'web' | 'wiki' | 'filesystem' | 'glossary' | 'multipleChoice';

export type Toolkit = {
  id: ToolkitId;
  label: string;
  icon: LucideIcon;
  tools: Tool[];
};

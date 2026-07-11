import type { FileNode } from '../types.ts';

/** A book-like subproject (or the project root itself) that owns a chapter list. */
export interface BookProject {
  /** "." for the project root, otherwise the subproject's relative folder path. */
  path: string;
  name: string;
  subprojectType: string | null;
}

/** Walks the project file tree and collects the root project plus every subproject folder. */
export function collectBookProjects(root: FileNode): BookProject[] {
  const projects: BookProject[] = [
    { path: '.', name: root.name || 'Projekt', subprojectType: root.subprojectType ?? null },
  ];
  const visit = (node: FileNode) => {
    if (node.directory && node.subprojectType) {
      projects.push({ path: node.path, name: node.name, subprojectType: node.subprojectType });
      return;
    }
    node.children?.forEach(visit);
  };
  root.children?.forEach(visit);
  return projects;
}

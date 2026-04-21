export interface ProjectCurrentResult {
  path: string;
  hasProject: boolean;
  initialized: boolean;
}

export interface ProjectBrowseResult {
  cancelled: boolean;
  path?: string;
}

export interface FileNode {
  name: string;
  path: string;
  directory: boolean;
  children: FileNode[] | null;
  subprojectType?: string | null;
}

export interface FileContentResult {
  path: string;
  content: string;
  lines: number;
}

export interface FileMutationResult {
  status: string;
  path: string;
}

export interface AppBridge {
  platform: NodeJS.Platform;
  isElectron: boolean;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  project?: {
    current: () => Promise<ProjectCurrentResult>;
    reveal: () => Promise<{ status: string }>;
    browse: () => Promise<ProjectBrowseResult>;
    open: (path: string) => Promise<{
      status: string;
      path: string;
      tree: FileNode;
      initialized: boolean;
    }>;
  };
  files?: {
    getTree: () => Promise<FileNode>;
    getContent: (path: string) => Promise<FileContentResult>;
    saveContent: (path: string, content: string) => Promise<{ status: string }>;
    deleteContent: (path: string) => Promise<FileMutationResult>;
    createFile: (
      parentPath: string,
      name: string,
    ) => Promise<FileMutationResult>;
    createFolder: (
      parentPath: string,
      name: string,
    ) => Promise<FileMutationResult>;
    rename: (path: string, newName: string) => Promise<FileMutationResult>;
    move: (
      path: string,
      targetParentPath: string,
    ) => Promise<FileMutationResult>;
  };
}

export function getAppBridge(): AppBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.appBridge ?? null;
}

export function isRunningInElectron(): boolean {
  return getAppBridge()?.isElectron === true;
}

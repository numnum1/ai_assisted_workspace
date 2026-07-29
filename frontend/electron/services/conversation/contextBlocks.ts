import type { ChatRequest, ChatMessage } from "../../../src/shared/types.js";
import {
  normalizeText,
  estimateTokens,
  readProjectConfig,
  buildFileTreeListing,
  readReferencedProjectFile,
  isWikiRelativePath,
  type ProjectConfigData,
} from "./projectContext.js";
import {
  TOOLKIT_IDS_WITH_TOOLS,
  getDisabledToolkitIds,
  isToolkitEnabled,
} from "./systemPrompt.js";

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export function createContextBlock(
  type: string,
  label: string,
  content: string,
): ContextBlock | null {
  const normalized = content.trim();
  if (!normalized) return null;
  return {
    type,
    label,
    content: normalized,
    estimatedTokens: estimateTokens(normalized),
  };
}

export function buildModeBlock(request: ChatRequest): ContextBlock | null {
  const mode = normalizeText(request.mode);
  if (!mode) return null;

  const content = `Aktiver Chat-Modus: ${mode}`;
  return {
    type: "mode",
    label: "Chat-Modus",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

export function buildMessageBlock(request: ChatRequest): ContextBlock | null {
  const message = typeof request.message === "string" ? request.message : "";
  if (!message.trim()) return null;

  return {
    type: "message",
    label: "Nachricht",
    content: message,
    estimatedTokens: estimateTokens(message),
  };
}

function formatHistoryMessage(message: ChatMessage): string {
  const role = normalizeText(message.role);
  const content =
    typeof message.content === "string" ? message.content.trim() : "";
  if (!role || !content) return "";
  return `${role.toUpperCase()}: ${content}`;
}

export function buildHistoryBlock(request: ChatRequest): ContextBlock | null {
  const history = Array.isArray(request.history) ? request.history : [];
  if (history.length === 0) return null;

  const content = history
    .filter((message) => !message.hidden)
    .map(formatHistoryMessage)
    .filter(Boolean)
    .join("\n\n");

  if (!content) return null;

  return {
    type: "history",
    label: "Verlauf",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

export function buildToolkitBlock(request: ChatRequest): ContextBlock | null {
  if (request.quickChat) return null;

  // Only the active toolkits are named — listing a disabled one (e.g. "wiki") would
  // itself tell the model about a capability it must not know exists.
  const disabled = getDisabledToolkitIds(request);
  const activeToolkits = TOOLKIT_IDS_WITH_TOOLS.filter((id) => !disabled.has(id));
  if (activeToolkits.length === 0) return null;

  const content = `Aktive Toolkits: ${activeToolkits.join(", ")}`;
  return {
    type: "toolkits",
    label: "Toolkits",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

export async function buildPreviewContext(
  projectPath: string | null,
  request: ChatRequest,
): Promise<{
  projectConfig: ProjectConfigData | null;
  blocks: ContextBlock[];
  includedFiles: string[];
}> {
  const blocks: ContextBlock[] = [];
  const includedFiles = new Set<string>();

  const projectConfig = await readProjectConfig(projectPath);

  const modeBlock = buildModeBlock(request);
  if (modeBlock) blocks.push(modeBlock);

  if (!request.rulesDisabled) {
    const rules = (projectConfig?.rules ?? []).filter((r) => r?.name);
    if (rules.length > 0) {
      const rulesBlock = createContextBlock(
        "rules",
        "KI-Regeln",
        rules.map((r) => `### ${(r as { name: string; body: string }).name}\n${(r as { name: string; body: string }).body}`).join("\n\n"),
      );
      if (rulesBlock) blocks.push(rulesBlock);
    }
  }

  if (projectConfig?.workspaceMode) {
    const workspaceModeBlock = createContextBlock(
      "workspace-mode",
      "Workspace Mode",
      projectConfig.workspaceMode,
    );
    if (workspaceModeBlock) blocks.push(workspaceModeBlock);
  }

  if (projectPath) {
    const treeLines = await buildFileTreeListing(projectPath, projectPath);
    const fileTreeBlock = createContextBlock(
      "file-tree",
      "Project Files (tree)",
      treeLines.join("\n"),
    );
    if (fileTreeBlock) blocks.push(fileTreeBlock);
  }

  // With the wiki toolkit off, no wiki content reaches the model — not even a file the
  // user attached explicitly or pinned via alwaysInclude.
  const wikiEnabled = isToolkitEnabled(request, "wiki");

  const alwaysInclude = projectConfig?.alwaysInclude ?? [];
  for (const relativePath of alwaysInclude) {
    if (!wikiEnabled && isWikiRelativePath(relativePath)) continue;
    const referenced = await readReferencedProjectFile(
      projectPath,
      relativePath,
    );
    if (!referenced) continue;
    includedFiles.add(relativePath);
    const fileBlock = createContextBlock("file", relativePath, referenced.content);
    if (fileBlock) blocks.push(fileBlock);
  }

  const referencedFiles = Array.isArray(request.referencedFiles)
    ? request.referencedFiles
        .map((value) => normalizeText(value))
        .filter(Boolean)
    : [];

  for (const reference of referencedFiles) {
    if (includedFiles.has(reference)) continue;
    if (!wikiEnabled && isWikiRelativePath(reference)) continue;
    const fileData = await readReferencedProjectFile(projectPath, reference);
    if (!fileData) {
      console.warn(
        `[context] referenced file could not be resolved/read: "${reference}"`,
      );
      continue;
    }
    includedFiles.add(reference);
    const referencedBlock = createContextBlock(
      "file",
      `Referenced: ${fileData.label ?? reference}`,
      fileData.content,
    );
    if (referencedBlock) blocks.push(referencedBlock);
  }

  const historyBlock = buildHistoryBlock(request);
  if (historyBlock) blocks.push(historyBlock);

  const messageBlock = buildMessageBlock(request);
  if (messageBlock) blocks.push(messageBlock);

  const toolkitBlock = buildToolkitBlock(request);
  if (toolkitBlock) blocks.push(toolkitBlock);

  return {
    projectConfig,
    blocks,
    includedFiles: [...includedFiles],
  };
}

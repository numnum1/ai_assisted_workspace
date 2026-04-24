import type { ChatRequest, ChatMessage } from "../../../src/types.js";
import {
  normalizeText,
  estimateTokens,
  readProjectConfig,
  readGlossaryContent,
  buildFileTreeListing,
  readReferencedProjectFile,
  type ProjectConfigData,
} from "./projectContext.js";
import { TOOLKIT_TOOL_DEFINITIONS } from "./systemPrompt.js";

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

  const disabled = new Set(
    Array.isArray(request.disabledToolkits)
      ? request.disabledToolkits.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  );
  const allToolkits = Object.keys(TOOLKIT_TOOL_DEFINITIONS);
  const activeToolkits = allToolkits.filter((id) => !disabled.has(id));
  const disabledToolkits = allToolkits.filter((id) => disabled.has(id));

  const lines: string[] = [];
  if (activeToolkits.length > 0) {
    lines.push(`Aktive Toolkits: ${activeToolkits.join(", ")}`);
  }
  if (disabledToolkits.length > 0) {
    lines.push(`Deaktivierte Toolkits: ${disabledToolkits.join(", ")}`);
  }

  if (lines.length === 0) return null;

  const content = lines.join("\n");
  return {
    type: "toolkits",
    label: "Toolkits",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

export function buildSessionBlock(request: ChatRequest): ContextBlock | null {
  const sessionKind = normalizeText(request.sessionKind);
  const steeringPlan =
    typeof request.steeringPlan === "string" ? request.steeringPlan.trim() : "";

  if (!sessionKind && !steeringPlan) return null;

  const lines: string[] = [];
  if (sessionKind) {
    lines.push(`Sitzungstyp: ${sessionKind}`);
  }
  if (steeringPlan) {
    lines.push("Steuerungsplan:");
    lines.push(steeringPlan);
  }

  const content = lines.join("\n");
  return {
    type: "session",
    label: "Sitzung",
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

  if (projectConfig?.workspaceMode) {
    const workspaceModeBlock = createContextBlock(
      "workspace-mode",
      "Workspace Mode",
      projectConfig.workspaceMode,
    );
    if (workspaceModeBlock) blocks.push(workspaceModeBlock);
  }

  const glossaryContent = await readGlossaryContent(projectPath);
  const glossaryBlock = createContextBlock(
    "glossary",
    "Glossary (.assistant/glossary.md)",
    glossaryContent,
  );
  if (glossaryBlock) blocks.push(glossaryBlock);

  if (projectPath) {
    const treeLines = await buildFileTreeListing(projectPath, projectPath);
    const fileTreeBlock = createContextBlock(
      "file-tree",
      "Project Files (tree)",
      treeLines.join("\n"),
    );
    if (fileTreeBlock) blocks.push(fileTreeBlock);
  }

  const alwaysInclude = projectConfig?.alwaysInclude ?? [];
  for (const relativePath of alwaysInclude) {
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
    const fileData = await readReferencedProjectFile(projectPath, reference);
    if (!fileData) continue;
    includedFiles.add(reference);
    const referencedBlock = createContextBlock(
      "file",
      `Referenced: ${reference}`,
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

  const sessionBlock = buildSessionBlock(request);
  if (sessionBlock) blocks.push(sessionBlock);

  return {
    projectConfig,
    blocks,
    includedFiles: [...includedFiles],
  };
}

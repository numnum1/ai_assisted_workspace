import type { ChatRequest, ChatMessage } from "../../src/types.ts";

export interface ContextBlock {
  type: string;
  label: string;
  content: string;
  estimatedTokens: number;
}

export interface ChatContextPreviewResult {
  includedFiles: string[];
  estimatedTokens: number;
  contextBlocks: ContextBlock[];
  systemPrompt: string;
}

interface PreviewBuildContext {
  projectPath: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function estimateTokens(text: string): number {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function buildModeBlock(request: ChatRequest): ContextBlock | null {
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

function buildMessageBlock(request: ChatRequest): ContextBlock | null {
  const message = typeof request.message === "string" ? request.message : "";
  if (!message.trim()) return null;

  return {
    type: "message",
    label: "Nachricht",
    content: message,
    estimatedTokens: estimateTokens(message),
  };
}

function buildActiveFileBlock(request: ChatRequest): ContextBlock | null {
  const activeFile = normalizeText(request.activeFile);
  if (!activeFile) return null;

  const content = `Aktive Datei: ${activeFile}`;
  return {
    type: "active-file",
    label: "Aktive Datei",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function buildReferencedFilesBlock(request: ChatRequest): ContextBlock | null {
  const referencedFiles = Array.isArray(request.referencedFiles)
    ? request.referencedFiles.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  if (referencedFiles.length === 0) return null;

  const content = referencedFiles.join("\n");
  return {
    type: "file-list",
    label: "Referenzierte Dateien",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function buildHistoryBlock(request: ChatRequest): ContextBlock | null {
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

function formatHistoryMessage(message: ChatMessage): string {
  const role = normalizeText(message.role);
  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (!role || !content) return "";
  return `${role.toUpperCase()}: ${content}`;
}

function buildToolkitBlock(request: ChatRequest): ContextBlock | null {
  const disabledToolkits = Array.isArray(request.disabledToolkits)
    ? request.disabledToolkits.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  if (disabledToolkits.length === 0) return null;

  const content = `Deaktivierte Toolkits: ${disabledToolkits.join(", ")}`;
  return {
    type: "toolkits",
    label: "Toolkits",
    content,
    estimatedTokens: estimateTokens(content),
  };
}

function buildSessionBlock(request: ChatRequest): ContextBlock | null {
  const sessionKind = normalizeText(request.sessionKind);
  const steeringPlan = typeof request.steeringPlan === "string" ? request.steeringPlan.trim() : "";

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

function buildSystemPrompt(request: ChatRequest, context: PreviewBuildContext): string {
  const lines: string[] = [
    "Du bist ein lokaler Schreibassistent in einer Electron-Anwendung.",
    "Erstelle eine strukturierte, hilfreiche Antwort auf Basis des aktuellen Projekts.",
  ];

  if (context.projectPath) {
    lines.push(`Projektpfad: ${context.projectPath}`);
  }

  const mode = normalizeText(request.mode);
  if (mode) {
    lines.push(`Modus: ${mode}`);
  }

  if (request.useReasoning) {
    lines.push("Reasoning ist aktiviert.");
  }

  return lines.join("\n");
}

export async function previewChatContext(
  projectPath: string | null,
  request: ChatRequest,
): Promise<ChatContextPreviewResult> {
  const context: PreviewBuildContext = {
    projectPath,
  };

  const blocks = [
    buildModeBlock(request),
    buildMessageBlock(request),
    buildActiveFileBlock(request),
    buildReferencedFilesBlock(request),
    buildHistoryBlock(request),
    buildToolkitBlock(request),
    buildSessionBlock(request),
  ].filter((block): block is ContextBlock => block !== null);

  const systemPrompt = buildSystemPrompt(request, context);
  const estimatedTokens =
    estimateTokens(systemPrompt) +
    blocks.reduce((sum, block) => sum + block.estimatedTokens, 0);

  const includedFiles = Array.isArray(request.referencedFiles)
    ? request.referencedFiles.map((value) => normalizeText(value)).filter(Boolean)
    : [];

  return {
    includedFiles,
    estimatedTokens,
    contextBlocks: blocks,
    systemPrompt,
  };
}

import { spawn } from "node:child_process";
import path from "node:path";

export interface ClaudePrepOptions {
  projectPath: string;
  userRequest: string;
  timeoutMs?: number;
}

/**
 * Runs `claude --print` as a subprocess with the project directory as CWD.
 * Claude Code reads the wiki/project files and returns a focused briefing.
 * Bash, Edit, and Write tools are disallowed — read-only.
 */
export async function runClaudeCodePrep(options: ClaudePrepOptions): Promise<string> {
  const { projectPath, userRequest, timeoutMs = 90_000 } = options;

  const prompt = buildPrepPrompt(userRequest);

  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";

    const child = spawn(
      isWindows ? "claude.cmd" : "claude",
      ["--print", "--disallowedTools", "Bash,Edit,Write,NotebookEdit"],
      {
        cwd: path.resolve(projectPath),
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Claude Code prep timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdin.write(prompt, "utf8");
    child.stdin.end();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        const detail = stderr.trim().slice(0, 500);
        reject(new Error(`Claude Code exited with code ${code}${detail ? `: ${detail}` : ""}`));
        return;
      }

      resolve(stdout.trim());
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function buildPrepPrompt(userRequest: string): string {
  return (
    "Du bereitest einen Story-Chat vor. Der Nutzer möchte folgendes besprechen:\n\n" +
    `"${userRequest}"\n\n` +
    "Deine Aufgabe: Nutze grep und read_file, um das Wiki und die relevanten Projektdateien zu lesen. " +
    "Erstelle dann ein fokussiertes Briefing (max. 1500 Wörter) für die KI, die das Gespräch führen wird.\n\n" +
    "Das Briefing enthält:\n" +
    "- Alle direkt relevanten Wiki-Einträge (Charaktere, Orte, Organisationen, Ereignisse) mit ihren wichtigsten Fakten\n" +
    "- Aktuellen Kanon-Stand zu den angesprochenen Themen\n" +
    "- Bekannte offene Fragen oder Widersprüche\n" +
    "- Relevante Buchkapitel oder Szenen, falls vorhanden\n\n" +
    "Schreibe KEIN Gespräch und keine Empfehlungen. Nur Fakten aus dem Projekt.\n" +
    "Format: Markdown mit klaren Überschriften pro Themenbereich.\n" +
    "Antworte auf Deutsch."
  );
}

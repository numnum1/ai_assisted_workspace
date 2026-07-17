import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
} from "./openAiClient.js";
import {
  loadNaviStates,
  loadNaviTips,
  loadNaviPersona,
  loadNaviImprovementLlmRaw,
  validateStates,
  validateTips,
  validatePersona,
} from "./naviStateConfigService.js";
import { loadUseCases, loadTools, validateUseCases, validateTools } from "./naviKnowledgeBase.js";
import type { NaviImprovementProposal } from "../../src/naviImprovement.js";

const SYSTEM_PROMPT = `Du bist ein Konfigurations-Editor für "Navi", einen KI-Berater-Chatbot für Einzelhändler. Du bekommst:
1. Die aktuelle Navi-Konfiguration (persona, states, tips, useCases, tools) als JSON.
2. Den Transkript-Export eines Beta-Test-Gesprächs, in dem ein menschlicher Reviewer einzelne Navi-Antworten mit 👍/👎 und einem Pflichtkommentar bewertet hat.

Deine Aufgabe: Leite aus den 👎-Kommentaren (und, als Anti-Regressions-Signal, aus den 👍-Kommentaren) konkrete, minimale Änderungen an der Konfiguration ab, die das bemängelte Verhalten beheben, ohne Dinge zu brechen, die laut 👍 bereits gut funktionieren.

Feste Leitprinzipien, die JEDE Änderung respektieren muss:
- Navi berät ehrlich auf Basis des Ist-Zustands des Händlers – kein Tool-Verkauf, kein Drängen zu einem Software-Umbau.
- Ändere nur, wofür es im Feedback einen konkreten Beleg gibt. Erfinde keine Verbesserungen ohne Anlass.
- Bewahre die IDs bestehender States (state.id) und Slot-Bezeichner, außer das Feedback verlangt explizit eine strukturelle Änderung. Jeder transitions[].to muss auf eine tatsächlich existierende state.id zeigen.
- Ändere nur Domänen, für die es einen Grund gibt. Domänen ohne Änderungsbedarf lässt du komplett weg (kein leeres Array, kein null-Platzhalter — das Feld fehlt einfach im JSON).

Antworte NUR mit einem JSON-Objekt, keine Markdown-Codeblöcke, kein Fließtext davor oder danach:
{
  "rationale": "Kurze Begründung pro geänderter Domäne, mit Bezug auf die konkreten Feedback-Kommentare, die die Änderung ausgelöst haben.",
  "persona": { ... NaviPersonaConfig, nur falls geändert ... },
  "states": [ ... vollständiges NaviState[], nur falls geändert ... ],
  "tips": [ ... vollständiges NaviTip[], nur falls geändert ... ],
  "useCases": [ ... vollständiges NaviUseCase[], nur falls geändert ... ],
  "tools": [ ... vollständiges NaviTool[], nur falls geändert ... ]
}
Wichtig: Ein angegebenes Array/Objekt ersetzt die gesamte bisherige Domäne. Gib deshalb bei jeder geänderten Domäne den VOLLSTÄNDIGEN Inhalt zurück (unveränderte Einträge inklusive), nicht nur einen Ausschnitt.`;

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate;
  return candidate.slice(start, end + 1);
}

export async function proposeNaviImprovement(
  conversationMarkdown: string,
  llmId?: string | null,
): Promise<NaviImprovementProposal> {
  const [states, tips, persona, useCases, tools] = await Promise.all([
    loadNaviStates(),
    loadNaviTips(),
    loadNaviPersona(),
    Promise.resolve(loadUseCases()),
    Promise.resolve(loadTools()),
  ]);

  const currentConfig = { persona, states, tips, useCases, tools };

  const dedicated = await loadNaviImprovementLlmRaw();
  const endpoint =
    dedicated.apiUrl && dedicated.apiKey && dedicated.model
      ? { apiUrl: dedicated.apiUrl, apiKey: dedicated.apiKey, model: dedicated.model }
      : resolveProviderEndpoint(await resolveAiProvider(llmId ?? null), true);

  const userPrompt = [
    "## Aktuelle Konfiguration",
    "```json",
    JSON.stringify(currentConfig, null, 2),
    "```",
    "",
    "## Beta-Test-Gespräch mit Feedback",
    "```markdown",
    conversationMarkdown,
    "```",
  ].join("\n");

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM-Anfrage fehlgeschlagen (${response.status}).`);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json?.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) {
    throw new Error("Das Modell hat keine Antwort geliefert.");
  }

  let parsed: {
    rationale?: unknown;
    persona?: unknown;
    states?: unknown;
    tips?: unknown;
    useCases?: unknown;
    tools?: unknown;
  };
  try {
    parsed = JSON.parse(extractJsonObject(raw));
  } catch {
    throw new Error("Die Modellantwort war kein gültiges JSON.");
  }

  const warnings: string[] = [];
  const proposal: NaviImprovementProposal = {
    rationale: typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? parsed.rationale.trim()
      : "Keine Begründung geliefert.",
    warnings,
  };

  if (parsed.persona !== undefined) {
    try {
      validatePersona(parsed.persona as never);
      proposal.persona = parsed.persona as NaviImprovementProposal["persona"];
    } catch (err) {
      warnings.push(`Persona-Vorschlag verworfen: ${(err as Error).message}`);
    }
  }
  if (parsed.states !== undefined) {
    try {
      validateStates(parsed.states as never);
      proposal.states = parsed.states as NaviImprovementProposal["states"];
    } catch (err) {
      warnings.push(`Phasen-Vorschlag verworfen: ${(err as Error).message}`);
    }
  }
  if (parsed.tips !== undefined) {
    try {
      validateTips(parsed.tips as never);
      proposal.tips = parsed.tips as NaviImprovementProposal["tips"];
    } catch (err) {
      warnings.push(`Hinweise-Vorschlag verworfen: ${(err as Error).message}`);
    }
  }
  if (parsed.useCases !== undefined) {
    try {
      validateUseCases(parsed.useCases as never);
      proposal.useCases = parsed.useCases as NaviImprovementProposal["useCases"];
    } catch (err) {
      warnings.push(`Use-Case-Vorschlag verworfen: ${(err as Error).message}`);
    }
  }
  if (parsed.tools !== undefined) {
    try {
      validateTools(parsed.tools as never);
      proposal.tools = parsed.tools as NaviImprovementProposal["tools"];
    } catch (err) {
      warnings.push(`Tool-Vorschlag verworfen: ${(err as Error).message}`);
    }
  }

  return proposal;
}

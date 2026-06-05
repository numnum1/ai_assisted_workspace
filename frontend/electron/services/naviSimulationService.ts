import { normalizeText } from "./conversation/projectContext.js";
import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
  type OpenAiMessage,
} from "./openAiClient.js";

export interface SimulationTranscriptLine {
  /** `"navi"` = the Navi advisor, `"merchant"` = the simulated user. */
  speaker: "navi" | "merchant";
  content: string;
}

export interface SimulatedUserReplyRequest {
  /** The persona/goal of the simulated merchant (from SimulationConfig.goal). */
  goal: string;
  /** Optional persona names to give the merchant a concrete identity. */
  characterNames?: string[];
  /** Visible conversation so far, in order. */
  transcript: SimulationTranscriptLine[];
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
}

export interface EvaluateNaviSimulationRequest {
  /** Persona description / goal the merchant was playing. */
  persona: string;
  /** Optional persona name for context. */
  personaName?: string;
  /** Full Navi ↔ merchant transcript, in order. */
  transcript: SimulationTranscriptLine[];
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
}

export interface EvaluateNaviSimulationResult {
  /** Overall score from 0–100 (best effort; -1 if not parseable). */
  score: number;
  /** Markdown analysis of how well Navi performed. */
  report: string;
}

/**
 * Generates the next reply of a *simulated merchant* reacting to Navi.
 *
 * The merchant plays the user side of a Navi advisory chat so the Navi flow can
 * be exercised end-to-end without a human typing. Roles are flipped for the LLM:
 * Navi's lines become `user` (it is talking *to* the merchant) and the merchant's
 * own past lines become `assistant`.
 */
export async function generateSimulatedUserReply(
  req: SimulatedUserReplyRequest,
): Promise<{ reply: string }> {
  const provider = await resolveAiProvider(req.llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const persona = normalizeText(req.goal) || "Ein typischer kleiner Händler.";
  const names = (req.characterNames ?? []).map((n) => normalizeText(n)).filter(Boolean);
  const nameHint = names.length > 0 ? `Dein Name / deine Rolle: ${names.join(", ")}.` : "";

  const systemPrompt = [
    "Du spielst einen Händler/Ladenbesitzer in einem simulierten Beratungsgespräch.",
    "Dein Gegenüber ist 'Navi', ein KI-Berater, der dir Fragen stellt.",
    "Antworte AUSSCHLIESSLICH aus der Perspektive des Händlers – kurz, natürlich, umgangssprachlich, 1–3 Sätze.",
    "Erfinde plausible, konsistente Details (Laden, Probleme, genutzte Tools, Budget), die zum Profil passen.",
    "Du bist der Kunde: stelle selbst keine Beratungsfragen, gib keine Meta-Kommentare, keine Anführungszeichen, kein Rollen-Präfix.",
    nameHint,
    `Profil/Ziel dieser Simulation: ${persona}`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: OpenAiMessage[] = [{ role: "system", content: systemPrompt }];
  for (const line of req.transcript) {
    const content = normalizeText(line.content);
    if (!content) continue;
    messages.push({ role: line.speaker === "navi" ? "user" : "assistant", content });
  }
  if (messages.length === 1) {
    messages.push({ role: "user", content: "(Das Gespräch beginnt.)" });
  }

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({ model: endpoint.model, stream: false, max_tokens: 200, temperature: 0.9, messages }),
  });

  if (!response.ok) {
    let detail = `Simulated user reply error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const reply = normalizeText(json?.choices?.[0]?.message?.content ?? "");
  return { reply };
}

/**
 * Evaluates how well the Navi advisor handled a finished simulation run.
 *
 * A separate "reviewer" LLM reads the full transcript (Navi vs. simulated
 * merchant) and judges Navi's performance: did it understand the problem, ask
 * good questions, give a fitting recommendation, stay on track? Returns a score
 * plus a structured markdown report.
 */
export async function evaluateNaviSimulation(
  req: EvaluateNaviSimulationRequest,
): Promise<EvaluateNaviSimulationResult> {
  const provider = await resolveAiProvider(req.llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const persona = normalizeText(req.persona) || "Ein typischer kleiner Händler.";
  const personaName = normalizeText(req.personaName ?? "");

  const transcriptText = req.transcript
    .map((line) => {
      const content = normalizeText(line.content);
      if (!content) return "";
      return `${line.speaker === "navi" ? "Navi" : "Händler"}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");

  const systemPrompt = [
    "Du bist ein strenger, fairer Qualitätsprüfer für 'Navi', einen KI-Berater, der kleinen Händlern hilft herauszufinden, ob und welche KI-/Software-Tools ihnen nützen.",
    "Du bekommst das Profil eines simulierten Händlers und das vollständige Gesprächsprotokoll zwischen Navi und diesem Händler.",
    "Bewerte AUSSCHLIESSLICH die Leistung von Navi (nicht die des Händlers).",
    "Achte auf: Hat Navi das Problem des Händlers richtig verstanden? Wurden gute, gezielte Rückfragen gestellt? War die Empfehlung passend, konkret und auf das Profil zugeschnitten? Blieb Navi im roten Faden, ohne sich zu wiederholen oder abzuschweifen? War der Ton angemessen?",
    "Sei ehrlich und konkret – belege Stärken und Schwächen mit Bezug auf das Gespräch.",
    "Antworte als gültiges JSON-Objekt mit genau diesen Feldern:",
    '{ "score": <Zahl 0-100>, "summary": "<1-2 Sätze Gesamturteil>", "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."] }',
    "Antworte NUR mit dem JSON, ohne Markdown-Codeblock, ohne weiteren Text.",
  ].join("\n");

  const userPrompt = [
    personaName ? `Persona-Name: ${personaName}` : "",
    `Persona/Profil des Händlers:\n${persona}`,
    "",
    "Gesprächsprotokoll:",
    transcriptText || "(Kein Gesprächsverlauf vorhanden.)",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    let detail = `Navi evaluation error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = normalizeText(json?.choices?.[0]?.message?.content ?? "");

  let parsed: {
    score?: unknown;
    summary?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
    suggestions?: unknown;
  } | null = null;
  try {
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      parsed = JSON.parse(jsonText.slice(start, end + 1));
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return { score: -1, report: raw || "_Keine Bewertung verfügbar._" };
  }

  const scoreNum = Number(parsed.score);
  const score =
    Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= 100 ? Math.round(scoreNum) : -1;
  const summary = normalizeText(String(parsed.summary ?? ""));
  const toList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((v) => normalizeText(String(v))).filter(Boolean) : [];
  const strengths = toList(parsed.strengths);
  const weaknesses = toList(parsed.weaknesses);
  const suggestions = toList(parsed.suggestions);

  const reportLines: string[] = [];
  reportLines.push(`**Gesamtbewertung:** ${score >= 0 ? `${score}/100` : "—"}`);
  if (summary) reportLines.push("", summary);
  if (strengths.length > 0) reportLines.push("", "**Stärken**", ...strengths.map((s) => `- ${s}`));
  if (weaknesses.length > 0) reportLines.push("", "**Schwächen**", ...weaknesses.map((s) => `- ${s}`));
  if (suggestions.length > 0)
    reportLines.push("", "**Verbesserungsvorschläge**", ...suggestions.map((s) => `- ${s}`));

  return { score, report: reportLines.join("\n") };
}

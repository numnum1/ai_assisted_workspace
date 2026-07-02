import * as fs from "fs/promises";
import * as path from "path";
import { normalizeText } from "./conversation/projectContext.js";
import { readWikiFile } from "./wikiService.js";
import {
  resolveAiProvider,
  resolveProviderEndpoint,
  ensureChatCompletionsUrl,
  type OpenAiMessage,
} from "./openAiClient.js";

/**
 * Ensemble = a scene played out by a cast of characters, where *each character
 * is driven by its own LLM instance* (system prompt built solely from that
 * character's wiki dossier). A separate "director" LLM orchestrates the scene:
 * it picks who speaks next, injects narration, and ends the scene when the
 * scene goal is reached. The run yields two artefacts: a raw screenplay
 * transcript and a prose rewrite in the scene's POV/tone.
 *
 * This is a standalone authoring feature and shares nothing with the Navi demo
 * beyond the low-level per-turn LLM call pattern.
 */

const ENSEMBLES_DIR = ".assistant/ensembles";
const DEFAULT_MAX_BEATS = 16;
const NARRATOR_LABEL = "Erzähler";

export interface EnsembleCharacterInput {
  /** Relative wiki path, e.g. `wiki/characters/mara-voss.md`. */
  wikiPath: string;
  /** Speaker label shown in the transcript. */
  name: string;
}

export interface EnsembleSceneContext {
  title?: string;
  location?: string;
  time?: string;
  initialSituation?: string;
  goal?: string;
  tone?: string;
  pov?: string;
}

export interface EnsembleRunRequest {
  scene: EnsembleSceneContext;
  characters: EnsembleCharacterInput[];
  /** Result file name slug (maps to `.assistant/ensembles/<resultFile>.md`). */
  resultFile: string;
  /** Provider to use; falls back to the default provider. */
  llmId?: string | null;
  /** Hard cap on beats (director may end earlier). */
  maxBeats?: number;
}

export interface EnsembleBeat {
  kind: "dialogue" | "narration";
  /** Character name, or `Erzähler` for narration. */
  speaker: string;
  content: string;
  /** Optional stage direction / action beat. */
  action?: string;
}

export interface EnsembleRunResult {
  beats: EnsembleBeat[];
  screenplay: string;
  prose: string;
  /** Relative path of the written result file, if persisted. */
  path?: string;
}

/** Live progress event emitted while a scene is being played out. */
export type EnsembleProgressEvent =
  | { phase: "beat"; index: number; beat: EnsembleBeat }
  | { phase: "prose" }
  | { phase: "done"; result: EnsembleRunResult }
  | { phase: "error"; message: string };

interface LoadedCharacter {
  name: string;
  /** Full wiki dossier text (frontmatter + body). */
  dossier: string;
}

interface DirectorDecision {
  next: string; // character name | "narration" | "END"
  hint?: string;
}

/** A single non-streaming chat completion returning the raw assistant text. */
async function chatCompletion(
  llmId: string | null | undefined,
  messages: OpenAiMessage[],
  opts: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const provider = await resolveAiProvider(llmId);
  const endpoint = resolveProviderEndpoint(provider, false);

  const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({
      model: endpoint.model,
      stream: false,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.8,
      messages,
    }),
  });

  if (!response.ok) {
    let detail = `Ensemble LLM error: ${response.status}`;
    try {
      const body = await response.text();
      if (body) detail += ` — ${body}`;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return normalizeText(json?.choices?.[0]?.message?.content ?? "");
}

/** Extract the first balanced JSON object from a possibly fenced LLM reply. */
function extractJsonObject(raw: string): unknown | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function loadCharacters(
  projectRoot: string | null,
  inputs: EnsembleCharacterInput[],
): Promise<LoadedCharacter[]> {
  const loaded: LoadedCharacter[] = [];
  for (const input of inputs) {
    const name = normalizeText(input.name);
    if (!name) continue;
    // Wiki paths from scene mentions are usually prefixed with `wiki/`;
    // readWikiFile resolves relative to the wiki root, so strip it.
    const rel = input.wikiPath.replace(/^wiki[\\/]/i, "");
    let dossier = "";
    try {
      const file = await readWikiFile(projectRoot, rel);
      dossier = file.content.trim();
    } catch {
      dossier = "";
    }
    loaded.push({ name, dossier });
  }
  return loaded;
}

function renderSceneBlock(scene: EnsembleSceneContext, cast: string[]): string {
  return [
    scene.title ? `Titel: ${scene.title}` : "",
    scene.location ? `Ort: ${scene.location}` : "",
    scene.time ? `Zeit: ${scene.time}` : "",
    scene.tone ? `Stimmung/Ton: ${scene.tone}` : "",
    scene.pov ? `Erzählperspektive (POV): ${scene.pov}` : "",
    `Besetzung: ${cast.join(", ")}`,
    scene.initialSituation ? `Ausgangssituation: ${scene.initialSituation}` : "",
    scene.goal ? `Ziel der Szene: ${scene.goal}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function renderTranscript(beats: EnsembleBeat[]): string {
  if (beats.length === 0) return "(Die Szene beginnt gerade.)";
  return beats
    .map((b) => {
      if (b.kind === "narration") return `[${NARRATOR_LABEL}] ${b.content}`;
      const action = b.action ? ` (${b.action})` : "";
      return `${b.speaker}${action}: ${b.content}`;
    })
    .join("\n");
}

/** Asks the director who acts next and why. Returns a validated decision. */
async function directNextBeat(
  llmId: string | null | undefined,
  scene: EnsembleSceneContext,
  cast: string[],
  beats: EnsembleBeat[],
): Promise<DirectorDecision> {
  const systemPrompt = [
    "Du bist der REGISSEUR einer Szene in einem Roman. Du schreibst selbst keinen Dialog.",
    "Deine Aufgabe: entscheide, wer als Nächstes handelt oder spricht, damit die Szene lebendig auf ihr Ziel zuläuft.",
    "Sorge für Dynamik: lass nicht immer dieselbe Figur sprechen, baue Spannung, Pausen und Wendungen ein.",
    "Wähle 'narration', wenn ein kurzer Erzähler-Einschub (Handlung, Atmosphäre, Zeitsprung) die Szene voranbringt.",
    "Wähle 'END', sobald das Ziel der Szene erreicht ist ODER die Szene dramaturgisch zu einem natürlichen Ende gekommen ist.",
    "Antworte AUSSCHLIESSLICH als JSON, ohne Codeblock, ohne weiteren Text:",
    '{ "next": "<Charaktername aus der Besetzung> | narration | END", "hint": "<kurze Regieanweisung an die nächste Figur, max. 1 Satz>" }',
  ].join("\n");

  const userPrompt = [
    "SZENE:",
    renderSceneBlock(scene, cast),
    "",
    "BISHERIGER VERLAUF:",
    renderTranscript(beats),
    "",
    `Wer ist als Nächstes dran? Gültige Namen: ${cast.join(", ")}, oder "narration", oder "END".`,
  ].join("\n");

  const raw = await chatCompletion(
    llmId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 150, temperature: 0.5 },
  );

  const parsed = extractJsonObject(raw) as
    | { next?: unknown; hint?: unknown }
    | null;
  const next = normalizeText(String(parsed?.next ?? ""));
  const hint = normalizeText(String(parsed?.hint ?? ""));

  // Validate: must be a known cast member, narration, or END.
  const match = cast.find((c) => c.toLowerCase() === next.toLowerCase());
  if (match) return { next: match, hint };
  if (/^end$/i.test(next)) return { next: "END", hint };
  if (/narration|erzähler/i.test(next)) return { next: "narration", hint };
  // Unparseable → default to a narration beat so the loop can still progress.
  return { next: "narration", hint };
}

/** One character acts in-role, seeing only the shared transcript + director hint. */
async function actCharacter(
  llmId: string | null | undefined,
  scene: EnsembleSceneContext,
  cast: string[],
  character: LoadedCharacter,
  beats: EnsembleBeat[],
  hint: string,
): Promise<EnsembleBeat> {
  const systemPrompt = [
    `Du VERKÖRPERST die Figur »${character.name}« in einer Romanszene.`,
    "Bleibe strikt in dieser Rolle: Sprache, Wissen, Motive und Ton ergeben sich NUR aus deinem Charakter-Dossier.",
    "Du kennst nur, was deine Figur wissen kann. Erfinde nichts, was dem Dossier oder der Szene widerspricht.",
    "Antworte mit genau EINEM Gesprächsbeitrag (1–4 Sätze), natürlich und in direkter Rede – kein Rollen-Präfix, keine Anführungszeichen.",
    "Optional darfst du eine knappe Handlung/Geste als 'action' beifügen (z.B. »lehnt sich zurück«).",
    "Antworte AUSSCHLIESSLICH als JSON, ohne Codeblock:",
    '{ "speech": "<was die Figur sagt>", "action": "<optionale kurze Handlung oder leer>" }',
    "",
    "DEIN CHARAKTER-DOSSIER:",
    character.dossier || "(kein Dossier hinterlegt – spiele plausibel nach Name und Szene)",
  ].join("\n");

  const userPrompt = [
    "SZENE:",
    renderSceneBlock(scene, cast),
    "",
    "BISHERIGER VERLAUF:",
    renderTranscript(beats),
    "",
    hint ? `Regieanweisung: ${hint}` : "",
    `Du bist »${character.name}«. Was tust/sagst du jetzt?`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatCompletion(
    llmId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 300, temperature: 0.9 },
  );

  const parsed = extractJsonObject(raw) as
    | { speech?: unknown; action?: unknown }
    | null;
  const speech = normalizeText(String(parsed?.speech ?? "")) || normalizeText(raw);
  const action = normalizeText(String(parsed?.action ?? ""));

  return {
    kind: "dialogue",
    speaker: character.name,
    content: speech,
    ...(action ? { action } : {}),
  };
}

/** The director contributes a short narrative beat. */
async function narrate(
  llmId: string | null | undefined,
  scene: EnsembleSceneContext,
  cast: string[],
  beats: EnsembleBeat[],
  hint: string,
): Promise<EnsembleBeat> {
  const systemPrompt = [
    "Du bist der ERZÄHLER einer Romanszene. Schreibe einen kurzen Erzähl-Einschub (1–3 Sätze):",
    "Handlung, Atmosphäre, Raum, Körpersprache oder ein Zeitsprung – kein Dialog.",
    scene.tone ? `Halte den Ton: ${scene.tone}.` : "",
    scene.pov ? `Erzählperspektive: ${scene.pov}.` : "",
    "Antworte NUR mit dem Erzähltext, ohne Präfix, ohne Anführungszeichen.",
  ]
    .filter(Boolean)
    .join("\n");

  const userPrompt = [
    "SZENE:",
    renderSceneBlock(scene, cast),
    "",
    "BISHERIGER VERLAUF:",
    renderTranscript(beats),
    "",
    hint ? `Fokus: ${hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content = await chatCompletion(
    llmId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 200, temperature: 0.8 },
  );

  return { kind: "narration", speaker: NARRATOR_LABEL, content };
}

/** Rewrites the finished screenplay into narrative prose in the scene's POV/tone. */
async function toProse(
  llmId: string | null | undefined,
  scene: EnsembleSceneContext,
  screenplay: string,
): Promise<string> {
  const systemPrompt = [
    "Du bist ein Romanautor. Forme das folgende Szenen-Drehbuch in flüssige, literarische Prosa um.",
    "Behalte Handlung, Dialoge und Reihenfolge bei, aber schreibe erzählend – mit Beschreibung, innerem Erleben und eingebettetem Dialog.",
    scene.pov ? `Erzählperspektive: ${scene.pov}.` : "",
    scene.tone ? `Ton/Stimmung: ${scene.tone}.` : "",
    "Gib NUR die Prosa aus, ohne Überschrift, ohne Kommentar.",
  ]
    .filter(Boolean)
    .join("\n");

  return chatCompletion(
    llmId,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `DREHBUCH:\n${screenplay}` },
    ],
    { maxTokens: 1200, temperature: 0.7 },
  );
}

function buildScreenplay(scene: EnsembleSceneContext, beats: EnsembleBeat[]): string {
  const header = [
    scene.location || scene.time
      ? `**${[scene.location, scene.time].filter(Boolean).join(" · ")}**`
      : "",
    "",
  ].filter((l) => l !== "");
  const body = beats.map((b) => {
    if (b.kind === "narration") return `_${b.content}_`;
    const action = b.action ? ` *(${b.action})*` : "";
    return `**${b.speaker}:**${action} ${b.content}`;
  });
  return [...header, body.join("\n\n")].join("\n");
}

function resolveResultPath(projectRoot: string, name: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 80);
  return path.join(projectRoot, ENSEMBLES_DIR, `${safeName}.md`);
}

/**
 * Runs a full ensemble scene: director-orchestrated beats, per-character LLM
 * agents, then a prose rewrite. Persists screenplay + prose to
 * `.assistant/ensembles/<resultFile>.md` and returns the artefacts.
 */
export async function runEnsembleScene(
  projectRoot: string | null,
  req: EnsembleRunRequest,
  onEvent?: (ev: EnsembleProgressEvent) => void,
): Promise<EnsembleRunResult> {
  if (!projectRoot) throw new Error("No project open");

  const characters = await loadCharacters(projectRoot, req.characters);
  if (characters.length === 0) {
    throw new Error("Keine Charaktere für die Szene gefunden.");
  }
  const cast = characters.map((c) => c.name);
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));
  const maxBeats = Math.max(2, req.maxBeats ?? DEFAULT_MAX_BEATS);

  const beats: EnsembleBeat[] = [];
  const pushBeat = (beat: EnsembleBeat) => {
    beats.push(beat);
    onEvent?.({ phase: "beat", index: beats.length - 1, beat });
  };

  for (let i = 0; i < maxBeats; i++) {
    const decision = await directNextBeat(req.llmId, req.scene, cast, beats);
    if (decision.next === "END") break;

    if (decision.next === "narration") {
      pushBeat(await narrate(req.llmId, req.scene, cast, beats, decision.hint ?? ""));
      continue;
    }

    const character = byName.get(decision.next.toLowerCase());
    if (!character) {
      // Should not happen after validation, but keep the loop safe.
      pushBeat(await narrate(req.llmId, req.scene, cast, beats, decision.hint ?? ""));
      continue;
    }
    pushBeat(
      await actCharacter(req.llmId, req.scene, cast, character, beats, decision.hint ?? ""),
    );
  }

  onEvent?.({ phase: "prose" });
  const screenplay = buildScreenplay(req.scene, beats);
  const prose = await toProse(req.llmId, req.scene, screenplay).catch(() => "");

  const title = req.scene.title || "Szene";
  const body = [
    `# ${title} — Ensemble-Durchspiel`,
    "",
    `**Besetzung:** ${cast.join(", ")}`,
    req.scene.goal ? `**Ziel:** ${req.scene.goal}` : "",
    "",
    "## Drehbuch",
    "",
    screenplay,
    "",
    "---",
    "",
    "## Prosa-Fassung",
    "",
    prose || "_Keine Prosa-Fassung erzeugt._",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const filePath = resolveResultPath(projectRoot, req.resultFile);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf8");

  return {
    beats,
    screenplay,
    prose,
    path: path.relative(projectRoot, filePath),
  };
}

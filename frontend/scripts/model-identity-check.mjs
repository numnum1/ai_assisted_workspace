#!/usr/bin/env node
// Prueft, welches Modell der konfigurierte Endpoint tatsaechlich antworten laesst.
// Bewusst ohne Navi-System-Prompts, ohne Tools, ohne reasoning_effort.
//
//   node scripts/model-identity-check.mjs [providerId] [modelA] [modelB]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_PATH = path.join(
  process.env.APP_DATA_DIR ?? path.join(os.homedir(), ".writing-assistant"),
  "ai-providers.json",
);

const QUESTION =
  "Welches Modell bist du genau? Nenne Hersteller, Modellname und Version. Antworte in einem Satz, ohne Vorrede.";

// Spiegelt ensureChatCompletionsUrl aus electron/services/openAiClient.ts:141-146.
function ensureChatCompletionsUrl(apiUrl) {
  const trimmed = apiUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function loadProvider(providerId) {
  const providers = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const provider = providerId
    ? providers.find((entry) => entry.id === providerId)
    : providers[0];
  if (!provider) {
    throw new Error(
      `Provider "${providerId}" nicht gefunden. Vorhanden: ${providers.map((p) => p.id).join(", ")}`,
    );
  }
  return provider;
}

function maskKey(key) {
  return key ? `…${key.slice(-4)}` : "(leer)";
}

async function ask(apiUrl, apiKey, model) {
  const url = ensureChatCompletionsUrl(apiUrl);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: QUESTION }],
    }),
  });

  const elapsedMs = Date.now() - startedAt;
  const raw = await response.text();

  console.log(`\n=== angefragtes Modell: ${model} ===`);
  console.log(`POST ${url}  ->  HTTP ${response.status} (${elapsedMs} ms)`);

  console.log("\n-- Response-Header --");
  for (const [name, value] of [...response.headers.entries()].sort()) {
    console.log(`  ${name}: ${value}`);
  }

  if (!response.ok) {
    console.log("\n-- Fehler-Body --");
    console.log(raw.slice(0, 2000));
    return null;
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    console.log("\n-- Body ist kein JSON --");
    console.log(raw.slice(0, 2000));
    return null;
  }

  const known = new Set(["choices", "created", "id", "model", "object", "usage", "system_fingerprint"]);
  const extraKeys = Object.keys(body).filter((key) => !known.has(key));

  console.log("\n-- Antwort-Metadaten --");
  console.log(`  model:              ${body.model ?? "(fehlt)"}`);
  console.log(`  id:                 ${body.id ?? "(fehlt)"}`);
  console.log(`  object:             ${body.object ?? "(fehlt)"}`);
  console.log(`  created:            ${body.created ?? "(fehlt)"}`);
  console.log(`  system_fingerprint: ${body.system_fingerprint ?? "(fehlt)"}`);
  console.log(`  finish_reason:      ${body.choices?.[0]?.finish_reason ?? "(fehlt)"}`);
  console.log(`  usage:              ${JSON.stringify(body.usage ?? null)}`);
  for (const key of extraKeys) {
    console.log(`  [extra] ${key}: ${JSON.stringify(body[key]).slice(0, 400)}`);
  }

  const text = body.choices?.[0]?.message?.content ?? "";
  console.log("\n-- Selbstauskunft --");
  console.log(`  ${text.trim() || "(leer)"}`);

  return { model: body.model, text: text.trim() };
}

async function main() {
  const [providerId = "grok", modelA, modelB] = process.argv.slice(2);
  const provider = loadProvider(providerId);
  const apiUrl = provider.fastApiUrl || provider.reasoningApiUrl;
  const apiKey = provider.fastApiKey || provider.reasoningApiKey;
  const configuredModel = provider.fastModel || provider.reasoningModel;

  console.log(`Provider: ${provider.id} (${provider.name})`);
  console.log(`  apiUrl:  ${apiUrl}`);
  console.log(`  apiKey:  ${maskKey(apiKey)}`);
  console.log(`  model:   ${configuredModel}`);

  const first = modelA ?? configuredModel;
  // Kontrollprobe: klar anderes Modell. Liefern beide dasselbe, routet der Proxy still.
  const second = modelB ?? (first === "grok-4.5" ? "claude-haiku-4-5-20251001" : null);

  const resultA = await ask(apiUrl, apiKey, first);
  const resultB = second ? await ask(apiUrl, apiKey, second) : null;

  if (resultA && resultB) {
    console.log("\n=== Vergleich ===");
    console.log(`  angefragt ${first} -> geantwortet als "${resultA.model}"`);
    console.log(`  angefragt ${second} -> geantwortet als "${resultB.model}"`);
    if (resultA.model === resultB.model) {
      console.log("  ACHTUNG: identisches model-Echo bei unterschiedlicher Anfrage.");
    } else if (resultA.model !== first) {
      console.log(`  ACHTUNG: model-Echo weicht von der Anfrage ab (${first} != ${resultA.model}).`);
    } else {
      console.log("  OK: der Endpoint respektiert den model-Parameter.");
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

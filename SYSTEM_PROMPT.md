# System Prompt – Aufbau & LLM-Aufruf

## Übersicht

Der System Prompt wird in zwei Schritten verarbeitet:
1. **Aufbau** in `electron/services/conversation/systemPrompt.ts`
2. **Versand** in `electron/services/chatService.ts`

---

## 1. System Prompt Aufbau

**Datei:** [`frontend/electron/services/conversation/systemPrompt.ts`](frontend/electron/services/conversation/systemPrompt.ts)

### `buildSystemPrompt(request, context, modeSystemPrompt)` (Zeile 210)

Baut den finalen System Prompt aus mehreren Abschnitten auf, die mit `\n\n` verbunden werden:

| # | Abschnitt | Bedingung | Beschreibung |
|---|-----------|-----------|--------------|
| 1 | **Core-Anweisung** | immer | Modus-System-Prompt, Quick-Chat-Fallback, oder Default-Text |
| 2 | **Datum** | immer | `Heutiges Datum: YYYY-MM-DD` |
| 2b | **KI-Regeln** | wenn `!rulesDisabled && !quickChat` | Projekt-Level-Regeln (ähnlich Cursor Rules) aus `projectConfig.rules` |
| 3 | **Projektkontext** | wenn `!quickChat` | Pfad, Name, Beschreibung, Workspace-Modus, alwaysInclude-Dateien, aktiver Modus, referenzierte Dateien |
| 4 | **Verfügbare Werkzeuge** | wenn `!quickChat` | Komma-Liste der aktiven Tool-Namen |
| 5 | **Guided Session** | wenn `sessionKind === "guided"` | Führungsanweisung + optionaler Steuerungsplan aus `request.steeringPlan` |
| 6 | **Reasoning-Hinweis** | wenn `useReasoning === true` | Aufforderung zum schrittweisen Denken |

### Hilfsfunktionen

- **`resolveModeSystemPrompt(projectPath, modeId)`** (Zeile 199) – Lädt den System Prompt des aktiven Modus aus den Projekt-Modes
- **`getActiveToolDefinitions(request)`** (Zeile 178) – Filtert Tool-Definitionen je nach aktivem Toolkit (`dateisystem`, `wiki`, `glossary`, `assistant`) und ob Guided Session aktiv ist

### Tool-Definitionen

Alle verfügbaren Tools sind als `TOOLKIT_TOOL_DEFINITIONS` (Zeile 18) definiert und werden sowohl im System Prompt (als Namen) als auch direkt im API-Request (als vollständige Schemas) mitgegeben:

| Toolkit | Tools |
|---------|-------|
| `dateisystem` | `read_file`, `semantic_search`, `write_file` |
| `wiki` | `wiki_read` |
| `glossary` | `glossary_add` |
| `assistant` | `ask_clarification`, `propose_guided_thread`, `report_thread_result` |

---

## 2. Nachrichten-Array Aufbau

**Datei:** [`frontend/electron/services/chatService.ts`](frontend/electron/services/chatService.ts)

### `buildOpenAiMessages(request, systemPrompt)` (Zeile 236)

Baut das `messages`-Array im OpenAI-Format:

```
[
  { role: "system", content: <systemPrompt> },   // ← der fertige System Prompt
  ...history (assistant / tool / user messages),
  { role: "user", content: request.message }      // ← neue Nutzernachricht
]
```

Versteckte Nachrichten (`message.hidden === true`) werden übersprungen.

---

## 3. LLM API-Aufruf

**Datei:** [`frontend/electron/services/chatService.ts`](frontend/electron/services/chatService.ts)  
**Funktion:** `runChatStream()` (Zeile 815)

```typescript
// Zeile 849-852: System Prompt einbauen
let conversationMessages = buildOpenAiMessages(request, preview.systemPrompt);

// Zeile 866-880: POST-Request ans LLM
const response = await fetch(ensureChatCompletionsUrl(endpoint.apiUrl), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${endpoint.apiKey}`,
  },
  body: JSON.stringify({
    model: endpoint.model,
    stream: true,
    messages: conversationMessages,
    tools: getActiveToolDefinitions(request),  // nur wenn Tools aktiv
  }),
});
```

Der Endpunkt ist OpenAI-kompatibel (konfigurierbar via `aiProviderService.ts`).  
Die Antwort wird als SSE-Stream verarbeitet und über IPC an das Frontend weitergeleitet.

---

## 4. Datenfluss (Übersicht)

```
ChatRequest + ProjectConfig
        │
        ▼
resolveModeSystemPrompt()       ← Modus-System-Prompt aus Projekt-Modes
        │
        ▼
buildSystemPrompt()             ← systemPrompt.ts:210
        │ (6 Abschnitte zusammengefügt)
        ▼
buildOpenAiMessages()           ← chatService.ts:236
        │ ([system, ...history, user])
        ▼
fetch(POST /chat/completions)   ← chatService.ts:866
        │ (SSE-Stream)
        ▼
Frontend via IPC (token events)
```

---

## 5. Wo man ansetzen muss, um den System Prompt zu ändern

| Ziel | Datei | Stelle |
|------|-------|--------|
| Feste Kernanweisung ändern | `systemPrompt.ts` | Zeile 221–228 (`buildSystemPrompt`, Abschnitt 1) |
| Neue Sektion hinzufügen | `systemPrompt.ts` | In `buildSystemPrompt()` ein weiteres `sections.push(...)` |
| Guided-Session-Verhalten ändern | `systemPrompt.ts` | Zeile 292–310 |
| Neues Tool registrieren | `systemPrompt.ts` | `TOOLKIT_TOOL_DEFINITIONS` (Zeile 18) + ggf. `getActiveToolDefinitions()` |
| Modus-System-Prompts verwalten | Projekt-Konfiguration | `getProjectModes()` / Modes-Dateien im Projekt |

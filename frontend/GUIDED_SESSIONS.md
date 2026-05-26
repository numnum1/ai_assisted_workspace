# Guided Sessions & Steering Plan

## Konzept

Eine **Guided Session** ist ein KI-geführter Chat-Modus, in dem die KI aktiv durch eine strukturierte Aufgabe führt. Statt freiem Chat arbeitet die KI einen **Steuerungsplan** (Steering Plan) ab — eine Markdown-Datei, die Ziel, Schritte und aktuellen Status enthält.

`ChatSessionKind = 'standard' | 'guided'` (definiert in `src/types.ts`)

---

## Steuerungsplan-Mechanismus

### Format
Der Plan ist Markdown mit fester Struktur:
```
## Ziel
<Kurzbeschreibung>

## Vorgehen
1. Schritt eins → **Aktuell: 1**
2. Schritt zwei
3. Schritt drei

## Status: In Bearbeitung
```

### Update durch die KI
Die KI gibt nach jedem Turn einen aktualisierten Plan als Fenced Block aus:
````
```plan
## Ziel
...
```
````
Das Frontend extrahiert diesen Block und persistiert ihn in `conversation.steeringPlan`.

### Senden an die KI
Bei jedem Request wird der aktuelle Plan als Teil des System-Prompts mitgeschickt:
```
Steuerungsplan:
<markdown>
```

---

## Implementierung

### Typen & Datenmodell
- **`src/types.ts`**
  - `ChatSessionKind` — `'standard' | 'guided'`
  - `Conversation.sessionKind`, `.steeringPlan`, `.agentPresetId`, `.isThread`, `.parentConversationId`
  - `ChatRequest.sessionKind`, `.steeringPlan`, `.isThread` — wird bei jedem Request ans Backend geschickt
  - `AgentPreset.initialSteeringPlan` — Startplan aus `.assistant/agents.json`

### Plan-Parsing & Display
- **`src/components/chat/planFenceUtils.ts`**
  - `parseSteeringPlanFromAssistant(content)` — extrahiert ` ```plan``` `-Block aus KI-Antwort
  - `stripPlanFencesForDisplay(content, streaming)` — entfernt Plan- und Thread-Result-Blöcke aus Chat-Bubble (werden im Panel angezeigt)
  - `parseSteeringPlan(markdown)` → `ParsedSteeringPlan` — strukturiertes Objekt mit Steps, Progress, Status
  - `isPlanCompleted(content)` / `ensureSteeringPlanMarkedComplete(plan)` — Abschluss-Erkennung

### System-Prompt & Tool-Definitionen
- **`electron/services/conversation/systemPrompt.ts`**
  - `buildSystemPrompt()` — injiziert Plan in den System-Prompt (Abschnitt 5)
  - `getActiveToolDefinitions()` — filtert Tools je nach Session-Typ:
    - `propose_guided_thread` — nur in Standard/nicht-guided Chats
    - `report_thread_result` — nur in Guided Subthreads (`isThread === true`)
  - Tool-Definitionen für `ask_clarification`, `propose_guided_thread`, `report_thread_result` im `assistant`-Toolkit

### Tool-Ausführung
- **`electron/services/chatService.ts`**
  - `buildGuidedThreadOfferFence()` — erzeugt ` ```guided_thread_offer {JSON}``` ` Block
  - `buildThreadResultFence()` — erzeugt ` ```thread_result {JSON}``` ` Block
  - `executeToolCall()` — dispatcht auf die jeweiligen Builder
  - `describeStreamingToolCall()` — deutsche Label für UI-Anzeige während Streaming

### Request-Propagation
- **`src/hooks/useChat.ts`**
  - `ChatStreamSessionMeta` — `{ conversationId, sessionKind, steeringPlan, isThread }`
  - `buildSessionChatRequestFields()` — fügt `sessionKind`, `steeringPlan`, `isThread` dem ChatRequest hinzu
  - `onAssistantResponseComplete` callback — wird nach jedem vollständigen Turn aufgerufen
- **`src/hooks/useConversationModel.ts`**
  - Baut `streamSession` aus der aktiven Conversation (inkl. `isThread`)

### Session-Start & Auto-Kickoff
- **`src/components/chat/guidedAgentKickoff.ts`**
  - Modul-State: `pendingKickoffConversationId`, `kickoffStartedConversationIds`
  - `scheduleGuidedAgentPresetKickoff(id)` → `hasPendingGuidedAgentKickoffFor(id)` → `tryMarkGuidedAgentKickoffStarted(id)`
  - Guards gegen React Strict Mode Doppel-Fires und Tab-Wechsel-Races
- **`src/App.tsx`** — `performGuidedAgentPresetKickoff()` + `useEffect`
  - Sendet hidden User-Message (`GUIDED_AGENT_KICKOFF_USER_MESSAGE`) wenn Conversation leer und Plan vorhanden
  - Plan-Extraktion in `onAssistantResponseComplete` → `history.patchConversation(id, { steeringPlan })`

### UI-Komponenten
- **`src/components/chat/ChatPane.tsx`**
  - `SteeringPlanSection` — aufklappbares Panel mit Plan-Anzeige (nur wenn `activeSessionKind === 'guided'`)
  - `GuidedThreadOfferCard` — Accept/Dismiss-UI für Thread-Angebote

---

## Subthread-System

### Subthread erstellen (`propose_guided_thread`)
1. KI ruft Tool mit `steeringPlanMarkdown`, `threadTitle`, `modeId` auf
2. Backend erzeugt ` ```guided_thread_offer {JSON}``` ` Block
3. Frontend parst Block (`src/components/chat/guidedThreadOfferUtils.ts`) → zeigt `GuidedThreadOfferCard`
4. User akzeptiert → neue Conversation mit `isThread: true`, `parentConversationId`, eigenem Plan

### Subthread-Ergebnis zurückmelden (`report_thread_result`) ← neu
1. KI ruft Tool auf wenn alle Plan-Schritte erledigt sind
2. Backend erzeugt ` ```thread_result {JSON}``` ` Block
3. `onAssistantResponseComplete` in `App.tsx` erkennt Block via `hasThreadResultFence()` (`src/components/chat/threadResultUtils.ts`)
4. Hidden Assistant-Message mit Zusammenfassung wird in Parent-Conversation eingefügt
5. Kickoff-State (`src/components/chat/parentResultKickoffState.ts`) wird gesetzt
6. App navigiert zur Parent-Conversation
7. `useEffect` in `App.tsx` sendet hidden Integration-Message an Parent-KI
8. Parent-KI integriert Befunde in ihren `plan`-Block

### Relevante Dateien Subthread-Result
- `src/components/chat/threadResultUtils.ts` — Fence-Parser
- `src/components/chat/parentResultKickoffState.ts` — Queue-basierter Kickoff-State (mehrere Threads gleichzeitig möglich)
- `src/App.tsx` — `performParentResultKickoff()` callback + `useEffect`

---

## Effektiver Mode in Guided Sessions

- **`src/components/chat/effectiveChatModeForRequest.ts`**
  - Guided Sessions **sperren** den Mode auf `conversation.mode` — Toolbar-Auswahl wird ignoriert
  - `agentOnly: true` Modes sind nur in Guided Sessions sichtbar

## Agent Presets

Definiert in `.assistant/agents.json`, Typ `AgentPreset` (`src/types.ts`):
- `modeId` — welcher Mode verwendet wird
- `initialSteeringPlan` — Startplan der Session
- `disabledToolkits` — deaktivierte Tool-Gruppen (wenn `assistant` deaktiviert → keine Guided-Thread-Tools)
- Hilfsfunktionen in `src/components/chat/chatAgentUtils.ts`

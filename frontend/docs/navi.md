# Navi – Funktionsweise

Navi ist ein KI-gestützter Beratungs-Assistent für Einzelhändler. Er führt strukturierte Gespräche, um herauszufinden ob und wie KI dem Händler konkret helfen kann – ohne etwas zu verkaufen.

---

## Gesprächsfluss (State Machine)

Navi arbeitet als Zustandsautomat mit 8 States. Der Übergang zwischen States wird nach jeder Händler-Nachricht automatisch klassifiziert.

```
greeting
  ├─→ ask_problem          (Laden genannt, kein Problem)
  └─→ clarify_problem      (Laden + Problem genannt)

ask_problem
  └─→ clarify_problem      (konkretes Problem genannt)

clarify_problem
  ├─→ explore_software_stack  (alle Arbeitsplan-Punkte bekannt)
  └─→ ask_problem              (Missverständnis – komplett anderes Problem)

explore_software_stack
  ├─→ assess_situation     (Tool-Stack bekannt)
  └─→ clarify_problem      (neuer wesentlicher Problem-Aspekt)

assess_situation
  ├─→ give_recommendation  (Händler möchte Vorschlag)
  ├─→ closing              (kein Bedarf)
  └─→ explore_software_stack  (Stack-Info lückenhaft)

give_recommendation
  ├─→ refine_recommendation   (Einwände / Fragen)
  └─→ offer_ai_exploration    (zufrieden)

refine_recommendation
  ├─→ refine_recommendation   (weitere Einwände)
  ├─→ give_recommendation     (komplett neuer Ansatz nötig)
  └─→ offer_ai_exploration    (zufrieden)

offer_ai_exploration
  ├─→ explore_ai_solutions    (Händler will KI ansehen – ask_yes_no: Ja)
  └─→ closing                 (kein Interesse – ask_yes_no: Nein)

explore_ai_solutions
  ├─→ explore_ai_solutions    (Fragen / Einwände zu den KI-Tools)
  └─→ closing                 (zufrieden)

closing
  └─→ clarify_problem      (weiteres Anliegen)
```

### Arbeitsplan-Gate

States mit einem `workPlan` dürfen nur per Vorwärts-Transition verlassen werden, wenn **alle** Punkte des Arbeitsplans durch das bisherige Gespräch abgedeckt sind. Der Klassifizierer prüft das explizit.

Beispiel `clarify_problem`:
- Problem konkret beschrieben (nicht nur benannt)
- Häufigkeit oder Ausmaß des Problems bekannt
- Bisheriger Umgang oder Workaround bekannt
- Gewünschtes Ergebnis oder Ziel des Händlers bekannt

---

## Drei Schutzschichten gegen voreilige Schlüsse

### Schicht 1 – Schmale Persona (`persona: "narrow" | "full"`)

Info-Gathering-States (`clarify_problem`, `explore_software_stack`) erhalten keine KI-Berater-Identität. Das LLM weiß dort nur: „Ich führe ein strukturiertes Gespräch und stelle genau eine Frage." Es kennt weder den Gesamtzweck noch hat es Meinungen zu KI-Lösungen.

Advisory-States (`assess_situation`, `give_recommendation`, `refine_recommendation`, `closing`) erhalten die vollständige Navi-Persona als KI-Berater.

Greeting-States (`greeting`, `ask_problem`) erhalten die volle Persona, da Navi sich dort als KI-Berater vorstellen muss.

**Zentrale Navi-Stimme (`naviVoice.ts`):** Das *Wie* der Kommunikation – „User kennt die Software nicht", erst erklären *was/wofür* dann benennen, Gedankengang zeigen – ist **einmal** zentral definiert (`NAVI_FULL_PERSONA_RULES` / `NAVI_NARROW_PERSONA_RULES`) und wird in jeden State-Prompt injiziert. Die State-Instructions in `naviStateMachine.ts` beschreiben nur noch das *Was* (welches Ziel die Phase hat), nicht das *Wie*.

**Konfigurierbare Rolle (das *Wer*):** Die Identitäts-Einweisung („Du bist Navi, ein ehrlicher KI-Berater …") ist von den Verhaltens­regeln getrennt (`NAVI_DEFAULT_ROLE` in `naviVoice.ts`) und wird Full-Persona-States als erster Absatz vorangestellt. Sie lässt sich pro Projekt überschreiben: Projekt-Settings → Navi-Tab → **Navi-Modus** wählt einen Modus (aus dem Modi-Tab), dessen `systemPrompt` dann die Rolle liefert. Ein Default-Modus **„KI Navi"** ist bereits angelegt. Ist kein Navi-Modus gesetzt (oder leer), greift `NAVI_DEFAULT_ROLE`. Die Auflösung ist an `naviModeId` gekoppelt (`naviChat.ts`), damit ein normaler Story-Modus wie „Story-Review" nie versehentlich als Navi-Rolle einfließt. Narrow-States bekommen bewusst **keine** Rolle – das ist Teil von Schicht 1.

### Schicht 2 – Tool-Constraints (`tools?: NaviStateToolName[]`)

In Info-Gathering-States kann das LLM nur per Tool antworten – freier Text ist strukturell ausgeschlossen:

| State | Verfügbare Tools | Erzwungen? |
|---|---|---|
| `clarify_problem` | `ask_question` | ja (`tool_choice: required`) |
| `explore_software_stack` | `ask_question`, `ask_clarification` | ja (eines davon) |
| alle anderen | – | nein (freier Text) |

**`ask_question`**: Das LLM gibt Bestätigung + Frage im `response`-Feld zurück. Das Backend extrahiert den Text und streamt ihn transparent als normale Nachricht – das Frontend sieht keinen Unterschied zu freiem Text.

**`ask_clarification`**: Zeigt dem Händler vordefinierte Antwortoptionen als UI-Element. Stoppt die Verarbeitung und wartet auf Nutzereingabe.

### Schicht 3 – Output-Validierung (`validation?: { requiresQuestion: boolean }`)

Nach der Extraktion aus einem `ask_question`-Tool-Call: wenn die Antwort kein `?` enthält, wird automatisch eines angehängt. Safety-Net für Randverhalten des Modells.

---

## Klassifizierung (nach jeder Händler-Nachricht)

Nach jeder Nutzerantwort läuft ein separater, nicht-streamender LLM-Call:

1. Der Klassifizierer bekommt: aktueller State, Arbeitsplan, vollständige Gesprächshistorie, letzte Händler-Nachricht, mögliche Transitions mit Bedingungen.
2. Er antwortet **nur** mit einer Zahl (1-N = Transition, 0 = bleib im State).
3. Konservative Regel: Im Zweifel `0`. Vorwärts-Transition nur wenn Arbeitsplan vollständig UND Bedingung erfüllt.

---

## State-Summaries und Kontext-Weitergabe

Beim Verlassen eines States mit WorkPlan wird ein dritter, nicht-streamender LLM-Call gemacht:

- Input: Gesprächsauszug des abgeschlossenen States (max. 20 Zeilen), WorkPlan-Punkte
- Output: 3–6 Fakten-Stichpunkte (nur konkrete Fakten, keine Interpretationen)
- Gespeichert in: `conversation.naviResults[stateId]`

Die gesammelten Summaries aller abgeschlossenen States werden als Faktenblock in den System-Prompt jedes Folge-States injiziert:

```
Bisher herausgefundene Fakten aus früheren Gesprächsphasen:

[clarify_problem]
- Händler betreibt Blumenladen in München
- Problem: Terminabsagen per Telefon, ca. 5-8 pro Woche
- ...
```

So haben Advisory-States vollständigen Kontext ohne die gesamte Gesprächshistorie auswerten zu müssen.

---

## Fragen-Planung (`clarify_problem`)

Beim Eintritt in `clarify_problem` wird ein separater, nicht-streamender LLM-Call ausgeführt, der einen priorisierten Fragenplan erstellt:

- Input: bisheriges Gespräch, Arbeitsplan-Punkte, bereits bekannte Infos
- Output: priorisierte Liste offener Fragen (max. 5), differenziert nach Händlertyp (nur online / nur stationär / beides)
- Gespeichert in: `conversation.naviPlan`
- In den State-Prompt injiziert → steuert, was als nächstes gefragt wird

---

## Knowledge Base (nur in Advisory-States)

In `assess_situation`, `give_recommendation`, `refine_recommendation` und `explore_ai_solutions` wird ein Knowledge-Prompt injiziert:

- **Use Cases**: 5 Beratungs-Kategorien (Online-Sichtbarkeit, FAQ-Automatisierung, Kundenkommunikation, Buchhaltung, Lagerverwaltung)
- **Tools**: 12 KI-Tools, den Kategorien zugeordnet
- In `give_recommendation`, `refine_recommendation` und `explore_ai_solutions` auch Tool-Empfehlungen nach Stack-Kompatibilität

## Opt-in KI-Erkundung (`offer_ai_exploration` → `explore_ai_solutions`)

Der Primärpfad (`assess_situation` → `give_recommendation`) bleibt KI-agnostisch: Navi gibt den ehrlichsten, schlanksten Rat, ohne KI aufzudrängen. Da das Feature aber das „KI-Navi" ist, fragt Navi den Händler **einmalig** nach einer zufriedenen Empfehlung (vor `closing`), ob er gezielt KI-Tools erkunden möchte:

- `offer_ai_exploration` (persona `full`, Tool `ask_yes_no`, `tool_choice: required`): stellt die Opt-in-Frage als Ja/Nein-UI. Kein Druck; bei „Nein" → `closing`.
- `explore_ai_solutions` (persona `full`, Tool-KB injiziert): präsentiert konkrete KI-Tools passend zu Use-Case und Stack, ehrlich zu Aufwand/Kosten/Rahmen. Eine ehrliche Fehlanzeige ist erlaubt.

Overrides möglich über externe JSON-Dateien in `~/.writing-assistant/navi/`.

---

## Tip-System (`src/naviTips.ts`)

Optionale Hinweise, die Navi natürlich im Gespräch einstreuen soll – derzeit 1 Tip:

| ID | Inhalt |
|---|---|
| `ai_web_accessibility` | Webseite für KI-Assistenten (z. B. ChatGPT) auffindbar machen |

**Mechanismus:**
- Jeder Tip hat eine `instruction` (wann/wie erwähnen) und `coveredWhen`-Kriterium
- Offene Tips werden in den System-Prompt von Full-Persona-States injiziert
- Nach jeder Antwort: nicht-streamender LLM-Call prüft, ob ein Tip als „abgedeckt" gilt
- Abgedeckte Tip-IDs werden in `conversation.naviCoveredTips` gespeichert und nicht mehr injiziert

---

## Project Config Overrides (`.assistant/project.yaml`)

State-Verhalten kann pro Projekt überschrieben werden:

```yaml
naviInstructions:
  clarify_problem: "Stelle genau eine Frage auf Englisch."
naviWorkPlans:
  clarify_problem:
    - Problem konkret beschrieben
    - Häufigkeit bekannt
```

- `naviInstructions`: Ersetzt die Standard-Instruction eines States vollständig
- `naviWorkPlans`: Ersetzt die Standard-WorkPlan-Punkte eines States

Diese Overrides greifen zur Laufzeit und haben Vorrang vor den Defaults in `src/naviStateMachine.ts`.

---

## Ablauf pro Händler-Nachricht (technisch)

```
Händler schickt Nachricht
  │
  ├─ Call 1: Klassifizierung (nicht-streamend, max. 5 Tokens)
  │   → newStateId bestimmt
  │
  ├─ Call 2: State-Summary (nur bei Transition + WorkPlan, nicht-streamend, max. 200 Tokens)
  │   → Summary für abgeschlossenen State gespeichert
  │
  ├─ navi_state Event → Frontend aktualisiert State-Anzeige
  │
  └─ Call 3: Hauptantwort (streamend)
      → System-Prompt: persona (narrow/full) + naviResults-Kontext + State-Instruction
      → Tools: state-spezifisch (ask_question erzwungen in Info-States)
      → Bei ask_question: Backend extrahiert Antwort, streamt als normaler Text
      → Bei ask_clarification: Optionen-UI, wartet auf Händler
```

---

## Simulations-Modus

Navi kann automatisiert getestet werden: Ein simulierter Händler antwortet nach jedem Navi-Turn automatisch. Nach Abschluss wird das Gespräch bewertet (Score 0–100, Stärken, Schwächen, Verbesserungsvorschläge).

---

## Relevante Dateien

| Datei | Inhalt |
|---|---|
| `src/naviStateMachine.ts` | State-Definitionen – das *Was* jeder Phase (Quelle der Wahrheit) |
| `electron/services/conversation/naviVoice.ts` | Zentrale Navi-Stimme – das *Wie* der Kommunikation (Persona-Regeln) |
| `src/components/chat/naviStateMachineClient.ts` | Client-seitige State-Labels für die UI |
| `src/components/chat/NaviStatePanel.tsx` | State-Fortschritts-Panel mit Ergebnis-Anzeige |
| `electron/services/naviStateMachine.ts` | Backend-Wrapper: Klassifizierungs- und Summary-Prompts |
| `electron/services/chatService.ts` | Kern-Logik: Klassifizierung, Summary, Hauptantwort |
| `electron/services/naviKnowledgeBase.ts` | Use Cases und Tools für Advisory-States |
| `src/naviUseCases.ts` | Use-Case-Definitionen |
| `src/naviTools.ts` | Tool-Definitionen |
| `src/naviTips.ts` | Tip-Definitionen (optionale Hinweise) |
| `src/components/chat/naviGreetingKickoff.ts` | Scheduling der ersten Navi-Begrüßungsnachricht |
| `electron/services/projectConfigService.ts` | Liest `.assistant/project.yaml`-Overrides für States |

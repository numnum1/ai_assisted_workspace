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
  ├─→ refine_recommendation  (Einwände / Fragen)
  └─→ closing                (zufrieden)

refine_recommendation
  ├─→ refine_recommendation  (weitere Einwände)
  ├─→ give_recommendation    (komplett neuer Ansatz nötig)
  └─→ closing                (zufrieden)

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

## Knowledge Base (nur in Advisory-States)

In `assess_situation`, `give_recommendation` und `refine_recommendation` wird ein Knowledge-Prompt injiziert:

- **Use Cases**: 5 Beratungs-Kategorien (Online-Sichtbarkeit, FAQ-Automatisierung, Kundenkommunikation, Buchhaltung, Lagerverwaltung)
- **Tools**: 12 KI-Tools, den Kategorien zugeordnet
- In `give_recommendation` und `refine_recommendation` auch Tool-Empfehlungen nach Stack-Kompatibilität

Overrides möglich über externe JSON-Dateien in `~/.writing-assistant/navi/`.

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
| `src/naviStateMachine.ts` | State-Definitionen (Quelle der Wahrheit) |
| `src/components/chat/naviStateMachineClient.ts` | Client-seitige State-Labels für die UI |
| `src/components/chat/NaviStatePanel.tsx` | State-Fortschritts-Panel mit Ergebnis-Anzeige |
| `electron/services/naviStateMachine.ts` | Backend-Wrapper: Klassifizierungs- und Summary-Prompts |
| `electron/services/chatService.ts` | Kern-Logik: Klassifizierung, Summary, Hauptantwort |
| `electron/services/naviKnowledgeBase.ts` | Use Cases und Tools für Advisory-States |
| `src/naviUseCases.ts` | Use-Case-Definitionen |
| `src/naviTools.ts` | Tool-Definitionen |

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

### Arbeitsplan-Gate → Slot-Checkliste (deterministisch)

Jeder Punkt im `workPlan` eines narrow-Persona-States (`clarify_problem`, `explore_software_stack`, `explore_investment`) wird zu einem **Slot** mit stabiler id (`slugifySlotLabel`, `src/naviStateMachine.ts`). Das Modell trägt Werte über das Tool `update_facts` selbst ein – **in jedem Turn**, nicht nur bei einem State-Wechsel. Der Wechsel in die nächste Phase (`advance_phase`-Tool) wird vom Backend **deterministisch** geprüft: er gelingt nur, wenn für den aktuellen State jeder Slot einen Wert im Fakten-Blatt hat (`allSlotsFilled`, siehe unten). Es gibt keine zweite Instanz, die das per Prosa-Interpretation nochmal einschätzt.

Beispiel `clarify_problem`:
- Problem konkret beschrieben (nicht nur benannt)
- Problem-Typ/Ursache klar

Full-Persona-States (`assess_situation`, `give_recommendation`, …) haben kein Slot-Gate – ihre Übergänge werden weiterhin vollständig vom Klassifizierer entschieden (siehe unten), genau wie schon vor diesem Umbau.

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

## Redirect-Klassifizierer (Sicherheitsnetz für Ausnahmen)

Früher lief bei jeder Nachricht ein Klassifizierer, der über den kompletten State-Übergang entschied (inkl. „ist der Arbeitsplan vollständig?"). Das ist jetzt in zwei getrennte Mechanismen aufgeteilt:

- **Vorwärtsgang** (alle Slots eines narrow States bekannt → nächste Phase): deterministisch, siehe Slot-Checkliste oben. Kein LLM-Urteil nötig.
- **Ausnahmen/Redirects** (Themenwechsel, „das war ein Missverständnis", Zufriedenheits-/Einwand-Erkennung in Full-Persona-States): ein schlanker, nicht-streamender Klassifizierer-Call (`buildRedirectClassifierPrompt`, `electron/services/naviStateMachine.ts`), der **nur** die nicht slot-förmigen Transitions eines States prüft. Für narrow States mit Slot-Gate ist das nur die zweite (Ausnahme-)Transition; für Full-Persona-States (kein Slot-Gate) bleiben es weiterhin alle Transitions – hier entscheidet der Klassifizierer wie schon zuvor allein.
- Läuft parallel zur (spekulativ gestarteten) Hauptantwort; meldet er einen Wechsel, wird die spekulative Antwort verworfen und die Hauptantwort in der neuen Phase neu gestartet.

---

## Live-Fakten-Blatt (`NaviFacts`) statt Plan/Kontext-Snapshots

Der frühere Aufbau (separate, gefensterte Calls für Fragenplan und Fakten-Extraktion, beide nur bei State-Wechsel bzw. mit einem 10-/20-Zeilen-Gesprächsausschnitt) ist ersetzt durch **ein** Fakten-Objekt (`NaviFacts`, `src/types.ts`), das das Modell selbst per Tool-Call **in jedem Turn** pflegt:

```ts
interface NaviFacts {
  slots: Record<string, string>;   // slotId -> Wert, über ALLE Phasen hinweg akkumuliert
  currentProblem?: string;
  hypothesis?: string;
  problemQueue: string[];
  recommendation?: string;
  notes?: string;
}
```

- **`update_facts`**-Tool: still (nicht sichtbar für den Händler), das Modell ruft es auf, sobald die letzte Nachricht auch nur eine Kleinigkeit Neues enthält – bevor es antwortet oder die Phase wechselt.
- Das volle, aktuelle Fakten-Blatt (nicht nur ein Ausschnitt) wird in **jeden** System-Prompt injiziert – zusammen mit der Slot-Checkliste der aktuellen Phase (gefüllt/offen).
- **`advance_phase`**-Tool (nur narrow States mit Slots): siehe Slot-Gate oben.
- Ergebnis: kein Fenster mehr, das Fakten abschneiden kann, und keine Verzögerung zwischen „Händler sagt etwas" und „Fakten-Blatt weiß es".
- Event ans Frontend: `navi_facts` (ersetzt die früheren `navi_context`/`navi_plan`/`navi_problems`-Events), gespeichert als `conversation.naviFacts`.

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
  ├─ Speculative Fetch startet SOFORT für die aktuelle Phase (Tools: update_facts,
  │   advance_phase falls Slot-State, sichtbare Antwort-Tools)
  │
  ├─ Parallel: Redirect-Klassifizierer prüft Ausnahme-Transitions (nicht-streamend)
  │   → bei Redirect: spekulative Antwort verworfen, neue Antwort in der Zielphase gestartet
  │   → sonst: spekulative Antwort wird verwendet
  │
  ├─ navi_step / navi_state Events → Frontend aktualisiert Status-Anzeige
  │
  └─ Runden-Schleife (max. 4, electron/services/conversation/naviChat.ts):
      1. Modell antwortet mit Tool-Call(s): update_facts (Fakten-Blatt aktualisieren),
         advance_phase (Phasenwechsel, deterministisch gegen Slot-Checkliste geprüft),
         und/oder sichtbares Antwort-Tool (ask_question/ask_clarification/ask_yes_no)
         bzw. freier Text (Full-Persona ohne erzwungenes Tool)
      2. Stille Tool-Calls werden sofort ausgeführt (Fakten-Blatt/Phase aktualisiert,
         navi_facts/navi_state Events emittiert); ohne sichtbare Antwort läuft die
         Schleife mit frisch gerendertem Prompt weiter
      3. Sobald ein sichtbares Antwort-Tool oder freier Text vorliegt: Turn endet (`done`)
```

---

## Simulations-Modus

Navi kann automatisiert getestet werden: Ein simulierter Händler antwortet nach jedem Navi-Turn automatisch. Nach Abschluss wird das Gespräch bewertet (Score 0–100, Stärken, Schwächen, Verbesserungsvorschläge).

---

## Relevante Dateien

| Datei | Inhalt |
|---|---|
| `src/naviStateMachine.ts` | State-Definitionen (das *Was* jeder Phase) **plus** Slot-Helper (`slugifySlotLabel`, `getEffectiveSlots`, `allSlotsFilled`, `getAllSlotLabels`) — von Backend und Frontend-Panel gemeinsam genutzt |
| `electron/services/conversation/naviVoice.ts` | Zentrale Navi-Stimme – das *Wie* der Kommunikation (Persona-Regeln) |
| `electron/services/conversation/naviChat.ts` | Kern-Logik: Turn-Loop, Fakten-Blatt-Rendering, `update_facts`/`advance_phase`-Tools, Redirect-Klassifizierer |
| `electron/services/naviStateMachine.ts` | Re-exportiert die Slot-Helper aus `src/naviStateMachine.ts` + `buildRedirectClassifierPrompt` |
| `src/components/chat/naviStateMachineClient.ts` | Client-seitige State-Labels für die UI |
| `src/components/chat/NaviStatePanel.tsx` | State-Fortschritts-Panel: Slot-Checkliste der aktuellen Phase + akkumulierte Faktenlage |
| `electron/services/naviKnowledgeBase.ts` | Use Cases und Tools für Advisory-States |
| `src/naviUseCases.ts` | Use-Case-Definitionen |
| `src/naviTools.ts` | Tool-Definitionen |
| `src/naviTips.ts` | Tip-Definitionen (optionale Hinweise) |
| `src/components/chat/naviGreetingKickoff.ts` | Scheduling der ersten Navi-Begrüßungsnachricht |
| `electron/services/projectConfigService.ts` | Liest `.assistant/project.yaml`-Overrides für States (`naviInstructions`, `naviWorkPlans` — Letzteres liefert jetzt auch die Slot-Labels) |

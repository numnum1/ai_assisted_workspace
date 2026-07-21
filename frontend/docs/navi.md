# Navi – Funktionsweise

Navi ist ein KI-gestützter Beratungs-Assistent für Einzelhändler. Er führt strukturierte Gespräche, um herauszufinden ob und wie KI dem Händler konkret helfen kann – ohne etwas zu verkaufen.

---

## Gesprächsfluss (State Machine)

Navi arbeitet als Zustandsautomat mit 8 States. Das Modell wählt den Übergang zwischen States selbst per Tool-Aufruf (`advance_phase`); für Sammel-Phasen mit Arbeitsplan prüft das Backend zusätzlich deterministisch, ob alle Slots gefüllt sind (siehe unten).

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

Jeder Punkt im `workPlan` eines Sammel-States (`clarify_problem`, `explore_software_stack`, `explore_investment`) wird zu einem **Slot** mit stabiler id (`slugifySlotLabel`, `src/naviStateMachine.ts`). Das Modell trägt Werte über das Tool `update_facts` selbst ein – **in jedem Turn**, nicht nur bei einem State-Wechsel. Das Modell wählt Phasenübergänge selbst über das Tool `advance_phase({ to })`; für den **primären Vorwärts-Übergang** (Index 0 der `transitions`) eines States mit nicht-leerem `workPlan` prüft das Backend zusätzlich **deterministisch**, ob jeder Slot einen Wert im Fakten-Blatt hat, bevor der Wechsel akzeptiert wird (`openSlots`, siehe unten). Es gibt keine zweite Instanz, die das per Prosa-Interpretation nochmal einschätzt.

Beispiel `clarify_problem`:
- Problem konkret beschrieben (nicht nur benannt)
- Problem-Typ/Ursache klar

States ohne `workPlan` (`assess_situation`, `give_recommendation`, …) haben kein Slot-Gate – jeder ihrer Übergänge wird sofort akzeptiert, sobald das Modell `advance_phase` mit dem passenden Ziel aufruft.

---

## Ein Hauptcall pro Turn (Stand seit Grok 4.5)

Bis Grok 4.3 folgte das Modell einem längeren Arbeitsplan nicht zuverlässig – deshalb liefen pro Nachricht mehrere LLM-Calls: ein separater Redirect-Klassifizierer parallel zu einer spekulativ gestarteten Hauptantwort, erzwungenes `tool_choice: "required"` in Info-States, und eine „Narrow-Persona", die dem Modell in Sammel-Phasen die Berater-Identität vorenthielt. Mit einem planfähigeren Modell entfällt diese Kleinteiligkeit: **ein** Call pro Runde genügt. Das Modell trägt Fakten ein (`update_facts`), entscheidet Phasenübergänge selbst (`advance_phase({ to })`) und erzeugt die sichtbare Antwort – alles im selben Aufruf.

Bewusst erhalten bleiben zwei billige, deterministische Garantien – das sind keine Modell-Workarounds, sondern Struktur-Garantien unabhängig von der Modellqualität:

- **Slot-Gate** (siehe oben): verhindert vorzeitiges Weiterschalten in Sammel-Phasen.
- **Strukturierte State/Facts-Emission** (`navi_state`, `navi_facts`): UI-Contract für Statuspanel und Simulation.

Alle States nutzen dieselbe volle Berater-Persona (`persona.roleIntro` + `fullPersonaRules`) – die frühere Narrow-Persona und das erzwungene `tool_choice` für Info-States sind entfallen. `ask_clarification` und `ask_yes_no` bleiben als **optionale** Werkzeuge verfügbar, wo States sie deklarieren; das Modell nutzt sie laut Persona-Regel, ohne dazu gezwungen zu sein. Das `ask_question`-Werkzeug (samt automatischem Anhängen eines „?") ist entfallen; ehemalige Info-Phasen antworten jetzt im normalen Fließtext.

## Phasenübergänge – modellgetrieben (früher: separater Redirect-Klassifizierer)

Das Modell entscheidet Übergänge direkt im Hauptcall über `advance_phase({ to: "<ziel-state>" })`. Der System-Prompt listet dazu alle möglichen Ziele des aktuellen States mit ihrer Bedingung (`renderTransitionOptions`, `naviChat.ts`). Das Backend validiert nur:

- **`to` muss ein deklariertes Übergangsziel des aktuellen States sein** – sonst wird der Versuch abgelehnt und protokolliert (`navi_trace.advancePhaseAttempts`).
- **Slot-Gate** greift ausschließlich beim primären Vorwärts-Übergang (Index 0) eines States mit nicht-leerem `workPlan`.
- Jeder andere Übergang (Themenwechsel, Missverständnis, Zufriedenheit, Einwand, …) wird sofort akzeptiert, sobald das Modell ihn wählt.

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
- **`advance_phase`**-Tool: bei States mit nicht-leerem `workPlan` (Slots) greift beim primären Vorwärts-Übergang das Slot-Gate, siehe oben.
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

- `offer_ai_exploration` (Tool `ask_yes_no` verfügbar, aber seit dem Wegfall von `tool_choice: required` nicht mehr erzwungen – das Modell nutzt es laut Persona-Regel „IMMER ask_yes_no()"): stellt die Opt-in-Frage als Ja/Nein-UI. Kein Druck; bei „Nein" → `closing`.
- `explore_ai_solutions` (Tool-KB injiziert): präsentiert konkrete KI-Tools passend zu Use-Case und Stack, ehrlich zu Aufwand/Kosten/Rahmen. Eine ehrliche Fehlanzeige ist erlaubt.

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
  └─ Runden-Schleife (max. 4, electron/services/conversation/naviChat.ts), Runde 0 startet sofort:
      1. Modell antwortet mit Tool-Call(s): update_facts (Fakten-Blatt aktualisieren),
         advance_phase({ to }) (Phasenwechsel – Ziel muss gültig sein; Slot-Gate greift nur
         beim primären Vorwärts-Übergang eines States mit workPlan),
         und/oder sichtbares Antwort-Tool (ask_clarification/ask_yes_no)
         bzw. freier Text (kein Tool erzwungen)
      2. Stille Tool-Calls (update_facts/advance_phase) werden sofort ausgeführt
         (Fakten-Blatt/Phase aktualisiert, navi_facts/navi_state Events emittiert);
         ohne sichtbare Antwort läuft die Schleife mit frisch gerendertem Prompt
         (neue Phase + aktualisiertes Fakten-Blatt) weiter
      3. Sobald ein sichtbares Antwort-Tool oder freier Text vorliegt: Turn endet (`done`)
```

Kein separater Klassifizierer-Call, keine Spekulation, kein `navi_step`-Event mehr – ein Fetch pro Runde.

---

## Profile

Die gesamte editierbare Navi-Konfiguration (States, Tips, Persona, Use-Cases, Tools) gehört einem **Profil**. Das aktive Profil wählt man im Dropdown oben im `NaviStatePanel`.

```
~/.writing-assistant/navi/
  profiles.json                  # { activeProfileId, profiles: [{ id, name, createdAt, updatedAt }] }
  profiles/<id>/states.json      # + tips.json, persona.json, use-cases.json, tools.json
  improvement-llm.json           # global, NICHT Teil eines Profils (enthält einen API-Key)
```

- **„Marc"** (id `marc`) ist das ausgelieferte Standardprofil. Es hat **kein Verzeichnis**: solange es aktiv ist, liefert jeder Loader die `DEFAULT_NAVI_*`-Konstanten aus dem Quellcode, und jeder Schreibversuch wird abgelehnt. Es ist nicht umbenennbar und nicht löschbar.
- **Auto-Fork:** Speichern im Editor, während „Marc" aktiv ist, legt automatisch „Marc (Kopie)" an, aktiviert es und schreibt dorthin. Der Auslieferungsstand bleibt so garantiert unberührt.
- Innerhalb eines Profils bleibt jede Datei ein *Override*: fehlt sie, gilt der codierte Default. „Standard" im Editor löscht also nur die Override-Datei.
- **Austauschformat** für Import/Export (native Electron-Dialoge, `naviProfileTransfer.ts`):
  ```json
  { "kind": "navi-profile", "version": 1, "name": "…", "states": [], "tips": [], "persona": {}, "useCases": [], "tools": [] }
  ```
  Beim Import laufen alle fünf Domains durch dieselben `validate*`-Funktionen wie die Speichern-Buttons; erst danach entsteht ein neues lokales Profil.
- **Migration:** Liegen noch Konfigdateien direkt in `navi/` (Stand vor den Profilen), werden sie beim ersten Zugriff in ein Profil „Eigenes Profil" verschoben und dieses aktiviert.
- Im Dev-Web-Modus (ohne Electron) spiegelt `src/electron/bridge.ts` dasselbe Modell in `localStorage` mit pro Profil namensraumierten Keys; Import/Export gibt es dort nicht.

---

## Simulations-Modus

Navi kann automatisiert getestet werden: Ein simulierter Händler antwortet nach jedem Navi-Turn automatisch. Nach Abschluss wird das Gespräch bewertet (Score 0–100, Stärken, Schwächen, Verbesserungsvorschläge).

---

## Relevante Dateien

| Datei | Inhalt |
|---|---|
| `src/naviStateMachine.ts` | State-Definitionen (das *Was* jeder Phase) **plus** Slot-Helper (`slugifySlotLabel`, `getEffectiveSlots`, `allSlotsFilled`, `getAllSlotLabels`) — von Backend und Frontend-Panel gemeinsam genutzt |
| `src/naviPersona.ts` | Zentrale Navi-Stimme – Rolle (`roleIntro`) + Verhaltensregeln (`fullPersonaRules`), auf jeden State angewendet |
| `electron/services/conversation/naviChat.ts` | Kern-Logik: Turn-Loop (ein Call pro Runde), Fakten-Blatt-Rendering, `update_facts`/`advance_phase`-Tools inkl. Transitions-Validierung + Slot-Gate |
| `electron/services/naviStateMachine.ts` | Re-exportiert die Slot-Helper aus `src/naviStateMachine.ts` |
| `src/components/chat/naviStateMachineClient.ts` | Client-seitige State-Labels für die UI |
| `src/components/chat/NaviStatePanel.tsx` | State-Fortschritts-Panel: Slot-Checkliste der aktuellen Phase + akkumulierte Faktenlage |
| `electron/services/naviKnowledgeBase.ts` | Use Cases und Tools für Advisory-States |
| `src/naviProfile.ts` | Profil-Typen + Konstanten (`NAVI_BUILTIN_PROFILE_ID`), von Main und Renderer geteilt |
| `electron/services/naviProfileStore.ts` | Profil-Index, Pfadauflösung pro aktivem Profil, Schreibschutz für „Marc", Legacy-Migration |
| `electron/services/naviProfileTransfer.ts` | Import/Export via nativer Datei-Dialoge inkl. Validierung |
| `src/components/chat/NaviProfileBar.tsx` | Profil-Dropdown mit Neu/Duplizieren/Umbenennen/Löschen/Import/Export |
| `src/naviUseCases.ts` | Use-Case-Definitionen |
| `src/naviTools.ts` | Tool-Definitionen |
| `src/naviTips.ts` | Tip-Definitionen (optionale Hinweise) |
| `src/components/chat/naviGreetingKickoff.ts` | Scheduling der ersten Navi-Begrüßungsnachricht |
| `electron/services/projectConfigService.ts` | Liest `.assistant/project.yaml`-Overrides für States (`naviInstructions`, `naviWorkPlans` — Letzteres liefert jetzt auch die Slot-Labels) |

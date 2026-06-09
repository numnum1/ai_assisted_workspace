# Problem: KI hält Gesprächsergebnisse nicht zuverlässig in der Wiki fest

> Diskussionsgrundlage zum Mitnehmen in eine neue Prompt.

## Ziel

Ein Buch schreiben, indem ich mit der KI über Ideen **chatte** — und sobald wir zu
Ergebnissen kommen, soll die KI diese **selbstständig und automatisch in der Wiki
festhalten** (analog zum Programmieren: erst besprechen, dann persistieren). Aktuell
bin ich mit der LLM-Hilfe unzufrieden, weil das Festhalten nicht zuverlässig passiert.

## Wie das Programm funktioniert (relevante Fakten)

- **App**: Electron + React Markdown-Editor/AI-Workspace. AI-Integration ist
  provider-agnostisch (OpenAI-kompatibel), Streaming über Electron Main-Prozess.
- **Persistenz-Tools existieren bereits** und sind funktionsfähig:
  - `write_file` / `edit_file` → schreiben überall hin, inkl. `wiki/`-Markdown-Dateien
  - `journal_log(type)` → Typen `KANON` (bestätigt), `NEU` (neue Entität),
    `IDEE` (Spekulation, **nicht** Kanon), `WIDERSPRUCH`
  - `flag_conflict` → Widerspruch protokollieren, ohne Wiki zu überschreiben
  - `create_artifact` → Zwischenstände, die im Chat bleiben (nicht persistiert)
  - `semantic_search`, `read_file`
- **Wiki**: reine Markdown-Dateien unter `wiki/` (keine DB). Konvention: eine Datei
  pro Entität in Kategorie-Ordnern (`wiki/characters/`, `wiki/locations/`, …),
  kebab-case, Frontmatter mit `id/type/aliases/tags/summary`.
- **System-Prompt** (`electron/services/conversation/systemPrompt.ts`) ist geschichtet:
  1. Modus-Prompt (nur Persona/Aufgaben-Framing)
  2. **`ARBEITSWEISE`-Block** (baseline, modus-unabhängig) — sagt bereits: Chat ist
     flüchtig, Dauerhaftes ins Wiki/Journal, *"Sobald ein Thema rund ist: Kanon ins
     Wiki übertragen"*
  3. Datum, KI-Regeln, Projektkontext, aktive Tools, ggf. Steuerungsplan
- **Modi** (`projectConfigService.ts`, `DEFAULT_MODES`) personalisieren **nur** das
  Framing. Vorhandene Schreib-Modi (`entwickeln`, `brainstorm`, `review`) haben
  generische Prompts ("stelle Fragen, biete Alternativen") — **keine** Steuerung
  Richtung speicherbarer Ergebnisse.
- **Geführte Sitzungen** (`sessionKind: "guided"`) existieren: KI arbeitet entlang
  eines Steuerungsplans ab, kann via `propose_guided_thread` Sub-Threads aufmachen
  und via `report_thread_result` zurückmelden.

## Diagnose

Die **Infrastruktur ist komplett** — das Problem ist Verhaltenssteuerung:

1. Der Persistenz-Trigger ist **implizit** ("sobald ein Thema rund ist") und verlangt
   Urteilsvermögen, *wann* etwas Kanon ist. Im kreativen Gesprächsfluss erkennt die KI
   diese Übergänge nicht zuverlässig und chattet weiter, ohne zu speichern.
2. Kein Modus führt das Gespräch aktiv **hin zu** konkreten, abgrenzbaren Ergebnissen
   (offen vs. entschieden).

## Wichtige Randbedingung

- **Modell ist Grok 5.3** (xAI), nicht Claude. → Schwächeres/variableres
  Instruction-Following bei **impliziten** Tool-Triggern zu erwarten. Lösung sollte
  auf **explizite, regelbasierte Checks** statt auf Ermessen setzen.

## Lösungsrichtungen (zu besprechen)

- **A — Prompt**: Neuer Modus "Buchentwicklung" mit explizitem Nach-jeder-Antwort-Check
  (Charakter/Ort/Plot/Theme erwähnt? → sofort speichern) statt Ermessens-Trigger.
- **B — Struktur**: "Sitzung abschließen"-Aktion, die einen `guided`-Thread startet,
  der das Chat-Protokoll systematisch in die Wiki überführt (robuster bei variablem
  Tool-Calling, weil Kontext fokussiert).

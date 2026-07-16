# Idee: Struktur-Metadaten (Kapitel/Szene/Buch) als Wiki-Einträge führen

> Die durchgearbeitete Empfehlung steht am Ende unter **„Empfehlung (Konzept)"**;
> die ursprüngliche Analyse darüber unverändert.
>
> **Teilweise umgesetzt:** Die Tier-2-Delivery (Kapitel-/Szenen-`description` und
> Buch-`synopsis` fließen in den BUCHSTRUKTUR-Block des System-Prompts) ist
> zusammen mit dem [Buchstruktur-Manifest](buch-struktur-manifest.md) live —
> siehe `buildBookChapterIndex` in `projectContext.ts`. Damit ist das
> ursprüngliche Feature („KI kennt einen Abschnitt ohne Volltext") reaktiviert.
> Der weitergehende Schritt (Nodes als *verlinkbare* Wiki-Entitäten) ist bewusst
> noch offen.

## Ursprüngliches Ziel

Das allererste Feature dieses Projekts: Kapitel/Szenen bekommen eine **Beschreibung**,
damit die KI weiß, worum es in einem Abschnitt geht, **ohne den vollen Text lesen zu
müssen**. Nach längerer Entwicklung ist nicht mehr klar, ob und wie dieser Mechanismus
noch greift.

## Aktueller Zustand (Ist-Stand, siehe Analyse in dieser Konversation)

Es existieren aktuell **drei unabhängige, kaum verzahnte Systeme**:

1. **Struktur-Metadaten** — Sidecar-JSON pro Node (`kapitel.json`, `szene.json`,
   `akt.json`, `book.json` unter `.project/chapter/…`), Felder je nach Schema
   (`title`, `description`, `synopsis`, `extras` wie `location`/`goal`/`characters`).
   Bearbeitbar über `MetaPanel.tsx`.
2. **Wiki** (`wiki/**/*.md`) — freie Markdown-Seiten mit Frontmatter
   (`id/type/aliases/tags/summary`), organisiert in Kategorie-Ordnern
   (`wiki/characters/`, `wiki/locations/`, …). Wird als kompakter Index
   (`WIKI-BESTAND`) in jeden System-Prompt injiziert und ist damit der **einzige**
   der drei Wege, der tatsächlich zuverlässig bei der KI ankommt.
3. **Arc-Workspace** (`.assistant/arcs/{arcs,timeline}.json`) — Spannungsbögen-Tracking,
   gerade erst begonnen, noch kein KI-Anbindungspunkt.

**Befund**: `description` (Kapitel/Szene/Akt/Buch) und `synopsis` (Buch, explizit als
"für KI" beschriftet) werden zwar gespeichert und im UI angezeigt, aber beim
Prompt-Aufbau (`projectContext.ts`) nirgends ausgelesen — aus Sicht der KI sind diese
Felder **tot**. Nur `title`/`sortOrder` fließen (für die reine Buchstruktur/Outline)
in den Kontext ein. Szenen-`extras` werden zwar gelesen, aber nur vom separaten
Ensemble-Feature (Szenen-Playout), nicht vom Haupt-Chat.

Das Wiki wiederum hat ein bekanntes eigenes Problem
([wiki-persistenz-problem.md](wiki-persistenz-problem.md)): die KI trägt
Gesprächsergebnisse nicht zuverlässig selbstständig ein, weil der Trigger dafür
implizit ist ("sobald ein Thema rund ist").

## Die Idee

**Kapitel-/Szenen-/Buch-Metadaten nicht als separates JSON-Feld führen, sondern
selbst als Wiki-Eintrag** — also als echte `.md`-Datei unter `wiki/`, mit
Frontmatter (`summary`, ggf. `aliases`/`tags`) und Freitext-Inhalt.

Das ist naheliegend, weil das Wiki technisch nichts anderes ist als "jede `.md`-Datei
unter `wiki/`, gruppiert nach oberstem Ordnernamen" (`wikiService.ts`,
`buildWikiIndex`). Es gibt kein festes Entity-Typ-Register — eine Kapitelseite wäre
strukturell nicht anders als eine Charakter- oder Ortsseite. Sobald die Datei existiert,
erscheint sie automatisch im `WIKI-BESTAND`-Index, den die KI bei jeder Anfrage sieht,
und kann bei Bedarf gezielt nachgelesen werden — genau der ursprünglich gewünschte
Mechanismus ("Inhalt kennen, ohne den Text zu lesen").

### Vorteil

- Ein einziger, bereits funktionierender Übertragungsweg zur KI statt zwei
  (Struktur-Metadaten-Pfad reaktivieren *und* Wiki-Pfad pflegen).
- Kapitel-Beschreibung wird technisch zu "kanonischem Wissen über diesen Abschnitt" —
  passt konzeptionell zum Wiki-Gedanken (dauerhafte Fakten vs. flüchtiger Chat).
- Kapitel könnten wie andere Entitäten per `@[Titel](wiki/kapitel/…)` aus Chat, Wiki
  oder anderen Metadaten heraus verlinkt werden (analog zu `arcRefs`/`Charactere`
  heute).

### Offene Fragen (zu klären, bevor das umgesetzt wird)

1. **Sync-Modell: automatisch oder manuell?**
   - *Automatisch*: Jedes Kapitel/jede Szene bekommt beim Anlegen automatisch eine
     gespiegelte Wiki-Datei (z. B. `wiki/kapitel/<id>.md`); Bearbeiten im gewohnten
     MetaPanel schreibt synchron in diese Datei durch. Löst das ursprüngliche Problem
     am direktesten, weil sich für den Nutzer nichts ändert.
   - *Manuell*: Nutzer verlinkt bewusst eine Wiki-Seite (wie heute schon bei
     `Charactere`/`wikilist`) — Beschreibung und Wiki-Inhalt bleiben getrennte Dinge,
     mehr Aufwand, mehr Kontrolle.
2. **Was bleibt in der JSON-Sidecar-Struktur?** Vermutlich `title`/`sortOrder`
   (rein strukturell fürs Outliner, nicht KI-relevant), während `description`/
   `synopsis` komplett ins Wiki wandern. Oder löst sich das Node-Meta-Konzept
   perspektivisch ganz auf?
3. **Quelle der Wahrheit**: Bleibt das MetaPanel die Bearbeitungsoberfläche (mit
   Hintergrund-Sync ins Wiki), oder wird die Wiki-Datei selbst zur primären Ansicht
   und das MetaPanel zeigt nur noch Link/Vorschau?
4. **Identität/Pfad-Konvention**: Wie wird der Node (Kapitel-/Szenen-ID) stabil mit
   seiner Wiki-Datei verknüpft — über deterministischen Pfad (`wiki/kapitel/<id>.md`)
   oder über ein Referenzfeld wie bei `arcRefs`?
5. **Bestehende `extras`-Felder** (Szenen: `location`, `goal`, `characters`, …, aktuell
   nur vom Ensemble-Feature genutzt) — wandern die mit ins Wiki, oder bleiben sie
   strukturiert in der JSON, weil sie für Ensemble als typisierte Felder gebraucht
   werden (nicht als Freitext)?
6. **Löschen/Umbenennen**: Wenn ein Kapitel gelöscht/verschoben wird — wird die
   gespiegelte Wiki-Datei automatisch mitgelöscht/verschoben, oder bleibt sie als
   Waisenkind stehen?

## Nicht Teil dieser Idee

- Das Arc-Workspace-System bleibt unabhängig; keine Aussage hier, ob/wie
  Spannungsbögen später ähnlich behandelt werden sollten.
- Das Wiki-Persistenz-Problem (KI trägt Chat-Ergebnisse nicht zuverlässig ein) ist
  ein separates, ungelöstes Thema und wird durch diese Idee nicht automatisch
  gelöst — sie betrifft nur den strukturellen Metadaten-Pfad, nicht den
  Chat-zu-Wiki-Pfad.

---

## Empfehlung (Konzept)

### Die entscheidende Verfeinerung: nicht *ein Speicher*, sondern *ein Zustellweg*

Die ursprüngliche Idee lautet „Metadaten **als** Wiki-Datei" (gemeinsamer
*Speicher*). Bei genauer Betrachtung der Felder ist das zu grob. Die Node-Felder
zerfallen in **drei Tiers mit unterschiedlichem Zweck**:

1. **Strukturell** — `title`, `sortOrder`. Steuern Outliner-Reihenfolge und
   Baum-Identität. Kein KI-Wissen im eigentlichen Sinn (nur der Titel dient als
   Label). Gehören **nicht** ins Wiki.
2. **Narrativer Freitext** — `description` (Kapitel/Szene/Akt), `synopsis` (Buch).
   Prosa über Absicht/Inhalt eines Abschnitts. **Genau das**, was die KI mit wenig
   Kontext braucht — und aktuell tot ist. Das ist der Anteil, der konzeptionell ins
   Wiki-Denken passt („kanonisches Wissen über diesen Abschnitt").
3. **Typisierte Struktur-Felder** — Szenen-`extras`: `location`, `time`,
   `characters`, `initial_situation`, `goal`, `outcome`, `pov`, `tone`, `arcRefs`;
   Buch-`Charactere` (Wiki-Links). Diese werden **maschinell** ausgewertet: das
   Ensemble-Feature baut daraus seinen Szenen-Kontext
   (`sceneContextFromMeta` in `MetaPanel.tsx`), `arcRefs` verknüpft mit dem
   Arc-System, `characters`/`Charactere` sind getippte `@[Name](wiki/…)`-Links.
   Als Wiki-Freitext wären sie **kaputt** — sie müssen typisiert im JSON bleiben.

**Folgerung:** „Alles ins Wiki" ist falsch, weil es Tier 3 zerstört. Richtig ist:
Nur **Tier 2** soll über **denselben KI-Zustellweg** laufen wie das Wiki — also
in denselben injizierten Index kommen und per `read_file` lesbar sein. Der
Speicher darf heterogen bleiben (Wiki = `.md`, Node = `.json`); vereinheitlicht
wird der **KI-zugewandte Vertrag** (eine Bestandsliste im System-Prompt + Volltext
bei Bedarf), nicht das Dateiformat.

Damit wird aus „Metadaten *als* Wiki-Datei" → „Metadaten über den *gleichen
Mechanismus* wie das Wiki". Das ist die eigentliche Absicht („beide über die
gleichen Mechanismen") und vermeidet die teuren Nebenwirkungen der Storage-Spiegelung.

### Antworten auf die offenen Fragen

1. **Sync-Modell — automatisch oder manuell?**
   **Weder noch: kein zweites Artefakt, kein Sync.** `description`/`synopsis`
   bleiben Single-Source im JSON. Die Vereinheitlichung passiert im Delivery-Layer
   (`projectContext.ts` beim Prompt-Aufbau), nicht im Storage. Damit entfällt das
   gesamte Sync-Problem und jede Race-Condition zwischen zwei Dateien.
2. **Was bleibt im JSON?** **Alles bleibt im JSON** — `title`/`sortOrder`
   (Tier 1) *und* `description`/`synopsis` (Tier 2) *und* die typisierten `extras`
   (Tier 3). Das Node-Meta-Konzept löst sich **nicht** auf. Neu ist allein, dass
   Tier 2 zusätzlich in den KI-Index einfließt.
3. **Quelle der Wahrheit / Bearbeitung?** Das **MetaPanel bleibt** die einzige
   Bearbeitungsoberfläche. Keine zweite Wiki-Ansicht, kein Durchschreiben.
4. **Identität/Pfad-Konvention?** Nicht nötig — es entsteht keine zweite Datei, die
   verknüpft werden müsste. Der Node ist über seinen bestehenden deterministischen
   JSON-Pfad (`.project/chapter/<id>.json` etc.) adressierbar; der Index kann diesen
   Pfad direkt als `read_file`-Ziel ausweisen.
5. **Bestehende `extras`-Felder?** Bleiben **strukturiert im JSON** (Tier 3). Das
   ist das stärkste Argument gegen die Storage-Spiegelung: Ensemble und Arc-System
   brauchen sie typisiert, nicht als Freitext.
6. **Löschen/Umbenennen?** **Entfällt**, weil es kein gespiegeltes Wiki-Waisenkind
   gibt. Löschen eines Kapitels entfernt wie bisher genau seine JSON/MD-Dateien; der
   Index wird beim nächsten Prompt-Aufbau ohnehin neu berechnet.

### Konkrete Umsetzung (minimal, risikoarm)

Der ganze Effekt hängt an **einer Stelle**: `buildBookChapterIndex`
(`electron/services/conversation/projectContext.ts`) liest heute nur `title` +
`.md`-Pfade. Erweiterung:

- Beim Einlesen jeder Kapitel-/Szenen-`*.json` auch `description` (und für das Buch
  `synopsis`) mitnehmen und als Zeile in den **BUCHSTRUKTUR**-Block schreiben —
  analog zur `summary`-Zeile im **WIKI-BESTAND**. Ergebnis: die KI sieht Intent
  jedes Abschnitts sofort, ohne Prosa zu lesen. Genau das ursprüngliche Feature.
- Optional (Tier-2-Vereinheitlichung sichtbar machen): denselben Formatter-Stil wie
  `formatWikiIndex` verwenden, damit Wiki-Bestand und Buchstruktur im Prompt als
  *ein* konsistenter „Kanon-Überblick" wirken.
- Optional (Volltext-Lesbarkeit): im Index-Text den JSON-Pfad des Nodes als
  `read_file`-Ziel nennen, falls die KI die volle Beschreibung nachlesen soll.

Kein Datenmodell-Umbau, keine Migration, keine UI-Änderung. Reversibel.

### Voraussetzung: Buchstruktur-Manifest

Der saubere Speicher für Tier 2 (und Tier 3) ist das in
[buch-struktur-manifest.md](buch-struktur-manifest.md) geplante zentrale Manifest.
Es ersetzt den verstreuten Sidecar-Baum durch *eine* geordnete Datei pro Buch und
wird damit zugleich der natürliche Ort der hier beschriebenen Metafile-Delivery.
Empfohlene Reihenfolge: erst das Manifest, dann die Delivery gegen das Manifest.

### Was diese Empfehlung bewusst *nicht* tut

- **Keine** physische Spiegelung von Nodes nach `wiki/kapitel/<id>.md`. Wer Kapitel
  später als *verlinkbare* Entitäten (wie Charaktere) will, kann das obendrauf als
  separaten Schritt bauen — es ist aber nicht nötig, um das Kern-Feature
  (KI versteht Abschnitt ohne Volltext) zu reparieren.
- **Keine** Änderung an Tier 3 / Ensemble / Arc-Feldern.

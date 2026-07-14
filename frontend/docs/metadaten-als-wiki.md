# Idee: Struktur-Metadaten (Kapitel/Szene/Buch) als Wiki-Einträge führen

> Diskussionsgrundlage zum Mitnehmen in eine neue Prompt. Noch nicht implementiert.

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

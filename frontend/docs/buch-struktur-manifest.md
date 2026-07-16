# Buchstruktur auf ein zentrales Manifest umstellen

> Status: **umgesetzt** (Phasen 0–4). Verwandt mit
> [metadaten-als-wiki.md](metadaten-als-wiki.md) — dieses Manifest ist der
> saubere Speicher für die dort beschriebene Metafile-Delivery, die zusammen
> mit dem Umbau aktiviert wurde.
>
> **Umgesetzter Umfang:** `electron/services/chapterManifest.ts` (neu),
> `chapterService.ts` (auf Manifest umgebaut, Signaturen unverändert),
> `projectContext.ts` (liest Manifest + gibt `description`/`synopsis` in den
> BUCHSTRUKTUR-Block aus), Tests in `chapterManifest.test.ts` /
> `chapterService.test.ts`. Zwei Abweichungen vom ursprünglichen Plan sind unten
> unter „Entscheidungen während der Umsetzung" festgehalten.

## Ausgangslage

Heute ist die Buchstruktur ein Baum aus UUID-benannten Sidecar-Dateien
(`electron/services/chapterService.ts`):

```
.project/chapter/
  <chapterUUID>.json              # { title, description, sortOrder }
  <chapterUUID>/
    <sceneUUID>.json              # { title, description, sortOrder, extras }
    <sceneUUID>/
      <actionUUID>.json           # { title, description, sortOrder }
      <actionUUID>.md             # Prosa
```

- **Identität** = UUID-Dateiname, **Reihenfolge** = `sortOrder`-Feld, **Label** = `title`.
- Die UUID-Identität ist bewusst gewählt und **bleibt** (Reihenfolge im Dateinamen
  zu kodieren würde Umsortieren = Umbenennen = gebrochene Referenzen bedeuten).

Schwächen (nicht die Identität, sondern):

1. **Reihenfolge verteilt & fragil** — `sortOrder` redundant über N Geschwister;
   keine einzelne Wahrheit; doppelte/lückenhafte Werte real (daher der
   Natural-Sort-Fallback in `listChapters`).
2. **Metadaten verstreut** — title/description/extras in Dutzenden Mini-JSONs;
   Index-Aufbau = ganzen Baum durchwandern.
3. **Dateinamen opak** — im Git-Diff und Dateibrowser bedeutungslos.

## Zielzustand

Ein geordnetes Manifest pro Struktur-Wurzel; Reihenfolge = Array-Position; Prosa
bleibt als `.md` **an ihrem heutigen Platz** (kein Prosa-History-Bruch):

```
.project/
  structure.json                        # NEU: das Manifest (Baum + Metadaten)
  chapter/<chapterUUID>/<sceneUUID>/<actionUUID>.md   # UNVERÄNDERT
```

### Manifest-Schema (`structure.json`)

```jsonc
{
  "version": 1,
  "book": {                    // ersetzt .project/book.json (optional, s. u.)
    "title": "...",
    "description": "...",
    "extras": { "synopsis": "...", "tone": "...", "Charactere": "@[…](wiki/…)" }
  },
  "chapters": [                // Array-Index = Reihenfolge, kein sortOrder mehr
    {
      "id": "<uuid>",
      "title": "...",
      "description": "...",
      "scenes": [
        {
          "id": "<uuid>",
          "title": "...",
          "description": "...",
          "extras": { "location": "...", "goal": "...", "arcRefs": "…" },
          "actions": [
            { "id": "<uuid>", "title": "..." }   // Prosa liegt in <ids>.md
          ]
        }
      ]
    }
  ]
}
```

Entscheidungen im Schema:

- **Reihenfolge = Array-Position.** `sortOrder` fällt ersatzlos weg. Reordern =
  Array splicen + eine Datei schreiben (atomar).
- **`extras` bleibt typisiert** pro Knoten (Ensemble/Arc lesen daraus) — genau wie
  heute in `NodeMeta.extras`. Keine Freitext-Verflachung.
- **Buch-Meta** wandert in `manifest.book` (konsolidiert `book.json`). Alternativ
  kann `book.json` separat bleiben, um die Änderung kleiner zu halten — reine
  Geschmacks-/Scope-Frage, kein Blocker.

## Der Hebel, der das derisked: die API bleibt identisch

Der komplette Vertrag ändert sich **nicht**:

- IPC-Namespace `chapter:*` / `book:*` (`electron/main.ts`) — gleiche Kanäle.
- Bridge (`electron/preload.ts`, `src/electron/bridge.ts`) — gleiche Signaturen.
- Renderer-Facade `chapterApi` (`src/api.ts`) — unverändert.
- Renderer-Typen `ChapterNode`/`SceneNode`/`ActionNode`/`NodeMeta` (`src/types.ts`)
  — unverändert. (`NodeMeta.sortOrder` kann als Feld bleiben und beim Bauen der
  Nodes aus dem Array-Index abgeleitet werden, damit der Renderer 0 Änderungen
  braucht.)

Damit ist der Umbau ein **reiner Storage-Swap im Backend**. Der Renderer merkt nichts.

## Betroffene Dateien

**Backend, echte Änderung:**

- `electron/services/chapterService.ts` — intern auf Manifest umgestellt; alle
  exportierten Funktionen behalten ihre Signatur. `reorder*` werden zu
  Array-Splices; `updateXMeta` mutiert den Knoten im Manifest; `sortOrder`
  verschwindet aus der Persistenz, wird beim Node-Bau aus dem Index synthetisiert.
- `electron/services/conversation/projectContext.ts` — `buildChapterEntriesForBook`,
  `readSceneReference`, `buildBookChapterIndex` lesen heute die Sidecars **direkt**.
  Auf einen gemeinsamen Manifest-Reader umstellen (idealerweise denselben, den
  `chapterService` nutzt). **Hier landet zugleich die Metafile-Delivery** aus dem
  Nachbar-Konzept (description/synopsis in den BUCHSTRUKTUR-Block).

**Backend, nicht betroffen:** `ensembleService.ts` (bekommt Szenen-Kontext vom
Renderer, liest keine Sidecars), `gitService.ts` / `getChapterFilePaths`
(liefern `.md`-Pfade — die bleiben, wo sie sind), `snapshotService.ts` (In-Memory).

**Renderer, nicht betroffen** (laufen über `chapterApi`): `useChapter.ts`,
`ChapterView.tsx`, `MetaPanel.tsx`, `OutlinerPanel.tsx`,
`SubprojectInlineOutline.tsx`, `EnsembleRunButton.tsx`, `FileChip.tsx`,
`outlinerLabels.ts`, `workspaceMeta.ts`. Vor Merge trotzdem per Grep bestätigen,
dass keine dieser Stellen `.project/chapter`-Pfade hartkodiert; das `scene:`-
Referenzformat bleibt gültig.

## Schrittweiser Umbau

**Phase 0 — Manifest-Modul (additiv, kein Verhalten geändert)**
- Neues Modul (z. B. `chapterManifest.ts`): Typen + `readManifest(root)` /
  `writeManifest(root, m)` mit **atomarem Schreiben** (temp-Datei + `rename`).
- Reiner Leser/Schreiber, noch nirgends verdrahtet. Unit-Tests dafür.

**Phase 1 — Konverter + Lazy-Migration**
- `migrateSidecarsToManifest(root)`: liest den bestehenden Sidecar-Baum (Logik aus
  heutigem `getChapterStructure` wiederverwenden), erzeugt `structure.json`.
- **Lazy**: Beim ersten Struktur-Zugriff, wenn `structure.json` fehlt aber
  `.project/chapter/*.json` existiert → konvertieren. Vorher die alten `*.json` nach
  z. B. `.project/chapter.bak/` sichern (einmaliges Backup, nicht löschen in v1).
- Pro Struktur-Wurzel ausführen: Haupt­projekt **und** jedes Buch-Subprojekt
  (`.subproject.json` type `book`) hat sein eigenes Manifest.

**Phase 2 — `chapterService` intern umstellen**
- Jede Funktion liest/schreibt das Manifest statt der Sidecars, Signaturen gleich.
- `listChapters`/`getChapterStructure` bauen die Nodes aus dem Manifest;
  `sortOrder` wird aus dem Array-Index synthetisiert (Renderer-Kompatibilität).
- `reorder*` = Array-Reihenfolge setzen. `updateXMeta`/`create*`/`delete*` mutieren
  den Baum und schreiben einmal.
- `.md`-Pfade weiter aus (chapterId/sceneId/actionId) ableiten — Prosa-Dateien
  bleiben unangetastet.

**Phase 3 — `projectContext` + Metafile-Delivery**
- `buildBookChapterIndex` & Co. auf den Manifest-Reader umstellen (eine Datei lesen
  statt Baum-Walk).
- Im BUCHSTRUKTUR-Block zusätzlich `description` (Kapitel/Szene) und `synopsis`
  (Buch) ausgeben → reaktiviert das ursprüngliche Feature „KI kennt den Abschnitt
  ohne Volltext". (Das ist der Sofort-Fix aus dem Metafile-Konzept, jetzt gegen den
  konsolidierten Speicher.)

**Phase 4 — Aufräumen**
- `randomizeIds` wird obsolet/trivial (IDs stehen im Manifest) → entfernen oder auf
  Manifest umschreiben.
- Nach Bewährung: `.project/chapter.bak/` als optionalen Cleanup-Schritt entfernen.

## Tests

- Manifest-Modul: read/write Roundtrip, atomarer Schreibpfad.
- Konverter: Sidecar-Fixture → Manifest; Reihenfolge korrekt aus `sortOrder`
  übernommen; `extras` erhalten; Buch-Meta übernommen.
- `chapterService`: bestehende Tests müssen unverändert grün bleiben (Vertrag) —
  bester Beweis, dass der Storage-Swap transparent ist. Ggf. Reorder-Test ergänzen.
- `projectContext`: Index enthält jetzt description/synopsis.

## Risiken & offene Punkte

- **Atomares Schreiben ist Pflicht** — eine korrupte `structure.json` verlöre die
  ganze Baum-Metadaten. temp+rename + das Sidecar-Backup aus Phase 1 mindern das.
- **Metadaten-Git-Historie wird gröber**: eine Titeländerung an irgendeinem Knoten
  berührt jetzt die *eine* Manifest-Datei statt eines isolierten Sidecars. Die
  **Prosa**-Historie (`.md`) bleibt unberührt — das ist der Teil, der zählt.
- **Kein Cross-Parent-Move in v1**: `.md` liegt weiter unter `<cid>/<sid>/`, der
  Pfad kodiert also die Elternschaft. Szene-in-anderes-Kapitel-verschieben ist
  heute kein Feature; falls es kommt, entweder `.md` mitverschieben oder Prosa nach
  `.project/content/<aid>.md` flachlegen (dann von Tree-Position entkoppelt) —
  bewusst **nicht** Teil dieser v1.
- **`book.json`**: bleibt eigenständig (entschieden, s. „Entscheidungen während der Umsetzung").

## Entscheidungen während der Umsetzung

Zwei Punkte wurden gegenüber dem ursprünglichen Plan bewusst anders entschieden:

- **`book.json` bleibt eigenständig** (nicht ins Manifest eingefaltet). Grund:
  `.project/book.json` wird nicht nur über `bookApi.get/updateMeta` bearbeitet,
  sondern auch **direkt als Datei referenziert** — Drag-to-Chat des Wurzel-Knotens
  setzt `…/.project/book.json` als Referenzpfad (`FileTreeOutliner.tsx`). Läge die
  Buch-Meta im Manifest, würde diese Datei bei jeder Bearbeitung veralten und
  stillschweigend veraltete Daten in den KI-Kontext ziehen — genau die Divergenz,
  die der Umbau vermeiden soll. `book.json` war ohnehin nie Teil des
  Sidecar-Wildwuchses (eine Datei, saubere API). Das Manifest besitzt daher **nur
  den Kapitelbaum**; `getBookMeta`/`updateBookMeta` und die Synopsis-Zeile im
  Index lesen/schreiben weiterhin live `book.json`.
- **Kommentar-Sidecars werden ausgeschlossen.** `<chapterId>.comments.json` liegt
  im selben Ordner wie die Kapitel-Sidecars. Die Migration filtert `.comments.json`
  heraus; das behebt nebenbei einen latenten Bug des alten `listChapters`, der
  solche Dateien als Phantom-Kapitel (`<id>.comments`) gelistet hätte.

## Verzahnung mit den Metafiles

Dieses Manifest **ist** der Metafile-Speicher aus
[metadaten-als-wiki.md](metadaten-als-wiki.md): Tier-2-Felder
(`description`/`synopsis`) und Tier-3-Felder (`extras`) liegen konsolidiert im
Knoten, die Delivery-Vereinheitlichung (in den KI-Index einspeisen) bleibt
unverändert — sie liest nur ab jetzt aus einer Datei statt aus dem Sidecar-Baum.
Deshalb dieser Umbau **vor** der Metafile-Arbeit: sonst würde dieselbe Delivery-
Stelle zweimal gebaut.

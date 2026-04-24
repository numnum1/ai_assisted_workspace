# Semantische Suche (Vector Search)

## Überblick

Die App nutzt eine lokale Vektordatenbank, um Projektdateien und Wiki-Inhalte
semantisch durchsuchen zu können. "Semantisch" bedeutet: Die Suche findet
thematisch ähnliche Inhalte, auch wenn die genauen Wörter nicht übereinstimmen.

**Beispiel:** Die Anfrage *"Konflikt zwischen den Charakteren"* findet auch
Abschnitte, die *"Streit"*, *"Auseinandersetzung"* oder *"Rivalität"* enthalten –
ohne dass das Wort "Konflikt" explizit vorkommt.

---

## Technologie

- **Keine externen Datenbank-Server, keine nativen Binaries**
- Vektoren werden als JSON auf der Festplatte gespeichert (pure TypeScript)
- Embeddings werden über die **OpenAI-kompatible Embeddings-API** erzeugt
  (`text-embedding-3-small` by default)
- Für die Ähnlichkeitssuche wird **Kosinus-Ähnlichkeit** berechnet

---

## Wann wird indexiert?

### Automatisch: Nie
Der Index wird **nicht automatisch** aufgebaut oder aktualisiert. Das ist
bewusst so, damit keine unerwarteten API-Kosten entstehen und die App sich nicht
beim Öffnen eines Projekts verlangsamt.

### Manuell: Auf Anfrage
Indexierung startet, wenn explizit aufgerufen wird – z.B. über einen
"Projekt indexieren"-Button in der UI:

```typescript
await window.appBridge.vector.index();
```

Dies startet eine **vollständige Neu-Indexierung** des aktuell geöffneten
Projekts. Der alte Index wird dabei überschrieben.

### Wer führt die Indexierung durch?
Der IPC-Handler `vector:index` in `main.ts` übernimmt:
1. Das aktuell geöffnete Projekt ermitteln
2. Den ersten konfigurierten AI-Provider holen (für den API-Key)
3. `indexProject()` in `vectorService.ts` aufrufen

---

## Was wird indexiert?

### Eingeschlossene Dateien
Alle Dateien im Projektverzeichnis – unabhängig von Dateiendung oder Typ.
Binärdateien (die nicht als UTF-8 gelesen werden können) werden automatisch
übersprungen.

### Ausgeschlossene Verzeichnisse
```
.git
node_modules
dist
dist-electron
.idea
.cursor
.zed
.assistant
```

### Scope-Zuweisung
Jede Datei bekommt beim Indexieren einen Scope:

| Dateipfad beginnt mit | Scope |
|---|---|
| `wiki/` | `"wiki"` |
| alles andere | `"project"` |

Der Scope kann bei der Suche als Filter genutzt werden.

---

## Wie läuft die Indexierung ab?

```
1. DATEIEN SAMMELN
   Alle Dateien im Projektordner einlesen (rekursiv, Ausnahmen beachten)

2. CHUNKING
   Jede Datei wird in Textblöcke aufgeteilt:
   - Blockgröße: 800 Zeichen
   - Überlappung: 100 Zeichen (damit kein Kontext verloren geht)
   - Blöcke kürzer als 20 Zeichen werden übersprungen

3. EMBEDDINGS
   Alle Chunks werden in Batches von je 50 an die Embeddings-API gesendet:
   POST {apiUrl}/v1/embeddings
   { model: "text-embedding-3-small", input: [chunk1, chunk2, ...] }
   → Ergebnis: je ein 1536-dimensionaler Float-Vektor pro Chunk

4. SPEICHERN
   Der Index wird gespeichert unter:
   ~/.writing-assistant/vector-index/<sha1-hash-des-projektpfads>.json

   Struktur:
   {
     projectPath, indexedAt, embeddingModel, chunkCount,
     chunks: [ { id, filePath, scope, chunkIndex, text, embedding, fileMtime } ]
   }
```

### Kosten der Indexierung (Richtwert)
`text-embedding-3-small` kostet ca. $0,02 pro 1 Million Token.
Ein durchschnittliches Markdown-Projekt mit 100 Dateien à 2.000 Wörtern
entspricht ca. 300.000 Token → **~$0,006 (weniger als 1 Cent)** für eine
vollständige Indexierung.

---

## Wie läuft eine semantische Suche ab?

```
1. QUERY EMBEDDING
   Die Suchanfrage des Modells wird an die Embeddings-API gesendet
   → Ergebnis: 1 Vektor

2. INDEX LADEN
   ~/.writing-assistant/vector-index/<hash>.json einlesen

3. ÄHNLICHKEIT BERECHNEN
   Kosinus-Ähnlichkeit zwischen Query-Vektor und jedem Chunk-Vektor:
   similarity = dot(a, b) / (|a| * |b|)

4. RANKING & RÜCKGABE
   Top-K Chunks nach Score sortiert zurückgeben (default: 10)
   Jeder Treffer enthält: filePath, scope, snippet (max. 300 Zeichen), score (0–1)
```

---

## Fallback-Verhalten

Wenn `semantic_search` aufgerufen wird, aber **kein Index vorhanden** ist oder
die **Embedding-API nicht erreichbar** ist, fällt die Suche automatisch auf
**Keyword-Suche** zurück.

Das Modell bekommt im Ergebnis einen `note`-Hinweis:
```json
{
  "hits": [...],
  "note": "Semantic index not available (no_index). Keyword search used as fallback."
}
```

Mögliche `fallbackReason`-Werte:
- `no_index` – Projekt wurde noch nicht indexiert
- `embedding_error: <details>` – API-Aufruf ist fehlgeschlagen

---

## Das `semantic_search` AI-Tool

Das Modell (KI-Chat) kann `semantic_search` als Tool aufrufen. Die Definition:

```json
{
  "name": "semantic_search",
  "description": "Search project files and wiki by meaning, not just exact keywords. ...",
  "parameters": {
    "query":  { "type": "string" },          // required
    "scope":  { "type": "string",            // optional, default "all"
                "enum": ["all", "project", "wiki"] },
    "limit":  { "type": "number" }           // optional, default 10
  }
}
```

**Typisches Nutzungsmuster des Modells:**
1. `semantic_search` aufrufen → relevante Dateien/Chunks finden
2. `read_file` oder `wiki_read` aufrufen → vollständigen Dateiinhalt lesen
3. Antwort auf Basis beider Ergebnisse formulieren

---

## Wo liegt was im Code?

| Datei | Inhalt |
|---|---|
| `electron/services/vectorService.ts` | Kern-Logik: Indexierung, Suche, Fallback |
| `electron/services/chatService.ts` | `semantic_search` Tool-Handler, leitet Provider-Config weiter |
| `electron/services/conversation/systemPrompt.ts` | Tool-Definition für das Modell |
| `electron/main.ts` | IPC-Handler `vector:index` und `vector:status` |
| `electron/preload.ts` | `window.appBridge.vector.index()` und `.status()` |

---

## Index-Status abfragen (Frontend)

```typescript
const status = await window.appBridge.vector.status();
// {
//   indexed: true,
//   indexedAt: "2024-04-24T10:30:00.000Z",
//   chunkCount: 847,
//   embeddingModel: "text-embedding-3-small"
// }
```

Damit kann in der UI z.B. angezeigt werden: *"Zuletzt indexiert: 24.04.2024 –
847 Blöcke"* oder ein Badge *"Index veraltet"*, wenn Dateien seit dem letzten
Index geändert wurden.

---

## Bekannte Einschränkungen

- **Kein inkrementelles Update** – immer vollständige Neu-Indexierung
- **Kein automatisches Invalidieren** – wenn Dateien nach dem letzten Index
  geändert werden, bleibt der alte Index ohne Warnung aktiv bis zur nächsten
  manuellen Indexierung
- **Dateigröße des Index** – bei sehr großen Projekten (>10.000 Dateien) kann
  die JSON-Datei mehrere hundert MB groß werden; für solche Fälle wäre ein
  Wechsel zu LanceDB oder SQLite sinnvoll
- **Ein Provider** – beim manuellen Indexieren über IPC wird immer der erste
  konfigurierte Provider verwendet

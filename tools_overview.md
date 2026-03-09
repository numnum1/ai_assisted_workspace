# Tool-Entwicklungsguide

Dieses Dokument beschreibt, wie neue AI-Tools für den Writing Assistant implementiert werden.

## Architektur-Überblick

Der `ToolExecutor` ist eine Spring-Registry, die alle `Tool`-Beans automatisch per Constructor Injection aufnimmt. Neue Tools werden **ausschließlich durch Erstellen einer neuen Klasse** hinzugefügt — keine Änderung an `ToolExecutor`, `ChatController` oder anderen Klassen nötig.

```
service/
  ToolExecutor.java         ← schlanke Registry, NICHT anfassen
  tools/
    Tool.java               ← Interface
    AbstractTool.java       ← Basisklasse mit JSON-Helper
    SearchProjectTool.java  ← Beispiel: search_project
    ReadFileTool.java       ← Beispiel: read_file
```

## Tool-Interface

```java
public interface Tool {
    String getName();                      // eindeutiger Funktionsname für die API
    Map<String, Object> getDefinition();   // vollständiges OpenAI function-calling Schema
    String execute(String argsJson);       // Ausführung, gibt Ergebnis-String zurück
    String describe(String argsJson);      // kurze Beschreibung für SSE tool_call Event
}
```

## Neues Tool erstellen — Schritt für Schritt

### 1. Klasse anlegen

Datei: `service/tools/MeinTool.java`

```java
package com.assistant.service.tools;

import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;

@Component
public class MeinTool extends AbstractTool {

    // Optional: benötigte Services per Constructor injizieren
    private final FileService fileService;

    public MeinTool(FileService fileService) {
        this.fileService = fileService;
    }

    @Override
    public String getName() {
        return "mein_tool";  // snake_case, eindeutig
    }

    @Override
    public Map<String, Object> getDefinition() {
        return Map.of(
            "type", "function",
            "function", Map.of(
                "name", getName(),
                "description", "Was dieses Tool tut — wichtig für das Modell, damit es weiß, wann es das Tool aufrufen soll.",
                "parameters", Map.of(
                    "type", "object",
                    "properties", Map.of(
                        "param1", Map.of(
                            "type", "string",
                            "description", "Beschreibung von param1"
                        )
                    ),
                    "required", List.of("param1")
                )
            )
        );
    }

    @Override
    public String execute(String argsJson) {
        String param1 = extractArg(argsJson, "param1");
        if (param1 == null || param1.isBlank()) {
            return "Error: missing 'param1' parameter";
        }
        // Logik hier
        return "Ergebnis: " + param1;
    }

    @Override
    public String describe(String argsJson) {
        // Wird als SSE tool_call Event an das Frontend gesendet (Anzeige für den User)
        return "Führe mein_tool aus mit: " + extractArg(argsJson, "param1");
    }
}
```

### 2. Fertig

Spring registriert die Klasse automatisch. Das Tool erscheint beim nächsten Start in der Liste der verfügbaren Tools (Log: `Registered tools: [...]`).

## AbstractTool: JSON-Argument-Parser

`AbstractTool` stellt `extractArg(String json, String key)` bereit. Die Methode extrahiert String-Werte aus einfachen JSON-Objekten:

```java
String path = extractArg(argsJson, "path");
// argsJson = {"path": "characters/Marc/bio.md"} → "characters/Marc/bio.md"
```

Unterstützte Escape-Sequenzen: `\"`, `\\`, `\n`, `\t`.

Für komplexere Parameter-Typen (Arrays, verschachtelte Objekte) muss manuell geparst werden — ein JSON-Parser ist im Projekt nicht vorhanden (bewusste Entscheidung, kein Jackson).

## Verfügbare Services

Alle Spring-Beans können per Constructor-Injection genutzt werden:

| Service | Zweck | Wichtige Methoden |
|---------|-------|-------------------|
| `FileService` | Dateizugriff (mit Pfad-Sicherheitsvalidierung) | `readFile(path)`, `writeFile(path, content)`, `fileExists(path)`, `searchFiles(query)`, `listFiles(path)`, `readFileLines(path, start, end)`, `countLines(path)`, `isDirectory(path)` |

**Sicherheitsregel:** `FileService` validiert alle Pfade gegen den Projekt-Root — es ist nicht möglich, außerhalb des Projekts zu lesen oder zu schreiben. Rohe `java.io`-Operationen sind in Tools verboten.

## execute() — Rückgabe-Konventionen

Das Ergebnis von `execute()` wird als Tool-Nachricht direkt in den Kontext des Modells eingefügt. Daher gilt:

- **Erfolg:** Aussagekräftigen Text zurückgeben, den das Modell interpretieren kann
- **Fehler:** Mit `"Error: ..."` präfixen — das Modell erkennt Fehler und kann reagieren
- **Nicht gefunden:** Klare Aussage wie `"File not found: ..."` statt leerer String
- **Maximale Länge:** Inhalte können groß werden — der WebClient hat ein Body-Limit von 16 MB, aber der Token-Kontext des Modells ist begrenzt. Lange Ergebnisse ggf. kürzen.

## Tool-Loop

Der `ChatController` führt Tools in bis zu `MAX_TOOL_ROUNDS = 3` Runden aus. Das Modell kann also mehrere Tools hintereinander aufrufen (z.B. erst `search_project`, dann `read_file`). Nach 3 Runden wird der Stream direkt gestartet, auch wenn das Modell weitere Tool-Calls angefordert hätte.

---

## Wiki-Tools

Das Projekt kann unter `wiki/` (Projektroot) strukturierte Wissensdateien für Weltenbau-Entities ablegen (Charaktere, Orte, Organisationen, …). Die KI bekommt zwei read-only Tools dafür.

### Verzeichnisstruktur

```
wiki/
  characters/    ← eine .md-Datei pro Charakter
  locations/     ← eine .md-Datei pro Ort/Schauplatz
  organizations/ ← eine .md-Datei pro Fraktion/Gruppe
  ...            ← weitere Kategorien als Ordner
```

### Frontmatter-Schema (jede Entry-Datei)

```yaml
---
id: kebab-case-id         # eindeutige Kennung
type: character           # character | location | organization | ...
aliases: [Name1, Name2]   # alternative Namen (für Suche)
tags: [tag1, tag2]        # Schlagwörter (für Suche)
summary: >
  Ein-Satz-Beschreibung – dieser Text erscheint direkt in Suchergebnissen.
---

Volltext/Notizen ab hier …
```

> **Wichtig:** `summary` ist das wichtigste Feld — es bestimmt, was das Modell in Suchergebnissen sieht, ohne die ganze Datei laden zu müssen. Kurz und präzise halten.

### `wiki_search`

Durchsucht `wiki/` nach Dateinamen, `id`, `aliases`, `tags` und `summary`.

| Parameter | Typ    | Pflicht | Beschreibung |
|-----------|--------|---------|--------------|
| `query`   | string | ja      | Suchbegriff (case-insensitive) |
| `type`    | string | nein    | Filterung nach `type`-Frontmatter-Wert |
| `limit`   | string | nein    | Max. Treffer (Standard 10, max 20) |

Rückgabe: kompakte Trefferliste mit Pfad und `summary`.

### `wiki_read`

Liest eine einzelne Wiki-Datei vollständig. Akzeptiert nur Pfade unter `wiki/`.

| Parameter | Typ    | Pflicht | Beschreibung |
|-----------|--------|---------|--------------|
| `path`    | string | ja      | Relativer Pfad, z.B. `wiki/characters/mara-voss.md` |

### Empfohlenes Nutzungsmuster für das Modell

1. Erst `wiki_search` mit dem relevanten Namen/Schlagwort aufrufen.
2. Nur bei Bedarf `wiki_read` für einzelne Treffer nachlagern.
3. Möglichst wenige Dateien pro Runde lesen — Kontext ist begrenzt.
4. Bei keinen Treffern: Query verfeinern (z.B. Alias oder Tag statt vollständigen Namen).

---

## Scene-Tools

Das Projekt kann unter `chapters/` strukturierte Szenen-Metadaten ablegen (`.scene.json` und `.chapter.json`). Die KI bekommt zwei Tools dafür.

### Verzeichnisstruktur

```
chapters/
  kapitel-07/
    kapitel-07.chapter.json   ← Kapitel-Metadaten
    szene-01.md               ← Volltext
    szene-01.scene.json       ← Szenen-Metadaten
    szene-02.md
    szene-02.scene.json
```

### `.scene.json`-Felder

| Feld | Beschreibung |
|------|-------------|
| `summary` | Ein-Satz-Beschreibung — erscheint in Suchergebnissen |
| `plotstraenge` | Kommagetrennte Plotstrang-IDs |
| `voraussetzungen` | Was vor der Szene wahr sein muss |
| `endzustand` | Was nach der Szene wahr ist |
| `offene_fragen` | Offene Kausalfragen / potenzielle Plot Holes |
| `handlungseinheiten` | Array von Handlungseinheiten (Ort, Zeit, Charaktere, Beats, Intent, Informationsänderungen, Constraints) |

> **Wichtig:** `summary` ist das wichtigste Feld — es bestimmt, was das Modell in Suchergebnissen sieht, ohne die ganze Datei laden zu müssen.

### Automatischer Kontext

Wenn die aktive Datei in `chapters/` liegt, werden automatisch injiziert (ohne Tool-Runde):
- `.scene.json` der aktuellen Szene
- `.scene.json` der Vorgänger- und Nachfolger-Szene
- `.chapter.json` des aktuellen Kapitels

### `scene_search`

Durchsucht `chapters/` nach `.scene.json`-Dateien nach Name, `summary`, `plotstraenge` und Charakteren.

| Parameter | Typ    | Pflicht | Beschreibung |
|-----------|--------|---------|--------------|
| `query`   | string | ja      | Suchbegriff (case-insensitive) |
| `chapter` | string | nein    | Filterung auf ein bestimmtes Kapitel |
| `limit`   | string | nein    | Max. Treffer (Standard 10, max 20) |

Rückgabe: kompakte Trefferliste mit Pfad, `summary` und `plotstraenge`.

### `scene_read`

Liest eine einzelne `.scene.json`-Datei vollständig. Akzeptiert nur Pfade unter `chapters/`.

| Parameter | Typ    | Pflicht | Beschreibung |
|-----------|--------|---------|--------------|
| `path`    | string | ja      | Relativer Pfad, z.B. `chapters/kapitel-07/szene-03.scene.json` |

### Empfohlenes Nutzungsmuster für das Modell

1. Beim Arbeiten an einer Szene sind benachbarte Scene-Metadaten bereits im Kontext.
2. Bei Fragen zu weiter entfernten Szenen: erst `scene_search` aufrufen.
3. Nur bei Bedarf `scene_read` für volle Metadaten nachlagern.
4. Für Wiki-Entities weiterhin `wiki_search` → `wiki_read` verwenden.

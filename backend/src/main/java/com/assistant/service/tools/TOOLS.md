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

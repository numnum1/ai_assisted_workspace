# AI Context: Writing Assistant

## Was ist das?

Ein lokaler, KI-gestützter Schreibassistent für kreatives Schreiben (Romane, Geschichten). Drei-Panel-UI im Cursor-Stil: Dateibaum links, Markdown-Editor (CodeMirror) in der Mitte, KI-Chat rechts. Verbindet sich mit einer OpenAI-kompatiblen API, alle Dateien bleiben lokal.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, CodeMirror 6
- **Backend:** Java 17, Spring Boot 3.2.5, Maven, JGit, jtokkit
- **Kommunikation:** REST (`/api`), Chat über SSE (Server-Sent Events)
- **Dev:** Frontend auf `:5173` (Vite-Proxy zu Backend), Backend auf `:8012`

## Architektur-Überblick

### Frontend (`frontend/src/`)

| Bereich | Zweck |
|---------|-------|
| `App.tsx` | Root-Layout, globaler State, Command Palette |
| `api.ts` | Zentraler API-Client (REST + SSE), Error-Handling, 401-Handling |
| `types.ts` | Gemeinsame TypeScript-Typen |
| `hooks/useProject.ts` | Dateibaum, Öffnen/Speichern/CRUD |
| `hooks/useChat.ts` | Nachrichten, Streaming, Stopp, Fork |
| `hooks/useChatHistory.ts` | Conversations in localStorage |
| `hooks/useContext.ts` | Referenzierte Dateien |
| `components/Editor.tsx` | CodeMirror-Editor mit Editor- und Lese-Modus |
| `components/ChatPanel.tsx` | Chat-UI |
| `components/ChatInput.tsx` | Eingabe mit Drag-and-Drop für Dateien |
| `components/FileTree.tsx` | Projekt-Dateibaum |
| `components/CommandPalette.tsx` | Ctrl+Shift+A: Ordner öffnen, Commit, Sync |
| `components/extensions/` | CodeMirror-Extensions (Bookmarks, Kommentare, Leseansicht) |

### Backend (`backend/src/main/java/com/assistant/`)

| Bereich | Zweck |
|---------|-------|
| `controller/ChatController` | Chat-Endpunkte (SSE + sync) |
| `controller/FileController` | Datei-CRUD |
| `controller/GitController` | Git-Operationen (Status, Commit, Diff, Log, Sync) |
| `controller/ModeController` | Modi auflisten |
| `controller/ProjectController` | Projekt öffnen/wechseln |
| `controller/ProjectConfigController` | `.assistant/`-Konfiguration |
| `service/ContextService` | Kontext für KI zusammenbauen |
| `service/AiApiClient` | OpenAI-kompatible API-Anbindung |
| `service/FileService` | Dateizugriff mit Pfad-Validierung |
| `service/ModeService` | Modi aus YAML laden |
| `service/ReferenceResolver` | `@datei` und `@datei:zeile` parsen |
| `service/ToolExecutor` | Tool-Aufrufe (search_project, read_file) |

## Kernkonzepte

### Modi
- YAML-Dateien mit `id`, `name`, `systemPrompt`, `autoIncludes`, `rules`, `color`
- Built-in: `backend/src/main/resources/modes/*.yaml`
- Projektspezifisch: `.assistant/modes/*.yaml` (überschreiben Built-in)
- Mode-IDs: Kleinbuchstaben und Bindestriche (`/[a-zA-Z0-9_\-]+/`)

### Kontext-Assembly
- `story.md` und die aktive Datei werden immer mitgesendet
- Referenzierte Dateien (`@datei`, `@datei:start-end`) werden zusätzlich eingebunden
- Drag-and-Drop von Dateien in den Chat fügt Referenzen hinzu

### Projektkonfiguration
- `.assistant/project.yaml` — Name, Beschreibung, `alwaysInclude`, `globalRules`
- `.assistant/modes/*.yaml` — Projektspezifische Modi
- `.assistant/rules/*.md` — Regelfiles
- `application-local.yml` — API-Key und Projektpfad (gitignored)

### Chat-SSE-Events
- `context` — Inkludierte Dateien + geschätzte Tokens
- `token` — Content-Chunks
- `tool_call` — Tool-Beschreibung
- `error` — Fehlermeldung
- `done` — Stream beendet

## Don'ts und Einschränkungen

### Pfade und Sicherheit
- **Niemals** Dateizugriff außerhalb des Projekt-Roots — `FileService` validiert alle Pfade
- `.assistant`, `node_modules`, `target`, versteckte Dateien (`.`-Prefix) sind vom Dateibaum und der Suche ausgeschlossen

### Frontend
- **Niemals** `api.ts` umgehen — dort liegt zentrales Error-Handling und 401-Logik
- Chat-History lebt in localStorage (browserspezifisch, nicht synchronisiert)
- Editor wird bei Dateiwechsel neu erstellt (`filePath` in Effect-Dependencies)
- Lese-Modus nutzt CodeMirror-Compartments für Extension-Swaps

### Backend
- Projekt-Pfad muss gesetzt sein, bevor Datei-Operationen funktionieren
- Tool-Loop im Chat ist auf `MAX_TOOL_ROUNDS = 3` begrenzt
- WebClient Body-Limit: 16 MB
- `AiApiClient` nutzt manuelles JSON-Parsing (kein Jackson)
- `ProjectController.browse()` nutzt Swing (`JFileChooser`) — braucht ein Display

### Allgemein
- **Keine** Secrets in Git — API-Key gehört in `application-local.yml`
- UI ist ein Mix aus Englisch und Deutsch (z.B. "Neuer Chat", "Umbenennen")
- State-Management: Nur lokaler React-State und Hooks, kein Redux/Zustand

## API-Pfade

Alle Endpunkte unter `/api`:
- `/api/files` — Dateibaum und CRUD
- `/api/chat` — Chat (SSE), `/api/chat/sync` (nicht-streaming), `/api/chat/context-preview`
- `/api/modes` — Modi
- `/api/git/*` — Git-Operationen
- `/api/project/*` — Projekt öffnen/wechseln
- `/api/project-config/*` — `.assistant`-Konfiguration

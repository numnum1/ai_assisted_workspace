# Feature-Glossar (für Cursor / KI-Kontext)

Dieses Glossar beschreibt **Begriffe aus dem Writing Assistant** so, dass du in Cursor mit kurzen Namen klar meinst: *welches Produkt-Feature*, *welcher UI-Bereich*, oder *welche API-/Konfigurationsdatei*.

> **Hinweis:** Das ist **nicht** die projektbezogene Begriffsliste für den Chat (`\.assistant/glossary.md`). Diese Datei dient nur der **Erklärung der App-Features** gegenüber der IDE-KI.

---

## Layout & Editor

| Begriff / Synonym | Gemeint ist |
|-------------------|-------------|
| **Drei-Spalten-Layout**, **Three-panel layout** | Haupt-UI: Dateibaum, Editor, Chat — Spalten sind per Splitter skalierbar. |
| **Dateibaum**, **File tree** | Linke Spalte: Projektdateien, Navigation. |
| **Editor**, **CodeMirror** | Mittlere Spalte: Markdown-Editor (CodeMirror 6), Syntax-Highlighting, dunkles Theme. |
| **Chat**, **Chat-Panel** | Rechte Spalte: Konversation mit dem Modell, Streaming, Tools. |
| **Editor-Tabs**, **Tabs** | Mehrere geöffnete Dateien; ungespeicherte Änderungen oft mit Punkt markiert. |
| **Markdown-Preview** | Vorschau via `react-markdown` (GFM). |
| **Kommandopalette** | `Ctrl+Shift+A` — Befehle schnell ausführen. |
| **Projektsuche**, **Textsuche** | `Ctrl+Shift+F` — projektweite Textsuche. |

---

## Chat, Kontext & Streaming

| Begriff / Synonym | Gemeint ist |
|-------------------|-------------|
| **Streaming**, **SSE** | Antworten laufen per Server-Sent Events; nicht alles auf einmal. |
| **Tool calling**, **Tools** | Modell ruft serverseitige Funktionen auf (mehrere Runden, z. B. bis 3). |
| **Kontext-Zusammenstellung**, **Context assembly** | Zusammenbau aus: Chat-Modus, Workspace-Prompt, Glossar-Datei, Story-Überblick, Dateibaum, always-include, aktive Datei, `@`-Referenzen, Tool-Anweisungen → System- und User-Nachricht. |
| **Context Inspector**, **Kontext-Inspector**, **Auge-Symbol** | Zeigt zusammengebaute Kontext-Blöcke und grobe Token-Schätzung; Backend: `POST /api/chat/context-preview`. |
| **Token-Anzeige**, **Footer-Tokens** | Token-Info in der Fußzeile der UI. |
| **`@file`**, **@-Referenz**, **Datei-Referenz** | Chat-Input: z. B. `@chapters/01.md` oder mit Zeilen `@chapters/01.md:10-25`. |
| **Drag-and-drop Referenz** | Datei aus dem Baum in das Chat-Eingabefeld ziehen. |

---

## AI-Tools (Chat)

| Tool-Name | Kurz: wofür |
|-----------|-------------|
| `read_file` | Beliebige Projektdatei lesen. |
| `search_project` | Pfade/Dateinamen zur Query finden. |
| `wiki_read` | Eine `wiki/**/*.md`-Datei lesen. |
| `wiki_search` | Volltextsuche nur unter `wiki/`. |
| `glossary_add` | Eintrag an `.assistant/glossary.md` anhängen. |
| `write_file` | Datei schreiben/überschreiben; danach **Change card** mit Diff. |
| `web_search` | Optional Tavily. |
| `propose_guided_thread` | KI schlägt geführten Thread vor → **Guided-Thread-Angebotskarte** in der UI. |

---

## Change cards & Snapshots

| Begriff | Gemeint ist |
|---------|-------------|
| **Change card**, **Änderungskarte** | Nach `write_file`: Diff im Chat mit **Apply** (Revert-Snapshot anwenden) / **Revert** (vorherigen Inhalt wiederherstellen). |
| **Snapshots-API** | `GET /api/snapshots/{id}`, `POST …/apply`, `POST …/revert`. |

---

## Threads & Chats

| Begriff / Synonym | Gemeint ist |
|-------------------|-------------|
| **Chat-Thread**, **Thread** | Abgezweigte Konversation ab einer Assistant-Nachricht; Parent-Transkript als versteckter Bootstrap-Kontext. |
| **Thread starten**, **Fork** | Button (z. B. bei erstem Tool-Call der Assistant-Runde oder in Nachrichten-Aktionen). |
| **Threads rail**, **Thread-Leiste** | Seitenleiste: Hauptchat + zugehörige Threads zum Wechseln. |
| **Verschachtelte History** | Chat-Historie: Threads unter Parent mit Badge „Thread“, aufklappbar. |
| **Fullscreen Split**, **Split-Pane Thread** | Vollbild: links Parent-Chat (read-only), rechts aktiver Thread. |
| **Orphan threads** | Threads ohne Parent, separat gruppiert. |
| **chat-history.json** | Persistenz unter `.assistant/chat-history.json` (inkl. Threads). |
| **Neuer Chat / neuer Thread (Dialog)** | Wenn die aktuelle Konversation schon Nachrichten hat: Dialog für **Standard** vs. **Guided session**. |
| **Standard-Session** | Normale Chat-Sitzung ohne serverseitigen Guided-Plan-Flow. |
| **Guided session**, **Guided Session** | Server führt „geführt“: sichtbarer **Steering-Plan** (Markdown); Modell aktualisiert Plan in Fence mit Tag `plan`; letzter Plan hängt an der Conversation und geht mit jeder Anfrage mit. |
| **Steering plan**, **Plan-Block** | Markdown-Plan; technisch: fenced code block tagged `plan`. |
| **KI-Angebot Guided Thread**, **Guided-Thread-Karte** | UI-Karte nach `propose_guided_thread`: neuer **guided** Thread mit vorbereitetem Plan (optional Titel, Modus, Agent-Preset). **Innerhalb eines Threads** kann kein weiterer Thread gestartet werden (Angebot deaktiviert). |
| **Glossar im Chat (UI)** | Nach erfolgreichem `glossary_add` Kurz-Hinweis; oder Text im Chat markieren → **„Als Glossar-Begriff speichern“** (API). |

---

## Modi

| Begriff | Gemeint ist |
|---------|-------------|
| **Chat-Modi**, **built-in modes** | Vorgefertigte Modi (Story Review, Continuity Check, Rechtschreibung/Stil, Brainstorm, …) — ändern den System-Prompt. |
| **Custom modes** | `.assistant/modes/` oder `backend/src/main/resources/modes/`. |
| **Workspace-Modus Standard** | Generischer Schreib-Arbeitsraum. |
| **Workspace-Modus Buch** | Hierarchie Kapitel → Szene → Action + Metadaten-Schemas. |
| **Workspace-Modus Musik** | Song/Lyrics-orientierte Struktur. |
| **Workspace plugins** | Eigene Workspace-Modi per YAML in App-Daten (Projekt-Einstellungen). |

---

## Wiki

| Begriff | Gemeint ist |
|---------|-------------|
| **Wiki-Ordner** | Nur Markdown unter `wiki/` im Projektroot; im Baum sichtbar. |
| **Kein JSON-Wiki-CRUD** | Keine „Wiki-Einträge“-API wie früher — alles ist Dateien. |
| **Frontmatter** | Optionales YAML am Dateianfang; App behandelt Inhalt als Plaintext; Suche über ganze Datei. |
| **Wiki-Titel** | Aus erster `# `-Überschrift oder `name:` in den ersten Zeilen. |
| **JSON nach Markdown** | Kontextmenü auf `.json` im Baum: **„Nach Markdown konvertieren…“** (Legacy-Exportformate). |

---

## Projekt-Glossar (`.assistant/glossary.md`)

| Begriff | Gemeint ist |
|---------|-------------|
| **Projekt-Glossar**, **glossary.md** | Eine Datei `.assistant/glossary.md` — wird **in jeden Chat**-Systemprompt injiziert, wenn vorhanden. |
| **Glossary REST** | `GET/PUT /api/glossary`, `POST /api/glossary/entries`. |
| **Altes Glossar** | Entfernt: `.glossary/`, Panel, Tools `glossary_read` / `glossary_search`. |

---

## Git

| Begriff | Gemeint ist |
|---------|-------------|
| **Git-Integration** | Status, Diff, Log, Commit, Revert, Sync, Datei-Historie — über **JGit** (kein lokales `git` CLI nötig). |

---

## Konfiguration `.assistant/`

| Datei / Ordner | Zweck |
|----------------|--------|
| `project.yaml` | Workspace-Modus, always-include-Pfade, … |
| `modes/` | Eigene Chat-Modi |
| `glossary.md` | Optionales Projekt-Glossar (KI-Kontext) |
| `chat-history.json` | Persistente Chats / Threads |

**Entfernt / konsolidiert (nicht mehr App-Teil):** `.assistant/rules/`-Baum separat, Notes-API, Shadow-Wiki `.wiki/files/`, JSON-Wiki `.wiki/entries/`, altes `.glossary/`.

---

## Sonstiges Produkt

| Begriff | Gemeint ist |
|---------|-------------|
| **Subprojects** | Medien-/Teilprojekte in einem Ordner. |
| **Typed files** | JSON-Schema-getriebene Dateien inkl. KI-Ausfüllen; API unter `/api/typed-files/...`. |
| **Desktop-Helfer** | Projekt im Explorer öffnen, nativer Ordner-Dialog (Windows). |
| **LLM-Provider** | Mehrere OpenAI-kompatible Endpunkte in App-Daten (`ai-providers.json`). |
| **Backend** | Java 17, Spring Boot, Port-Beispiel **8012** in README. |
| **Frontend** | React 19, Vite, Port-Beispiel **5173**; Proxy `/api` → Backend. |

---

## Kurz: API-Cluster (wenn du „die X-API“ sagst)

| Cluster | Beispiel-Endpunkte (Auszug) |
|---------|-----------------------------|
| Dateien | `GET/PUT/DELETE /api/files/content/**` |
| Suche | `GET /api/search?q=…` |
| Chat | `POST /api/chat`, `/api/chat/sync`, `POST /api/chat/context-preview` |
| Wiki | `GET /api/wiki/files`, `GET /api/wiki/search`, Datei lesen mit `path`-Query |
| Glossar | `GET/PUT /api/glossary`, `POST /api/glossary/entries` |
| Snapshots | `GET /api/snapshots/{id}`, apply/revert |
| Modi / LLMs | `/api/modes`, `/api/llms` |
| Buch-Struktur | Kapitel-API wenn Buch-Modus |
| Typed files | `/api/typed-files/...` |
| Subproject | `/api/subproject/...` |

---

## Tastenkürzel (Referenz)

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+S` | Speichern |
| `Ctrl+Enter` | Chat senden |
| `Ctrl+Shift+A` | Kommandopalette |
| `Ctrl+Shift+F` | Projektsuche |

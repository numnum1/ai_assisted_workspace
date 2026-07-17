# Navi

Ein Electron/React-Desktop-Tool, in dem ein Ladenbetreiber mit **Navi** chattet — einem KI-Berater, der herausfindet, ob und wie KI ihm im Alltag konkret helfen kann. Kein Tool-Verkauf, keine Empfehlung eines Stack-Umbaus: Navi berät ehrlich auf Basis des tatsächlichen Ist-Zustands des Händlers (bestehende Software, Budget- und Zeitrahmen).

## Wie Navi funktioniert

Navi führt das Gespräch als Zustandsautomat durch feste Phasen (Begrüßung → Problem klären → Software-Stack erfragen → Investitionsbereitschaft → Einschätzung → Empfehlung → optionale KI-Erkundung → Abschluss). Fortschritt zwischen Info-Phasen wird deterministisch im Backend geprüft (Slot-Checkliste), nicht dem Urteil des Modells überlassen — das kompensiert die schwächere Instruction-Following-Fähigkeit des eingesetzten Modells (Grok).

Ausführliche Dokumentation der Architektur: [`frontend/docs/navi.md`](frontend/docs/navi.md).

## Tech Stack

| Layer | Technologie |
|-------|-------------|
| App | Electron 33 |
| Frontend | React 19, TypeScript 5.9 |
| Build | Vite 7 (Renderer), esbuild (Preload), tsc (Main-Prozess) |
| AI | OpenAI-kompatible `/v1/chat/completions` (direkt aus dem Main-Prozess) |
| Persistenz | Dateisystem (`~/.writing-assistant/navi/` für Konfiguration/Overrides) |

## Setup

```bash
cd frontend
npm install
npm run dev
```

Startet Vite (`:5173`), kompiliert Electron Main-Prozess + Preload und öffnet das Electron-Fenster.

Beim ersten Start: **Settings → LLM Providers** — API-URL, Modell und API-Key eines OpenAI-kompatiblen Endpunkts hinterlegen. Konfiguration liegt in `~/.writing-assistant/ai-providers.json`.

### Produktions-Build

```bash
cd frontend
npm run build:desktop
npm run start:electron
```

## Repository-Layout

```
markdown_project/
├── frontend/           # Electron + React App (Navi-Logik, UI)
│   └── docs/navi.md    # Architektur-Dokumentation von Navi
├── navi/                # Beispiel-Overrides (tools.example.json, use-cases.example.json)
└── docs/                # Weitere technische Dokumentation (z.B. Vector Search)
```

## Navi konfigurieren

Der Gesprächsablauf (Phasen, Persona, Tipps), der Use-Case-Katalog und die KI-Tool-Liste sind editierbar (Projekt-Settings → Navi-Tab) und lassen sich über `~/.writing-assistant/navi/*.json` überschreiben — siehe [`frontend/docs/navi.md`](frontend/docs/navi.md) für Details und Dateipfade.

## Hinweis

Dieses Repository ist aus einem Buchschreib-/Markdown-Editor-Projekt abgezweigt; einzelne generische Infrastruktur (z.B. Chat-Streaming, semantische Suche) stammt noch aus diesem Ursprung, wird aber für Navi mitgenutzt. Aktiv weiterentwickelt wird ausschließlich das Navi-Feature.

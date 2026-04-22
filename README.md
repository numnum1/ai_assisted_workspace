# Writing Assistant

A local, AI-powered Markdown workspace with a three-panel Cursor-style UI: file tree, editor (CodeMirror 6), and AI chat. All files stay on your machine — AI completions are fetched directly from any OpenAI-compatible API. Optional **book** and **music** workspace modes add structured hierarchies (chapters/scenes or song parts) on top of the same editor.

## Features

### Editor & UI
- **Three-panel layout** with resizable panels (file tree, editor, chat)
- **Chat Threads**: branching conversations with threads rail, nested history, and fullscreen split-pane (parent + thread view)
- **Editor tabs**: multiple files open at once; unsaved changes marked with a dot
- **CodeMirror 6** Markdown editor with syntax highlighting and dark theme
- **Markdown preview** via `react-markdown` with GFM support
- **Keyboard shortcuts**: `Ctrl+S` save, `Ctrl+Enter` send chat, `Ctrl+Shift+F` project-wide text search, `Ctrl+Shift+A` command palette

### AI Chat
- **Streaming** via Server-Sent Events (SSE)
- **Tool calling** (up to 3 rounds): `read_file`, `search_project` (paths/filenames), `wiki_read`, `wiki_search`, `glossary_add`, `write_file`, and optional `web_search` (Tavily)
- **Context assembly**: Chat mode, workspace-mode prompt add-on, **glossary** (`.assistant/glossary.md`), story structure overview, file tree listing, always-include files, active file, `@` references, and tool instructions — assembled into the system prompt and user message
- **`@file` references**: e.g. `@chapters/01.md` or `@chapters/01.md:10-25` for line ranges
- **Drag-and-drop** file references from the tree into the chat input
- **Token tracking** in the footer; **Conversation inspector** (eye icon; German UI: „Konversations-Inspector") shows a send preview: full `systemPrompt`, glossary, and assembled context blocks with rough per-block token estimates
- **Change cards**: after `write_file`, the chat shows a diff with **Apply** (drop revert snapshot) / **Revert** (restore previous file content)
- **Glossary in chat**: successful `glossary_add` shows a short indicator; you can select text in chat and use **„Als Glossar-Begriff speichern"** to append a term
- **Multiple LLM providers**: OpenAI-compatible endpoints in app data (`ai-providers.json`)
- **Chat history**: per project in `.assistant/chat-history.json` (supports **threads** / branching conversations)
- **Session kinds**: When starting a **new chat** or **thread** (dialog after the current conversation has messages), choose **Standard** or **Guided session**. Guided sessions add client-side behaviour so the assistant leads with a visible **steering plan** (Markdown). The model updates the plan using a fenced code block tagged `plan`; the latest plan is stored on the conversation and sent with each request.
- **Threads**: Fork conversations from any assistant message using the „Thread starten" button (appears in first tool-call of assistant turns or via message actions). 
  - Creates a new **thread** with the parent transcript as hidden bootstrap context.
  - Special system prompt: explains the branch and that previous messages are parent history to use as background.
  - **Chat History** shows threads nested under parents with "Thread" badge; supports expand/collapse.
  - **Threads rail** (sidebar) lists main chat + its threads for easy switching.
  - In fullscreen mode: split-pane UI with read-only parent chat on the left and active thread on the right.
  - Orphan threads (no parent) grouped separately. Thread mode/pinning follows parent root. Persisted in chat history.
  - **KI-Angebot Guided Thread**: The assistant may call `propose_guided_thread` with a prepared steering plan; the UI shows a card to open a new **guided** thread with that plan (optional title, mode, agent preset). **Threads cannot start another thread** (offer is disabled inside a thread).

### Modes
Built-in chat modes change the system prompt (Story Review, Continuity Check, Spelling and Style, Brainstorm, Prompt-Paket, Struktur ausfüllen, …). Custom modes: `.assistant/modes/`.

### Workspace Modes
| Mode | Description |
|------|-------------|
| **Standard** | Generic workspace |
| **Buch** | Chapter → Scene → Action + metadata schemas |
| **Musik** | Song / lyrics-oriented structure |

Custom workspace modes via YAML in app data (**Workspace plugins** in project settings).

### Wiki (`/wiki/`)
- **Markdown files only** under `wiki/` at the project root (visible in the file tree). No JSON types or CRUD API for "entries".
- **Optional YAML frontmatter** for your own metadata; the app treats the file as plain text. Search uses the full file; titles can come from a `# ` heading or a `name:` line in the first lines.
- **AI tools**: `wiki_read(path)` and `wiki_search(query)` operate only on `wiki/**/*.md`.
- **Migrating old JSON wiki exports**: right-click a `.json` file in the tree → **„Nach Markdown konvertieren…"** (legacy shape `{ id, typeId, values: { … } }` or flat string-only objects).

### Glossary
- **Single file**: `.assistant/glossary.md` — Markdown list-style entries; content is **injected into every chat** system prompt when the file exists.
- **AI**: `glossary_add(term, definition)` appends an entry.
- Replaces the old `.glossary/` folder, glossary panel, and `glossary_read` / `glossary_search` tools.

### Git Integration
Status, diff, log, commit, revert, sync, file history — via simple-git (no separate Git server required).

### Project configuration (`.assistant/`)
- `project.yaml` — workspace mode, always-include paths, etc.
- `modes/` — custom chat modes
- `glossary.md` — project glossary (optional)
- `chat-history.json` — persisted chats

**Removed / consolidated** (no longer part of the app): separate **Rules** tree under `.assistant/rules/`, **Notes** API, **shadow wiki** (`.wiki/files/`), JSON wiki under `.wiki/entries/`, old glossary under `.glossary/`.

### Other
- **Subprojects** (media projects inside a folder)
- **Typed files** (JSON Schema–driven) and AI fill
- **Desktop**: open project in OS file manager, native folder picker (Windows)
- **Web search**: optional Tavily

## Tech Stack

| Layer | Technology |
|-------|------------|
| App | Electron 33 |
| Frontend | React 19, TypeScript 5.9, CodeMirror 6 |
| Build | Vite 7 (renderer), esbuild (preload), tsc (main process) |
| UI | lucide-react, react-resizable-panels, react-markdown, remark-gfm |
| Git | simple-git |
| AI | OpenAI-compatible `/v1/chat/completions` (direct from main process) |
| Web search | Tavily (optional) |
| Persistence | File system only |

## Prerequisites

- **Node.js 18+** and npm
- An **OpenAI-compatible LLM endpoint** (API key + URL)

## Setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Development

```bash
cd frontend
npm run dev
```

Starts Vite on **5173** (`vite --mode electron`), compiles the Electron main process and preload, and opens the **Electron** window.

### 3. LLM provider

On first launch, go to **Settings → LLM Providers** and add a provider:
- **API URL**: your OpenAI-compatible endpoint (e.g. `https://api.openai.com/v1`)
- **Model**: e.g. `gpt-4.1`
- **API Key**: your key

The configuration is stored in `~/.writing-assistant/ai-providers.json`.

### 4. Production build

```bash
cd frontend
npm run build:desktop
npm run start:electron
```

## Repository layout

```
markdown_project/
├── frontend/         # Electron + React UI
└── wiki/             # Example wiki folder (optional sample)
```

Example **writing project** layout:

```
my-book/
├── wiki/                      # Wiki entries (Markdown), AI: wiki_read / wiki_search
│   └── characters/
│       └── hero.md
├── story.md
├── chapters/                  # Buch-Modus (optional)
│   └── ...
└── .assistant/
    ├── project.yaml
    ├── modes/
    ├── glossary.md            # Optional; injected into AI context
    └── chat-history.json
```

## AI tools (summary)

| Tool | Purpose |
|------|---------|
| `read_file` | Read any project file by path |
| `search_project` | Find paths/filenames matching a query |
| `wiki_read` | Read `wiki/**/*.md` |
| `wiki_search` | Text search in `wiki/` |
| `glossary_add` | Append term to `.assistant/glossary.md` |
| `write_file` | Create/overwrite a file + revert snapshot (Change card in chat) |
| `web_search` | Tavily (if configured) |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current file |
| `Ctrl+Enter` | Send chat message |
| `Ctrl+Shift+A` | Command palette |
| `Ctrl+Shift+F` | Project-wide search panel |

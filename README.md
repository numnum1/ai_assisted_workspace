# Writing Assistant

A local, AI-powered Markdown workspace with a three-panel Cursor-style UI: file tree, editor (CodeMirror 6), and AI chat. All files stay on your machine — AI completions are fetched directly from any OpenAI-compatible API. Optional **Buch** and **Musik** workspace modes add structured hierarchies (chapters/scenes or song parts) on top of the same editor.

## Features

### Editor & UI
- **Three-panel layout** with resizable panels (file tree, editor, chat)
- **Chat Threads**: fork a conversation from any assistant message; nested history in the threads rail, fullscreen split-pane (parent + thread view), and a summarize-to-parent flow to merge a thread back
- **Editor tabs**: multiple files open at once; unsaved changes marked with a dot
- **CodeMirror 6** Markdown editor with syntax highlighting and dark theme
- **Markdown preview** via `react-markdown` with GFM support
- **Keyboard shortcuts**: `Ctrl+S` save, `Ctrl+Enter` send chat, `Alt+E` Quick Chat, `Ctrl+Shift+F` project-wide text search, `Ctrl+Shift+A` command palette

### AI Chat
- **Streaming** via the Electron main process (SSE-shaped events over IPC), rendered token-by-token
- **Tool calling**: `read_file` (with optional offset/limit), `grep` (regex search across project files), `semantic_search` (meaning-based search over project + wiki via a local vector index), `write_file` (create/overwrite), `edit_file` (targeted string replace), `ask_clarification` (multi-choice questions), `ask_yes_no`
- **Context assembly**: chat mode, workspace-mode prompt add-on, story structure overview, file tree listing, always-include files, active file, `@` references, and tool instructions — assembled into the system prompt and user message
- **`@file` references**: e.g. `@chapters/01.md` or `@chapters/01.md:10-25` for line ranges; drag-and-drop file references from the tree into the chat input
- **Change cards**: after `write_file` / `edit_file`, the chat shows a diff with **Apply** / **Revert** (restore previous file content via a snapshot)
- **Right-hand AI dock** (in the chapter editor): an icon rail switching between three exclusive functions — **Kommentare** (wiki-aware inline review comments), **Schreibhilfe** (continuation/rewrite chat that sees the current unit's text and can insert its reply at the cursor), and **Ideenfinder** (free-form brainstorming chat)
- **Quick Chat** (`Alt+E`): a small floating, ephemeral chat window independent of the project conversation history
- **Multiple LLM providers**: OpenAI-compatible endpoints, configured per project (fast + optional reasoning model per provider)
- **Chat history**: per project in `.assistant/chat-history.json` (supports threads/branching conversations)
- **Reasoning mode**: optional per-message reasoning effort (low/medium/high) when the active provider has a reasoning model configured

### Modes
Built-in chat modes change the system prompt (e.g. Story Review, Continuity Check, Spelling and Style, Brainstorm). Custom modes: `.assistant/modes/`.

### Workspace Modes
| Mode | Description |
|------|-------------|
| **Standard** | Generic workspace |
| **Buch** | Chapter → Scene → Action hierarchy + metadata schemas, arc/Spannungsbogen tracking |
| **Musik** | Song / lyrics-oriented structure |

Custom workspace modes via YAML (**Workspace plugins** in project settings).

### Wiki (`/wiki/`)
- **Markdown files only** under `wiki/` at the project root (visible in the file tree). No JSON types or CRUD API for "entries".
- **Optional YAML frontmatter** for your own metadata; the app treats the file as plain text. Titles come from a `# ` heading or a `name:` line near the top of the file.
- The AI tools (`read_file`, `grep`, `semantic_search`) all work over `wiki/**/*.md` the same as any other project file; `semantic_search` additionally accepts `scope: "wiki"` to search only the wiki.
- **Migrating old JSON wiki exports**: right-click a `.json` file in the tree → **„Nach Markdown konvertieren…"** (legacy shape `{ id, typeId, values: { … } }` or flat string-only objects).

### Semantic search / vector index
An optional local vector index over project files and the wiki backs `semantic_search`. Build/refresh it from project settings; see [`docs/vector-search.md`](docs/vector-search.md) for details.

### Git Integration
Status, diff, log, commit, revert, sync, file history — via simple-git (no separate Git server required).

### Project configuration (`.assistant/`)
- `project.yaml` — workspace mode, always-include paths, etc.
- `modes/` — custom chat modes
- `chat-history.json` — persisted chats

### Other
- **Subprojects** (media projects inside a folder, e.g. music)
- **Typed files** (JSON Schema–driven) with AI-assisted autofill
- **Desktop**: open project in OS file manager, native folder picker (Windows)

## Tech Stack

| Layer | Technology |
|-------|------------|
| App | Electron 33 |
| Frontend | React 19, TypeScript 5.9, CodeMirror 6 |
| Build | Vite 7 (renderer), esbuild (preload), tsc (main process) |
| UI | lucide-react, react-resizable-panels, react-markdown, remark-gfm |
| Git | simple-git |
| AI | OpenAI-compatible `/v1/chat/completions` (called directly from the Electron main process) |
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

Other useful scripts (run from `frontend/`):

| Script | Purpose |
|--------|---------|
| `npm run dev:web` | Vite only, no Electron window (renderer dev without the desktop shell — the app itself still requires the Electron bridge to talk to the backend) |
| `npm run build` | Type-check + build the renderer |
| `npm run build:desktop` | Full build (renderer + main process + preload) |
| `npm run start:electron` | Run the built app |
| `npm run dist:win` | Package a Windows installer (electron-builder) |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

### 3. LLM provider

On first launch, go to **Settings → LLM Providers** and add a provider:
- **API URL**: your OpenAI-compatible endpoint (e.g. `https://api.openai.com/v1`)
- **Model**: e.g. `gpt-4.1`
- **API Key**: your key

### 4. Production build

```bash
cd frontend
npm run build:desktop
npm run start:electron
```

## Repository layout

```
markdown_project/
├── frontend/         # Electron + React UI (see frontend/src, frontend/electron)
└── wiki/             # Example wiki folder (optional sample)
```

Example **writing project** layout:

```
my-book/
├── wiki/                      # Wiki entries (Markdown); searched/read by the AI tools
│   └── characters/
│       └── hero.md
├── story.md
├── chapters/                  # Buch-Modus (optional)
│   └── ...
└── .assistant/
    ├── project.yaml
    ├── modes/
    └── chat-history.json
```

## AI tools (summary)

| Tool | Purpose |
|------|---------|
| `read_file` | Read a project (or wiki) file by path, optionally a line slice |
| `grep` | Exact regex search across project files, reports file + line |
| `semantic_search` | Meaning-based search over project files and/or wiki (vector index) |
| `write_file` | Create/overwrite a file (Change card in chat, revertible) |
| `edit_file` | Targeted exact-string replace in an existing file (Change card in chat, revertible) |
| `ask_clarification` | Multiple-choice clarifying question(s), rendered as buttons |
| `ask_yes_no` | Yes/No question, rendered as two buttons |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save current file |
| `Ctrl+Enter` | Send chat message |
| `Alt+E` | Toggle Quick Chat |
| `Ctrl+Shift+A` | Command palette |
| `Ctrl+Shift+F` | Project-wide search panel |

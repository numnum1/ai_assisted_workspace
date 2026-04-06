# Writing Assistant

A local, AI-powered creative writing workspace with a three-panel Cursor-style UI: file tree, Markdown editor (CodeMirror 6), and AI chat. All files stay on your local machine — the backend only calls an OpenAI-compatible API for AI completions.

## Features

### Editor & UI
- **Three-panel layout** with resizable panels (file tree, editor, chat)
- **CodeMirror 6** Markdown editor with syntax highlighting and dark theme
- **Markdown preview** via `react-markdown` with GFM support
- **Keyboard shortcuts**: `Ctrl+S` to save, `Ctrl+Enter` to send chat messages

### AI Chat
- **Streaming responses** via Server-Sent Events (SSE)
- **Tool calling**: The AI can read files, search the project, browse wiki entries, inspect story structure, propose notes, and optionally search the web — with up to 3 tool-calling rounds per request
- **Context assembly**: Active file, referenced files, wiki entries, chapter/book metadata, rules, mode prompts, and `always-include` paths are automatically assembled into the AI context
- **`@file` references**: Type `@characters/roland.md` or `@chapters/01.md:10-25` inline to include specific files or line ranges
- **Drag-and-drop file references**: Drag files from the tree into the chat input
- **Token tracking**: See estimated token counts before sending
- **Multiple LLM providers**: Configure multiple OpenAI-compatible endpoints with separate models, API keys, and optional reasoning models — stored in app data (`ai-providers.json`)
- **Chat history**: Saved per project in `.assistant/chat-history.json`

### Modes
Built-in chat modes change the AI's system prompt and behavior:

| Mode | Purpose |
|------|---------|
| **Story Review** | Analyze plot consistency, character behavior, pacing, emotion |
| **Continuity Check** | Find contradictions in timeline, descriptions, facts |
| **Spelling and Style** | Grammar, spelling, punctuation, tense, repetition |
| **Brainstorm** | Creative ideation — questions, alternatives, challenges |
| **Prompt-Paket** | Build a structured prompt block for pasting into an external LLM |
| **Struktur ausfüllen** | Fill structured JSON forms (scene/chapter metadata) from context |

Custom modes can be created per project in `.assistant/modes/` or globally in `backend/src/main/resources/modes/`.

### Workspace Modes
Workspace modes define the project type and structure:

| Mode | Description |
|------|-------------|
| **Standard** | Generic workspace — flat file structure, no special hierarchy |
| **Buch** (Book) | Chapter → Scene → Action hierarchy with rich metadata schemas (`book.json`, `kapitel.json`, `szene.json`, `akt.json`) |
| **Musik** (Music) | Song → Strophe structure for music/lyrics projects |

Custom workspace modes can be added to the app data directory.

### Wiki System
- **Type-based entries** stored in `.wiki/` within the project (e.g. characters, locations, organizations)
- **Full CRUD** via REST API and UI
- **Shadow files**: Per-file notes mirrored under `.wiki/files/` for annotating project files
- **AI-accessible**: Wiki entries are available as chat context and through AI tools

### Glossary (Glossar)
Optional vocabulary for your project: **term definitions and concepts** as Markdown files under `.glossary/`, separate from the structured wiki (JSON types/entries).

- **Enable**: Project Settings → **General** → check **Glossar aktivieren** (stored as `glossaryEnabled` in `.assistant/project.yaml`).
- **UI**: Command palette (`Ctrl+Shift+A`) → **Open Glossar** — floating, draggable panel with search, **create** (`+`), **rename**, **delete**, and open entry in the main **Markdown editor** (the panel stays open while you edit).
- **Storage**: `.glossary/*.md` with YAML frontmatter, e.g. `type`, `id`, `summary`, `aliases`, `tags`; body is free Markdown. The folder is created automatically when you save the first entry.
- **AI**: Registered tools **`glossary_search`** (query + optional type filter + limit) and **`glossary_read`** (full file by path under `.glossary/`).
- **API**: `GET /api/glossary/entries` returns a flat list with parsed frontmatter for the panel.

### Git Integration
- Status, diff, log, commit, revert, sync, file history, ahead/behind tracking
- Credential management and repository initialization
- All powered by JGit (no local Git installation required)

### Project Configuration
Per-project configuration lives in `.assistant/`:
- `project.yaml` — project settings, workspace mode selection, optional `glossaryEnabled` for the glossary feature
- `modes/` — custom chat modes
- `rules/` — custom AI rules included in every chat context
- `chat-history.json` — persisted chat history

### Additional Features
- **Notes**: Free-floating or attached to wiki entries, proposable by the AI via tool calling
- **Subprojects**: Initialize and manage sub-workspaces within a project
- **Typed files**: JSON Schema-driven structured files with AI-assisted filling
- **Desktop integration**: Open folders in the OS file manager, native directory picker (Windows)
- **Web search**: Optional Tavily integration for AI-powered web search during chat

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Java 17, Spring Boot 3.2, Spring Web (MVC), Spring WebFlux (AI streaming) |
| Build | Maven (backend), Vite 7 (frontend) |
| Frontend | React 19, TypeScript 5.9, CodeMirror 6 |
| UI | lucide-react, react-resizable-panels, react-markdown, remark-gfm |
| Git | JGit 7.6 |
| Token counting | jtokkit |
| AI | Any OpenAI-compatible API (`/v1/chat/completions`) |
| Web search | Tavily API (optional) |
| Persistence | File system only — no database |

## Prerequisites

- **Java 17+** (JDK)
- **Maven 3.6+**
- **Node.js 18+** and npm

## Setup

### 1. Configure the backend

Create or edit `backend/src/main/resources/application-local.yml` (this file is gitignored):

```yaml
app:
  ai:
    api-url: https://api.eecc.ai
    api-key: YOUR_API_KEY_HERE
    model: gpt-5.2
  project:
    path: C:\Users\you\Books\my-project
    always-include:
      - story.md
```

Alternatively, use environment variables:

| Variable | Description |
|----------|-------------|
| `AI_API_KEY` | API key for the OpenAI-compatible endpoint |
| `PROJECT_PATH` | Path to your writing project folder |
| `GITHUB_TOKEN` | GitHub token for Git sync operations |
| `TAVILY_API_KEY` | Tavily API key to enable web search (optional) |
| `APP_DATA_DIR` | Override the app data directory (default: `%APPDATA%/markdown-project` or `~/.config/markdown-project`) |

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Run in development mode

Open two terminals:

**Terminal 1 — Backend (port 8080):**
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

**Terminal 2 — Frontend (port 5173):**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser. The Vite dev server proxies `/api` requests to the backend.

### 4. Run in production mode (single server)

```bash
cd frontend
npm run build

# Copy build output to backend static resources
cp -r dist/* ../backend/src/main/resources/static/

cd ../backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Open http://localhost:8080 — the backend serves both the API and the UI.

## Project Structure

### Application layout

```
markdown_project/
├── backend/
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/assistant/
│       │   ├── Application.java
│       │   ├── config/          # AppConfig, conditions
│       │   ├── controller/      # REST controllers
│       │   ├── model/           # DTOs and domain models
│       │   ├── service/         # Business logic
│       │   │   └── tools/       # AI tool implementations
│       │   └── util/
│       └── resources/
│           ├── application.yml
│           ├── modes/           # Built-in chat modes (YAML)
│           ├── workspace-modes/ # Workspace mode definitions (YAML)
│           └── types/           # JSON Schema type definitions
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── api.ts               # HTTP client for /api/*
│       ├── components/          # UI components (editor, chat, git, wiki, ...)
│       ├── hooks/               # React hooks (project, chat, wiki, ...)
│       └── meta/                # Field types and metadata schemas
└── wiki/                        # Sample wiki structure
```

### Writing project layout

Your writing project is any folder with Markdown files. Example for a book project:

```
my-book/
├── story.md                     # Book summary (always included in AI context)
├── chapters/
│   ├── 01-introduction/
│   │   ├── kapitel.json         # Chapter metadata
│   │   ├── 01-opening/
│   │   │   ├── szene.json      # Scene metadata
│   │   │   └── content.md      # Scene text
│   │   └── 02-arrival/
│   │       └── ...
│   └── 02-the-journey/
│       └── ...
├── characters/
│   ├── protagonist.md
│   └── antagonist.md
├── locations/
│   └── castle.md
├── .wiki/                       # Wiki entries (managed by the app)
│   ├── types/
│   └── entries/
├── .glossary/                   # Optional glossary terms (.md + frontmatter), if feature enabled
└── .assistant/                  # Project config (managed by the app)
    ├── project.yaml
    ├── modes/
    └── rules/
```

## AI Tools

The AI can call these tools during chat to gather information:

| Tool | Description |
|------|-------------|
| **ReadFile** | Read a file from the project |
| **SearchProject** | Search for text across project files |
| **ReadFileMeta** | Read metadata of a file |
| **ReadStoryText** | Read story/prose content |
| **SearchStoryStructure** | Search through the chapter/scene structure |
| **WikiRead** | Read a wiki entry |
| **WikiSearch** | Search wiki entries |
| **GlossaryRead** | Read a glossary Markdown file under `.glossary/` |
| **GlossarySearch** | Search glossary entries by text and optional type |
| **SceneRead** | Read a specific scene |
| **SceneSearch** | Search through scenes |
| **ProposeNote** | Propose a note (free-floating or attached to a wiki entry) |
| **WebSearch** | Search the web via Tavily (only available when configured) |

## API Endpoints

All endpoints are under `/api`.

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | Project file tree |
| GET | `/api/files/content/**` | Read a file |
| PUT | `/api/files/content/**` | Save a file |
| DELETE | `/api/files/content/**` | Delete a file |
| POST | `/api/files/create-file` | Create a new file |
| POST | `/api/files/create-folder` | Create a new folder |
| POST | `/api/files/rename` | Rename a file or folder |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message (SSE stream) |
| POST | `/api/chat/sync` | Send message (non-streaming) |
| POST | `/api/chat/context-preview` | Preview assembled context and token count |

### Modes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/modes` | List available modes |
| GET | `/api/modes/{id}` | Get a specific mode |

### Git
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/git/status` | Repository status |
| GET | `/api/git/diff` | Working tree diff |
| GET | `/api/git/log` | Commit log |
| GET | `/api/git/ahead-behind` | Ahead/behind remote tracking |
| GET | `/api/git/file-history` | File commit history |
| GET | `/api/git/file-at-commit` | File content at a specific commit |
| POST | `/api/git/commit` | Create a commit |
| POST | `/api/git/revert-file` | Revert a single file |
| POST | `/api/git/revert-directory` | Revert a directory |
| POST | `/api/git/init` | Initialize a repository |
| POST | `/api/git/sync` | Sync with remote (pull + push) |
| POST | `/api/git/credentials` | Set Git credentials |

### Chapters & Book Structure
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chapters` | List chapters |
| GET | `/api/chapters/{id}` | Get chapter details |
| POST | `/api/chapters` | Create a chapter |
| PUT | `/api/chapters/{id}/meta` | Update chapter metadata |
| DELETE | `/api/chapters/{id}` | Delete a chapter |
| | `/api/chapters/{id}/scenes/...` | Scene CRUD (nested) |
| | `/api/chapters/{id}/scenes/{id}/actions/...` | Action CRUD (nested) |
| GET/PUT | `/api/book/meta` | Book-level metadata |

### Wiki
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wiki/types` | List wiki types |
| POST | `/api/wiki/types` | Create a wiki type |
| | `/api/wiki/types/{id}/entries/...` | Entry CRUD per type |

### Glossary
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/glossary/entries` | List all `.md` files under `.glossary/` with parsed frontmatter |

### Project & Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/project/current` | Current project info |
| POST | `/api/project/open` | Open/switch project |
| POST | `/api/project/browse` | Native folder picker |
| POST | `/api/project/reveal` | Open in OS file manager |
| GET | `/api/project-config` | Project configuration |
| GET | `/api/project-config/workspace-modes` | Available workspace modes |
| GET/PUT | `/api/project-config/rules/...` | Manage project rules |

### LLM Providers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/llms` | List configured providers |
| POST | `/api/llms` | Add a provider |
| PUT | `/api/llms/{id}` | Update a provider |
| DELETE | `/api/llms/{id}` | Remove a provider |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT/DELETE | `/api/shadow/...` | Shadow wiki files (per-file notes) |
| POST/GET/DELETE | `/api/notes/...` | Free and entry-attached notes |
| GET | `/api/outliner` | Outliner view |
| GET | `/api/types` | Available typed file schemas |
| GET/PUT | `/api/typed-files/content/**` | Read/write typed files |
| POST | `/api/typed-files/fill/**` | AI-fill a typed file |
| GET/POST/DELETE | `/api/subproject/...` | Subproject management |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save the current file |
| `Ctrl+Enter` | Send chat message |
| `Ctrl+Shift+A` | Command palette (includes **Open Glossar** when glossary is enabled) |
| `Ctrl+Shift+Space` | Toggle wiki browser |

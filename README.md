# Writing Assistant

A local AI-powered creative writing assistant with a Cursor-like UI. It connects to your company's OpenAI-compatible AI API while keeping all files on your local machine.

## Features

- **Three-panel layout**: File tree, Markdown editor (CodeMirror), and AI chat panel
- **Drag-and-drop file references**: Drag files from the tree into the chat to include them as context
- **`@file` references**: Type `@characters/roland.md` or `@chapters/01.md:10-25` inline in messages
- **Custom modes**: Review, Continuity Check, Spelling, Brainstorm — each with a specialized system prompt
- **Automatic context assembly**: `story.md` and the active file are always included; referenced files are added on demand
- **Git integration**: Status, commit, diff, and log via built-in endpoints
- **Dark theme**: Comfortable for long writing sessions
- **Token tracking**: See how many tokens are being sent in each request

## Prerequisites

- **Java 17+** (JDK)
- **Maven 3.6+**
- **Node.js 18+** and npm

## Setup

### 1. Configure the backend

Edit `backend/src/main/resources/application-local.yml` (this file is gitignored):

```yaml
app:
  ai:
    api-url: https://api.eecc.ai
    api-key: YOUR_API_KEY_HERE
    model: gpt-5.2
  project:
    path: C:\Users\marcm\Books\my-project
    always-include:
      - story.md
```

Set `project.path` to the folder containing your writing project (the folder with your markdown files).

### 2. Install frontend dependencies

```bash
cd frontend
npm install
```

### 3. Run in development mode

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

### 4. Run in production mode (single server)

```bash
# Build the frontend
cd frontend
npm run build

# Copy the build output to the backend's static resources
cp -r dist/* ../backend/src/main/resources/static/

# Run the backend (serves both API and UI)
cd ../backend
mvn spring-boot:run -Dspring-boot.run.profiles=local
```

Open http://localhost:8080 in your browser.

## Project Structure

Your writing project should be a folder with markdown files, for example:

```
my-book/
├── story.md              (summary of the whole book — always in context)
├── chapters/
│   ├── 01-introduction.md
│   ├── 02-the-journey.md
│   └── ...
├── characters/
│   ├── protagonist.md
│   └── antagonist.md
├── locations/
│   └── castle.md
└── organisations/
    └── guild.md
```

## Modes

Modes change the AI's behavior. Each mode is a YAML file in `backend/src/main/resources/modes/`:

| Mode | Purpose |
|------|---------|
| **Review** | Analyze plot consistency, character behavior, pacing |
| **Continuity** | Find contradictions in timeline, descriptions, facts |
| **Spelling** | Check grammar, spelling, punctuation, style |
| **Brainstorm** | Creative collaboration — ideas, "what if" scenarios |

### Creating custom modes

Add a new YAML file to `backend/src/main/resources/modes/`:

```yaml
name: Worldbuilding
systemPrompt: |
  You are a worldbuilding consultant. Help the user develop
  consistent and rich settings, magic systems, and cultures.
  Ask probing questions about implications and edge cases.
autoIncludes:
  - story.md
```

Restart the backend to pick up new modes.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files` | GET | Get project file tree |
| `/api/files/content/{path}` | GET | Read a file |
| `/api/files/content/{path}` | PUT | Save a file |
| `/api/chat` | POST | Send chat message (SSE stream) |
| `/api/chat/sync` | POST | Send chat message (non-streaming) |
| `/api/chat/context-preview` | POST | Preview what context would be assembled |
| `/api/modes` | GET | List available modes |
| `/api/git/status` | GET | Git status |
| `/api/git/commit` | POST | Git commit |
| `/api/git/diff` | GET | Git diff |
| `/api/git/log` | GET | Git log |
| `/api/git/init` | POST | Initialize git repo |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save the current file |
| `Ctrl+Enter` | Send chat message |

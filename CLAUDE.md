# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A local, AI-powered Markdown workspace for creative writing (Electron desktop app). Three-panel Cursor-style UI: file tree, CodeMirror 6 editor, AI chat. All project files stay on the local filesystem; the AI talks directly to any OpenAI-compatible `/v1/chat/completions` endpoint. Optional **Buch** (chapter → scene → action) and **Musik** workspace modes add structured hierarchies on top of the same plain-Markdown editor.

There is **no separate backend server** — despite what `.cursor/rules/` (gitignored, stale, describes an old Spring-backend/REST-API architecture) says. All backend logic lives in the Electron main process under `frontend/electron/`, called from the renderer via `window.appBridge` (contextBridge/IPC), never HTTP.

All app code lives under `frontend/`.

## Commands

Run everything from `frontend/`:

```bash
npm install          # install deps
npm run dev          # Vite (5173) + tsc watch (main) + esbuild watch (preload) + Electron window
npm run dev:web      # Vite only, no Electron shell (renderer dev; app still needs the Electron bridge for real functionality)
npm run build        # tsc -b && vite build (renderer only)
npm run build:electron   # compile main process (tsconfig.electron.json) + preload
npm run build:desktop    # build + build:electron
npm run start:electron   # run the built app
npm run dist:win     # electron-builder Windows installer
npm run lint          # eslint .
npm test              # vitest run
npm run preview       # vite preview
```

Single test file: `npx vitest run path/to/file.test.ts`. Watch mode: `npx vitest`.
Typecheck only (no emit): `npx tsc -p tsconfig.app.json --noEmit`.

Tests live beside the code they test (`src/**/*.test.ts`, `electron/**/*.test.ts`); config in `vitest.config.ts` runs them under `environment: 'node'`.

There is no dedicated browser preview: this is an Electron-only app and `window.appBridge` is undefined outside it, so a plain-browser dev server cannot exercise real functionality. Verify changes with `tsc`/`eslint`/`vitest`, not a browser preview.

## Architecture

### Two processes, one bridge

- **`frontend/electron/main.ts`** — Electron main process. Registers all IPC handlers as `ipcMain.handle("<namespace>:<action>", ...)`, one namespace per concern (`project:*`, `files:*`, `wiki:*`, `git:*`, `chat:*`, `chapter:*`, `book:*`, `subproject:*`, `typedFiles:*`, `vector:*`, `search:*`, `arcs:*`, `snapshots:*`, `llms:*`, `projectConfig:*`, `preferences:*`, `ensemble:*`). The actual logic for each namespace lives in a matching file under **`frontend/electron/services/`** (e.g. `filesService.ts`, `gitService.ts`, `chapterService.ts`, `vectorService.ts`, `chatService.ts` + `chatToolExecution.ts` + `openAiClient.ts` + `conversation/` for the chat/tool-calling pipeline).
- **`frontend/electron/preload.ts`** — the only place allowed to call `ipcRenderer`. It builds the `window.appBridge` object (typed as `AppBridge` in `frontend/src/electron/bridge.ts`) that the renderer sees; namespaces mirror the main-process ones (`bridge.files.getContent(...)`, `bridge.chat.startStream(...)`, etc.).
- **`frontend/src/api.ts`** — the renderer-side facade over `window.appBridge`. Every domain export (`filesApi`, `gitApi`, `chapterApi`, `wikiApi`, `vectorApi`, `projectApi`, `projectConfigApi`, `llmApi`, `bookApi`, `subprojectApi`, `typedFilesApi`, `snapshotsApi`, `arcApi`, `chatApi`, `searchApi`) is a thin `getAppBridge()?.xxx.yyy(...)` call that throws if the bridge is missing. UI code should go through `api.ts`, not `window.appBridge` directly.

### AI / chat layer (`frontend/src/services/ai/`)

General-purpose AI plumbing is centralized here, separate from domain-specific AI calls that stay in `api.ts` (e.g. `chapterApi.generateComments`, `typedFilesApi.fill`):

- `aiStreamTransport.ts` — `startChatStream(request, handlers)`: the only place that owns the raw IPC chat-stream lifecycle (start/subscribe/abort) and maps wire events to a typed `AiStreamHandlers` object (`onToken`, `onContext`, `onDone`, `onError`, `onToolCall`, `onToolHistory`, `onContextUpdate`, `onResolvedUserMessage`).
- `aiStreamToState.ts` — `attachAssistantStream(...)`: adapts that transport onto React state (the transcript, tool rows, context info), honoring `CHAT_ASSISTANT_UI_MODE` (`live` token-by-token vs. `on-done` single flush) from `src/config/chatAssistantUi.ts`.
- `chatHistory.ts` — `buildChatHistoryPayload`, the single canonical transform from the in-memory transcript to the wire history payload (resolves `resolvedContent`, strips plan fences, etc.). `hooks/chatHistoryPayload.ts` is a back-compat re-export.
- `aiService.ts` — facade (`startChatStream`, `summarizeThread`).
- **`frontend/src/hooks/useAiStream.ts`** — the shared streaming state machine (messages, `streaming`/`error`/`toolActivity`, abort, retry) that every chat surface builds on:
  - `useChat` — main project chat (edit/fork/delete/feedback, mode + toolkit + reasoning wiring)
  - `useQuickChat` — ephemeral floating Quick Chat (`Alt+E`), localStorage-persisted, no project references
  - `usePanelChat` — the docked chapter-editor AI panel chats (Schreibhilfe / Ideenfinder), used by `components/editor/ChapterAiDock.tsx`

`hooks/useConversationModel.ts` and `chatApi.previewContext` (the "context preview" / conversation-inspector path) are dead code — not imported anywhere in the current app. Don't extend it; it's a candidate for removal.

### Chat request shape and tool loop

`ChatRequest` (`src/types.ts`) carries `message`, `mode`, `referencedFiles`, `history`, `useReasoning`/`reasoningEffort`, `llmId`, `disabledToolkits`, `quickChat`, `rulesDisabled`. Toolkits (`CHAT_TOOLKIT_IDS` in `types.ts`: `web`, `dateisystem`, `assistant`) gate which tool definitions the model sees; the actual tool schemas live in `electron/services/conversation/systemPrompt.ts` under `TOOLKIT_TOOL_DEFINITIONS`. Current tools: `read_file`, `grep`, `semantic_search`, `write_file`, `edit_file`, `ask_clarification`, `ask_yes_no` — execution for each is in `electron/services/chatToolExecution.ts`. `write_file`/`edit_file` results render as Change cards in the chat with Apply/Revert backed by `snapshotsApi`.

### Editor / structure domain

Workspace modes (`Standard`, `Buch`, `Musik`) determine the structure UI on top of plain Markdown files. In **Buch** mode the hierarchy is Chapter → Scene → Action, each carrying a `NodeMeta { title, description, sortOrder, extras? }` (see `chapterApi` in `api.ts` and `ChapterNode`/`SceneNode`/`ActionNode`/`NodeMeta` in `types.ts`) — this is deliberately simple, not the elaborate JSON schema historically sketched in `.cursor/rules/`. Chapter comments (AI-generated inline review notes) are a separate concept driven by `CommentCategoryDef` and `chapterApi.generateComments`.

Wiki entries are plain Markdown under `wiki/**/*.md` at the project root — no JSON "entry" types, no dedicated wiki-only AI tools. `read_file`/`grep`/`semantic_search` operate over wiki files the same as any other project file (`semantic_search` additionally accepts `scope: "wiki"`).

### Naming conventions

- Components: PascalCase under `src/components/<domain>/`.
- Hooks: `useXxx.ts` under `src/hooks/`.
- Shared types: `src/types.ts`.
- Functional components only; explicit prop interfaces; dependency arrays always explicit (ESLint's `react-hooks` rules are enforced — `npm run lint` will catch `rules-of-hooks` and stale-ref violations).

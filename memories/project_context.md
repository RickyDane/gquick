# Project Context

## Overview

**GQuick** is a cross-platform desktop productivity launcher built with **Tauri v2** (Rust backend) and **React 19** (TypeScript frontend). It provides a Spotlight-like interface with global keyboard shortcuts for quick app launching, file search (with AI-powered smart search), Docker management, calculations, web search, AI translation, screenshot capture, OCR text extraction, and a real AI chat interface with image support.

## Architecture Summary

GQuick follows a **Tauri 2.0 architecture** with a clear separation between a Rust-native backend (system integration, screen capture, OCR, file indexing, shortcuts, tray) and a React frontend (UI, plugin system, settings, AI chat). The app uses a transparent, borderless window that can be toggled via global shortcuts; before showing/focusing the launcher, Rust records the previous foreground app/window and best-effort restores it when the launcher hides or closes.

The **Plugin Tools** feature extends the plugin system so that plugins can expose structured functions that AI models (OpenAI, Kimi, Gemini, Claude) can invoke during chat conversations. Tool definitions are provider-agnostic; format conversion happens at API request time. Tool results feed back into conversation history, enabling multi-turn tool use. See `arch/plugin-tools.md` for full architecture.

```mermaid
graph TB
    subgraph "Frontend (React 19 + TypeScript)"
        A[App.tsx<br/>Search + Chat + Actions] --> B[Plugin System]
        A --> C[Settings.tsx<br/>API + Shortcuts Config]
        D[Selector.tsx<br/>Region Selection] --> E[Tauri Commands]
        B --> F[App Launcher]
        B --> G[Calculator]
        B --> H[Docker Manager]
        B --> I[Web Search]
        B --> J[File Search]
        B --> K[Translate]
        B --> BB[Notes]
        B --> NN[Network Info]
        B --> TM[Tool Manager<br/>Plugin Tools for AI Chat]
        A --> TM
    end

    subgraph "Tauri Bridge"
        E --> L[invoke commands]
        M[Global Shortcuts] --> N[Shortcut Handler]
        O[Events] --> P[listen/emit]
    end

    subgraph "Backend (Rust)"
        L --> Q[list_apps / open_app]
        L --> R[capture_region]
        L --> S[search_files / smart_search_files]
        L --> T[Docker Commands]
        L --> U[update_shortcut]
        L --> CC[create_note / get_notes / search_notes]
        N --> V[Window Manager]
        V --> W[System Tray]
        R --> X[xcap crate]
        R --> Y[image crate]
        R --> Z[tesseract crate<br/>macOS only]
        S --> AA[FileIndex + walkdir]
        CC --> DD[(SQLite<br/>rusqlite)]
    end

    subgraph "System"
        X --> AB[Screen Capture]
        Y --> AC[Image Crop/Save]
        Z --> AD[OCR Text Extraction<br/>macOS: Tesseract | Win/Linux: AI Vision]
        T --> AE[Docker CLI]
        Q --> AF[macOS/Win/Linux Apps]
        W --> AG[Menu Bar Icon]
        AA --> AH[File System]
    end
```

## Key Components

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **App** | `src/App.tsx` | Main launcher: search input, results list, chat view, actions overlay, keyboard handling |
| **Selector** | `src/Selector.tsx` | Fullscreen transparent overlay for region selection (screenshot/OCR) |
| **Settings** | `src/Settings.tsx` | Configuration: API providers, API keys, model selection, global shortcut recording |
| **Root** | `src/main.tsx` | Window label router (App vs Selector based on Tauri window label) |
| **MarkdownMessage** | `src/components/MarkdownMessage.tsx` | Renders AI chat responses with Markdown, code blocks, tables, GFM |
| **Tooltip** | `src/components/Tooltip.tsx` | Hover tooltip component used in chat and UI |
| **ShortcutRecorder** | `src/components/ShortcutRecorder.tsx` | Interactive shortcut capture for settings |
| **NotesView** | `src/components/NotesView.tsx` | Full CRUD notes management UI |

### Backend Commands (Rust)

| Command | File | Responsibility |
|---------|------|----------------|
| `list_apps` | `src-tauri/src/lib.rs` | Scans system app directories (macOS `.app`, Windows `.lnk`, Linux `.desktop`) |
| `open_app` | `src-tauri/src/lib.rs` | Launches apps via `open` (macOS), `start` (Windows), `xdg-open` (Linux) |
| `capture_region` | `src-tauri/src/lib.rs` | Hides window, captures screen via `xcap`, crops region, saves to Desktop. Screenshot: copies image. OCR: runs Tesseract (macOS) or emits base64 image (Win/Linux) |
| `search_files` | `src-tauri/src/lib.rs` | Fast filename-based file search with keyword scoring |
| `smart_search_files` | `src-tauri/src/lib.rs` | AI-enhanced file search: reads file metadata, content previews, time filters |
| `open_file` | `src-tauri/src/lib.rs` | Opens files via `tauri-plugin-opener` |
| `list_containers` | `src-tauri/src/lib.rs` | Runs `docker ps -a` and parses output |
| `list_images` | `src-tauri/src/lib.rs` | Runs `docker images` and parses output |
| `manage_container` | `src-tauri/src/lib.rs` | Starts/stops/restarts Docker containers |
| `delete_image` | `src-tauri/src/lib.rs` | Removes Docker images |
| `update_main_shortcut` | `src-tauri/src/lib.rs` | Dynamically updates the global launcher shortcut |
| `update_screenshot_shortcut` | `src-tauri/src/lib.rs` | Dynamically updates the screenshot shortcut |
| `update_ocr_shortcut` | `src-tauri/src/lib.rs` | Dynamically updates the OCR shortcut |
| `open_image_dialog` | `src-tauri/src/lib.rs` | Native file picker for chat image attachments |
| `close_selector` | `src-tauri/src/lib.rs` | Closes the selector window from Rust |
| `greet` | `src-tauri/src/lib.rs` | Demo command (unused) |
| `create_note` | `src-tauri/src/lib.rs` | Creates a new note in SQLite |
| `get_notes` | `src-tauri/src/lib.rs` | Gets all notes ordered by updated_at desc |
| `update_note` | `src-tauri/src/lib.rs` | Updates note title/content |
| `delete_note` | `src-tauri/src/lib.rs` | Deletes a note |
| `search_notes` | `src-tauri/src/lib.rs` | Full-text search on title and content (with LIKE wildcard escaping) |
| `get_note_by_id` | `src-tauri/src/lib.rs` | Gets single note by ID |

### Plugin System

Located in `src/plugins/`. Each plugin implements `GQuickPlugin` interface:

- **appLauncher**: Lists and launches system applications (cross-platform)
- **fileSearch**: Fast filename search + AI-powered smart file search with safe indexed-file content reading
- **calculator**: Evaluates math expressions in search bar
- **docker**: Manages Docker containers and images with inline actions
- **docker (target expansion)**: Docker Hub search should use Docker Hub public API from frontend; local image/container/compose operations should remain Rust Tauri commands backed by Docker CLI.
- **webSearch**: Opens Google search in default browser
- **translate**: AI-powered translation with quick-translate prefixes (`t:`, `tr:`, `>`) and full translation UI
- **notes**: Quick capture, search, and full CRUD notes management with SQLite persistence
- **networkInfo**: Displays local network information

### Plugin Tools for AI Chat

Plugins can optionally expose `tools` — structured functions the AI can invoke during chat. This enables the AI to perform real actions: search files, read documents, run calculations, query Docker, save notes, and launch apps.

**Architecture:**
- `src/plugins/types.ts` — `PluginTool`, `ToolResult`, `ToolParameter` interfaces added to `GQuickPlugin`
- `src/plugins/toolManager.ts` — Discovers all tools (`getAllTools()`) and routes execution (`executeTool()`)
- `src/utils/toolStreaming.ts` — Provider-specific streaming with tool call accumulation
- Tool calls are accumulated during SSE streaming, executed when the stream completes, and results fed back as new messages
- All three providers supported: OpenAI/Kimi (function calling), Gemini (function declarations), Anthropic (tool use)

**Initial Tools:**
| Plugin | Tools |
|--------|-------|
| calculator | `calculate` |
| fileSearch | `search_files`, `read_file` |
| notes | `search_notes`, `create_note` |
| docker | `list_containers`, `container_status` |
| webSearch | `web_search` |
| appLauncher | `list_apps`, `open_app` |
| networkInfo | `get_network_info` |

## Data Flow

### Search Flow
```
User types query
    ↓
App.tsx debounces input (150ms)
    ↓
Calls all plugins' getItems(query) in parallel
    ↓
Flattens results, sorts by score descending
    ↓
Displays in scrollable list
    ↓
Arrow keys navigate, Enter selects
```

### Smart File Search Flow
```
User types smart query (e.g., "find files about budgeting from last week")
    ↓
smart_search_files Rust command
    ↓
Builds file index (cached 5 min), scans home dir with bounded max depth (default 12, env-clamped 6-32)
    ↓
Returns candidates with metadata + safe content previews
    ↓
Frontend calls AI API to rank files by relevance
    ↓
Displays ranked results with "Smart" badge
```

The file index never follows or indexes symlinks, skips hidden paths and common system/build/cache folders, and caps indexing at 100,000 entries with an internal warning when results are truncated. `smart_search_files` reads metadata without following symlinks and only includes content previews/full content for files that pass the same safe-read policy as the AI `read_file` tool; unsafe files return metadata-only. The AI `read_file` tool only reads absolute text-file paths already present in the current search index; it rejects hidden paths, symlinks, likely secrets/credentials/key files, directories, non-regular files, and reads above the 200KB cap.

### Screenshot/OCR Flow
```
User presses Alt+S (screenshot) or Alt+O (OCR)
    ↓
Rust backend creates "selector" window (fullscreen transparent)
    ↓
User drags to select region
    ↓
Selector.tsx sends coordinates to capture_region command
    ↓
Rust: hides selector → 150ms delay → xcap captures screen
    ↓
Crops region, saves to ~/Desktop/gquick_capture.png
    ↓
If screenshot mode: copies image to clipboard
If OCR mode:
  macOS: runs Tesseract OCR → copies text to clipboard + emits ocr-complete event
  Windows/Linux: reads image as base64 → emits ocr-image-ready → frontend calls AI vision API → copies text to clipboard
```

### AI Chat Flow (Real — Not Mocked)
```
User switches to chat view (Cmd/Ctrl + Left Shift + C or Actions menu)
    ↓
App.tsx renders chat UI with message history
    ↓
User sends message (+ optional image attachments up to 5)
    ↓
App.tsx collects available tools from all plugins via toolManager
    ↓
App.tsx calls streaming API based on selected provider:
    - OpenAI / Kimi → streamOpenAI (SSE)
    - Google Gemini → streamGemini (SSE)
    - Anthropic Claude → streamAnthropic (SSE)
    ↓
Assistant response streams in real-time with Markdown rendering
    ↓
If AI decides to use tools:
    - Stream accumulates tool call arguments
    - App.tsx executes tools via plugin executeTool()
    - Tool results appended to conversation
    - Follow-up request sent for final response
    ↓
Supports multi-turn conversation with image inputs and tool use
```

### Quick Translate Flow
```
User types "t: Hello world" or "> Guten Morgen"
    ↓
App.tsx detects quick-translate prefix (400ms debounce)
    ↓
Calls performQuickTranslate → detects language → calls AI API
    ↓
Displays single result; Enter copies to clipboard and hides window
```

### Note Quick Capture Flow
```
User types "note: Buy milk"
    ↓
notesPlugin detects prefix in getItems()
    ↓
Shows "Save note: Buy milk" result
    ↓
Enter → calls create_note Rust command
    ↓
Dispatches gquick-note-saved event
    ↓
Window hides
```

### Note Search Flow
```
User types "search notes: meeting"
    ↓
notesPlugin detects prefix
    ↓
Calls search_notes with query
    ↓
Returns matching notes as search results
    ↓
Enter → copies note content to clipboard
```

### AI Chat Notes Context Flow
```
User asks "What did I save about the project?"
    ↓
isNoteRelatedQuery detects note keywords
    ↓
fetchNotesContext calls search_notes
    ↓
Relevant notes prepended to system prompt
    ↓
UI shows amber "Notes used as context" banner
    ↓
AI responds with note-aware answer
```

## Technology Stack

### Frontend
- **Framework**: React 19.1.0 with TypeScript 5.8.3
- **Build Tool**: Vite 7.0.4
- **Styling**: Tailwind CSS 4.2.4 with `@tailwindcss/vite` plugin
- **Icons**: Lucide React 1.8.0
- **Markdown**: react-markdown 10.1.0 + remark-gfm 4.0.1
- **Utilities**: clsx 2.1.1, tailwind-merge 3.5.0

### Backend
- **Framework**: Tauri 2.0 (Rust)
- **Screen Capture**: xcap 0.9
- **Image Processing**: image 0.25
        - **OCR**: tesseract 0.15 (macOS only); AI Vision Models — OpenAI, Kimi, Google Gemini, Anthropic (Windows/Linux via frontend)
- **File Walking**: walkdir 2
- **Fuzzy Matching**: fuzzy-matcher 0.3
- **Date/Time**: chrono 0.4
- **Directories**: dirs 5
- **Serialization**: serde, serde_json
- **Base64**: base64 0.22
- **SQLite**: rusqlite 0.32
- **Window Focus Restore**: `windows-sys` on Windows; `osascript` on macOS; `xdotool` best effort on Linux/X11

### Tauri Plugins Used
| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-opener` | Open URLs and files in default apps |
| `tauri-plugin-clipboard-manager` | Write images and text to clipboard |
| `tauri-plugin-global-shortcut` | Register global shortcuts (Alt+Space/S/O) |
| `tauri-plugin-shell` | Execute system commands |
| `tauri-plugin-fs` | File system operations |
| `tauri-plugin-dialog` | Native file dialogs (image picker) |
| `tauri-plugin-sql` | SQLite database (notes use rusqlite directly) |

## Global Shortcuts

| Shortcut | Action | Configurable |
|----------|--------|-------------|
| `Alt + Space` | Toggle main window visibility | Yes (via Settings) |
| `Alt + S` | Open region selector (screenshot mode) | Yes (via Settings) |
| `Alt + O` | Open region selector (OCR mode) | Yes (via Settings) |
| `⌘K` / `Ctrl+K` | Toggle actions overlay | No |
| `Cmd/Ctrl + Left Shift + C` | Switch to chat view; action palette displays `L⇧ C` | No |
| `⌘,` / `Ctrl+,` | Open settings | No |
| `⌘R` / `Ctrl+R` | Clear chat (in chat view) | No |
| `⌘N` / `Ctrl+N` | Open notes view | No |
| `Escape` | Close/hide current view | No |

Window focus restore is backend-owned: macOS reactivates the prior app by bundle id via `osascript`, Windows stores/restores the previous HWND via `windows-sys`, and Linux/X11 attempts best-effort activation via `xdotool`.

## AI Provider Integration

### Current State: Fully Implemented

The AI chat, translate, and smart file search features all make **real API calls** to configured providers.

### Supported Providers
- **OpenAI** — `https://api.openai.com/v1`
- **Kimi / Moonshot** — `https://api.moonshot.ai/v1`
- **Google Gemini** — `https://generativelanguage.googleapis.com/v1beta`
- **Anthropic Claude** — `https://api.anthropic.com/v1`

### Authentication
- **Method**: API key only (OAuth was removed)
- **Storage**: `localStorage` keys `api-key`, `api-provider`, `selected-model`
- **Security**: Keys stored in plaintext localStorage (known vulnerability)

### Features
- **Streaming responses**: Real-time SSE streaming for all providers
- **Model fetching**: Settings fetches live model lists from APIs (cached 24h)
- **Image inputs**: Chat supports up to 5 image attachments (vision models)
- **Multi-turn chat**: Full conversation history sent with each message

## OCR Implementation

### Current Implementation (Real Tesseract)
- **Trigger**: `Alt+O` global shortcut
- **Frontend**: `Selector.tsx` — fullscreen drag-to-select region
- **Backend**: `capture_region` command → `run_ocr()` function
- **Screen Capture**: Uses `xcap` crate to capture monitor, `image` crate to crop
- **OCR Engine**: **Tesseract** (`tesseract` crate 0.15) with English language model
- **macOS tessdata**: Looks in app resource directory for `tessdata/`
- **Output**: Extracted text written to clipboard; `ocr-complete` event emitted with preview
- **Save Location**: `~/Desktop/gquick_capture.png`

## File Search Implementation

### Fast Search (`search_files`)
- Keyword-based scoring on filename and path
- Returns top 50 results
- 5-minute file index cache
- Skips hidden dirs and common ignore patterns (`node_modules`, `.git`, `target`, etc.)

### Smart Search (`smart_search_files`)
- Natural language queries: "find files about X from last week"
- Reads file metadata (created, modified, size)
- Reads text file contents (up to 100KB) for preview
- Time filtering: `today`, `yesterday`, `last week`, `last month`, `recent`
- AI ranking: Sends file descriptions to configured AI model for relevance ranking

## Key Files and Responsibilities

| File | Responsibility |
|------|----------------|
| `src-tauri/src/lib.rs` | **Core backend**: all Tauri commands, shortcuts, tray, window mgmt/focus restore, file indexing, OCR |
| `src-tauri/src/main.rs` | Entry point — delegates to lib |
| `src-tauri/tauri.conf.json` | Tauri app config: window settings, security CSP, bundle config |
| `src-tauri/Cargo.toml` | Rust dependencies: tauri, xcap, image, tesseract, plugins |
| `src/App.tsx` | **Core frontend**: search, chat, actions, keyboard handling, image attachments |
| `src/Selector.tsx` | Region selection overlay for screenshot/OCR |
| `src/Settings.tsx` | API provider config, shortcut configuration, model fetching |
| `src/main.tsx` | Window routing (App vs Selector) |
| `src/utils/streaming.ts` | SSE streaming implementations for OpenAI, Gemini, Anthropic |
| `src/utils/toolStreaming.ts` | Provider-specific tool call streaming + accumulation |
| `src/utils/quickTranslate.ts` | Quick translate prefix detection + API calls |
| `src/components/MarkdownMessage.tsx` | Markdown rendering for chat messages |
| `src/components/ShortcutRecorder.tsx` | Interactive global shortcut recording |
| `src/plugins/index.ts` | Plugin registry (8 plugins) |
| `src/plugins/types.ts` | Plugin interface definitions (including PluginTool) |
| `src/plugins/toolManager.ts` | Tool discovery and execution routing |
| `src/plugins/appLauncher.tsx` | Cross-platform app discovery and launching |
| `src/plugins/fileSearch.tsx` | Fast + smart file search with AI ranking |
| `src/plugins/calculator.tsx` | Math expression evaluation |
| `src/plugins/docker.tsx` | Docker container/image management |
| `src/plugins/webSearch.tsx` | Google search via default browser |
| `src/plugins/translate.tsx` | AI translation with quick translate and full UI |
| `src/plugins/notes.tsx` | Quick capture, search, open view action for notes |
| `src/plugins/networkInfo.tsx` | Local network information display |
| `src/components/NotesView.tsx` | Full CRUD notes management UI |
| `package.json` | Frontend dependencies and scripts |
| `vite.config.ts` | Vite build config with Tauri dev server settings |

## Conventions

- **File naming**: PascalCase for components (`App.tsx`, `Settings.tsx`), camelCase for utilities
- **Styling**: Tailwind CSS with custom zinc/dark theme, heavy use of `bg-white/5`, `border-white/10`, `backdrop-blur`
- **Window styling**: Transparent background, no decorations, shadow disabled
- **State management**: React `useState`/`useEffect` only — no external state library
- **Storage**: `localStorage` for settings persistence (API keys, shortcuts, models)
- **Icons**: Lucide React exclusively
- **TypeScript**: Strict mode enabled
- **Debouncing**: 150ms for search, 400ms for quick translate API calls

## Current Sprint/Focus

Based on code analysis, the project is in **active development with core features implemented**:

1. **Fully working features**:
   - App launcher (cross-platform)
   - File search (fast + smart AI-powered)
   - Calculator
   - Docker management
   - Web search
   - Screenshot capture with clipboard copy
   - OCR text extraction (Tesseract)
   - AI chat with streaming (OpenAI, Gemini, Kimi, Anthropic)
   - AI translation (quick + full UI)
   - Notes plugin with quick capture, search, and CRUD UI
   - Global shortcuts (configurable)
   - System tray
   - Image attachments in chat

2. **In Progress / New Features**:
    - **Plugin Tools for AI Chat**: Architecture defined in `arch/plugin-tools.md`. Plugins expose tools; AI can call them during chat. Implementation pending across `src/plugins/`, `src/utils/streaming.ts`, and `src/App.tsx`.

3. **Partially implemented / potential improvements**:
    - API keys stored in plaintext localStorage
    - File index limited to home directory, max depth 6
    - No persistent chat history

## Key Decisions

1. **Tauri over Electron**: Chosen for smaller bundle size and native Rust performance
2. **Plugin architecture**: Decoupled search providers for extensibility
3. **Single HTML entry with window routing**: `main.tsx` uses Tauri window label to render App vs Selector
4. **Rust handles screen capture and OCR**: Frontend only sends coordinates; all capture/OCR logic in Rust
5. **localStorage for settings**: Simple but insecure for API keys — should migrate to Tauri secure storage or OS keychain
6. **Real AI streaming**: SSE-based streaming for responsive chat experience
7. **Tesseract for OCR**: Local OCR engine avoids sending screenshots to cloud APIs
8. **File index caching**: 5-minute TTL balances freshness vs performance
9. **SQLite via rusqlite for notes persistence**: Notes stored in local SQLite database with `rusqlite` crate for cross-platform persistence without external dependencies
10. **Docker boundary**: Frontend owns Docker Hub public API search and confirmations; Rust owns local Docker CLI/Compose execution with typed commands, CLI/daemon detection, and structured errors.
11. **Plugin Tools architecture**: Plugins optionally expose `tools` array + `executeTool` method. Tool discovery is centralized via `toolManager.ts`. Provider-specific format conversion happens at API call time. Tool results feed back into conversation as new messages, enabling multi-turn tool use.
12. **Focus restoration**: Rust records the foreground window/app before launcher activation and restores it on launcher hide/close to preserve the user's previous working context. Platform implementation is native where reliable and best-effort on Linux/X11.

## Docker Expansion Notes

- Add dedicated Docker page view opened by `Cmd/Ctrl + Left Shift + D` from `src/App.tsx`.
- Likely frontend files: `src/App.tsx`, `src/plugins/docker.tsx`, new `src/components/DockerView.tsx` or `src/pages/DockerPage.tsx`, optional `src/utils/dockerHub.ts`.
- Likely backend file: `src-tauri/src/lib.rs` for `docker_status`, `pull_image`, `run_container`, logs, exec, inspect, prune, and compose commands.
- Required explicit errors: Docker CLI missing (`CLI_MISSING`) and daemon not running (`DAEMON_DOWN`).
- Risky operations need confirmation: delete image/container, kill, prune, compose down with volumes, overwrite compose files, privileged/host-network/bind-mount runs, exec interactive shell.

## Security Notes

- API keys stored in plaintext `localStorage` (vulnerability)
- CSP allows `https:` and `http://localhost:*` connections
- `macos-private-api` enabled in Tauri config
- No encryption for chat history or file index data

## Build / CI

The project uses a GitHub Actions workflow (`.github/workflows/build.yml`) to build cross-platform releases for Linux, Windows, and macOS ARM64. macOS builds are automatically **code-signed and notarized** via Apple Developer ID certificates injected as GitHub secrets during CI. Updater artifacts are signed with a Tauri private key.

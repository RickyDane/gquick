# Project Context

## Overview

**GQuick** is a macOS-focused desktop productivity launcher application built with Tauri v2 (Rust backend) and React 19 (TypeScript frontend). It provides a Spotlight-like interface with global keyboard shortcuts for quick app launching, Docker management, calculations, web search, screenshot capture, OCR (planned), and an AI chat interface (mocked).

## Architecture Summary

GQuick follows a **Tauri 2.0 architecture** with a clear separation between a Rust-native backend (system integration, screen capture, shortcuts, tray) and a React frontend (UI, plugin system, settings). The app uses a transparent, borderless window that can be toggled via global shortcuts.

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   App.tsx   │  │ Selector.tsx│  │    Settings.tsx     │  │
│  │  (Search +  │  │(Region sel- │  │ (API keys, OAuth,   │  │
│  │   Chat UI)  │  │   ection)   │  │  OCR model config)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Plugin System (4 plugins)                  │  │
│  │  AppLauncher | Calculator | Docker | WebSearch         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri Commands / Events
┌──────────────────────────┴──────────────────────────────────┐
│                      BACKEND (Rust)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  list_apps  │  │capture_region│  │ Global Shortcuts    │  │
│  │  open_app   │  │(xcap + image)│  │ (Alt+Space/S/O)     │  │
│  │  Docker cmds│  │              │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  System Tray | Clipboard | Window Management           │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### Frontend Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **App** | `src/App.tsx` | Main launcher window: search input, results list, chat view, actions overlay |
| **Selector** | `src/Selector.tsx` | Fullscreen transparent overlay for region selection (screenshot/OCR) |
| **Settings** | `src/Settings.tsx` | Configuration UI for AI providers, API keys, OAuth, OCR model selection |
| **Root** | `src/main.tsx` | Window label router (decides App vs Selector based on Tauri window label) |

### Backend Commands (Rust)

| Command | File | Responsibility |
|---------|------|----------------|
| `list_apps` | `src-tauri/src/lib.rs:120` | Scans `/Applications` and `/System/Applications` for `.app` bundles |
| `open_app` | `src-tauri/src/lib.rs:218` | Launches macOS apps via `open` command |
| `capture_region` | `src-tauri/src/lib.rs:151` | Hides window, captures screen via `xcap`, crops region, saves to Desktop |
| `list_containers` | `src-tauri/src/lib.rs:39` | Runs `docker ps -a` and parses output |
| `list_images` | `src-tauri/src/lib.rs:66` | Runs `docker images` and parses output |
| `manage_container` | `src-tauri/src/lib.rs:107` | Starts/stops/restarts Docker containers |
| `delete_image` | `src-tauri/src/lib.rs:94` | Removes Docker images |
| `greet` | `src-tauri/src/lib.rs:10` | Demo command (unused) |

### Plugin System

Located in `src/plugins/`. Each plugin implements `GQuickPlugin` interface:

- **appLauncher**: Lists and launches macOS applications
- **calculator**: Evaluates math expressions in search bar
- **docker**: Manages Docker containers and images
- **webSearch**: Opens Google search in default browser

## Data Flow

### Search Flow
```
User types query
    ↓
App.tsx debounces input (50ms)
    ↓
Calls all plugins' getItems(query) in parallel
    ↓
Flattens results, displays in scrollable list
    ↓
Arrow keys navigate, Enter selects
```

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
If screenshot mode: opens image with `open`
If OCR mode: writes mock text to clipboard (AI integration pending)
```

### Chat Flow (Currently Mocked)
```
User switches to chat view (⌘C or Actions menu)
    ↓
App.tsx renders chat UI with message history
    ↓
User sends message → added to local state
    ↓
600ms delay → mock assistant response appended
    ↓
(No real AI API calls yet)
```

## Technology Stack

### Frontend
- **Framework**: React 19.1.0 with TypeScript 5.8.3
- **Build Tool**: Vite 7.0.4
- **Styling**: Tailwind CSS 4.2.4 with `@tailwindcss/vite` plugin
- **Icons**: Lucide React 1.8.0
- **Utilities**: clsx 2.1.1, tailwind-merge 3.5.0

### Backend
- **Framework**: Tauri 2.0 (Rust)
- **Screen Capture**: xcap 0.9
- **Image Processing**: image 0.25
- **Serialization**: serde, serde_json

### Tauri Plugins Used
| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-opener` | Open URLs in default browser |
| `tauri-plugin-clipboard-manager` | Write OCR text to clipboard |
| `tauri-plugin-global-shortcut` | Register Alt+Space/S/O shortcuts |
| `tauri-plugin-shell` | Execute system commands |
| `tauri-plugin-fs` | File system operations |
| `tauri-plugin-dialog` | Native dialogs |
| `tauri-plugin-sql` | SQLite database (initialized but unused) |

## Global Shortcuts

| Shortcut | Action | Handler |
|----------|--------|---------|
| `Alt + Space` | Toggle main window visibility | `lib.rs:264` |
| `Alt + S` | Open region selector (screenshot mode) | `lib.rs:266` |
| `Alt + O` | Open region selector (OCR mode) | `lib.rs:266` |
| `⌘K` / `Ctrl+K` | Toggle actions overlay | `App.tsx:48` |
| `⌘C` / `Ctrl+C` | Switch to chat view | `App.tsx:53` |
| `⌘,` / `Ctrl+,` | Open settings | `App.tsx:58` |
| `Escape` | Close/hide current view | `App.tsx:63` |

## AI Provider Integration

### Current State: UI-Only / Mocked

The Settings panel (`src/Settings.tsx`) provides UI for AI provider configuration, but **no actual AI API integration exists yet**.

### OAuth (UI Only)
- **Location**: `src/Settings.tsx:34-40`
- **Providers**: Google AI, OpenAI (ChatGPT), Kimi/Moonshot
- **State**: Stored in `localStorage` as `auth-provider` (string ID)
- **Actual OAuth Flow**: Not implemented — clicking "Connect" only toggles local state

### API Key Authentication (UI Only)
- **Location**: `src/Settings.tsx:88-134`
- **Providers**: OpenAI, Google Gemini, Kimi/Moonshot, Anthropic Claude
- **Storage**: `localStorage` keys:
  - `api-key` — raw API key string
  - `api-provider` — selected provider ID
- **Security**: Key is stored in plaintext in localStorage (no encryption)
- **Actual API Calls**: None — chat uses hardcoded mock responses

### OCR Model Selection
- **Location**: `src/Settings.tsx:136-154`
- **Models**: GPT-4o mini, GPT-4o, Gemini 2.0 Flash, Claude 3.5 Sonnet
- **Storage**: `localStorage` key `ocr-model`
- **Actual OCR**: `capture_region` in Rust writes mock text: `"Sample OCR Text (OpenAI integration pending API key setup)"`

## OCR Implementation

### Current Implementation (Mock)
- **Trigger**: `Alt+O` global shortcut
- **Frontend**: `Selector.tsx` — fullscreen drag-to-select region
- **Backend**: `capture_region` command (`lib.rs:151`)
- **Screen Capture**: Uses `xcap` crate to capture monitor, `image` crate to crop
- **OCR Processing**: **NOT IMPLEMENTED** — only writes mock text to clipboard
- **Save Location**: `~/Desktop/gquick_capture.png`

### Planned AI OCR
The architecture is set up to send the captured image to an AI vision model:
1. Capture image via `xcap`
2. Send image + prompt to selected AI provider API
3. Extract text from response
4. Write extracted text to clipboard

## Key Files and Responsibilities

| File | Responsibility |
|------|----------------|
| `src-tauri/src/lib.rs` | **Core backend**: all Tauri commands, shortcuts, tray, window mgmt |
| `src-tauri/src/main.rs` | Entry point — delegates to lib |
| `src-tauri/tauri.conf.json` | Tauri app config: window settings, security CSP, bundle config |
| `src-tauri/Cargo.toml` | Rust dependencies: tauri, xcap, image, plugins |
| `src/App.tsx` | **Core frontend**: search, chat, actions, keyboard handling |
| `src/Selector.tsx` | Region selection overlay for screenshot/OCR |
| `src/Settings.tsx` | AI provider config UI (OAuth, API keys, model selection) |
| `src/main.tsx` | Window routing (App vs Selector) |
| `src/plugins/index.ts` | Plugin registry |
| `src/plugins/types.ts` | Plugin interface definitions |
| `src/plugins/appLauncher.tsx` | macOS app discovery and launching |
| `src/plugins/calculator.tsx` | Math expression evaluation |
| `src/plugins/docker.tsx` | Docker container/image management |
| `src/plugins/webSearch.tsx` | Google search via default browser |
| `package.json` | Frontend dependencies and scripts |
| `vite.config.ts` | Vite build config with Tauri dev server settings |

## Conventions

- **File naming**: PascalCase for components (`App.tsx`, `Settings.tsx`), camelCase for utilities
- **Styling**: Tailwind CSS with custom zinc/dark theme, heavy use of `bg-white/5`, `border-white/10`, `backdrop-blur`
- **Window styling**: Transparent background, no decorations, shadow disabled
- **State management**: React `useState`/`useEffect` only — no external state library
- **Storage**: `localStorage` for settings persistence
- **Icons**: Lucide React exclusively
- **TypeScript**: Strict mode enabled, no unused locals/parameters

## Current Sprint/Focus

Based on code analysis, the project appears to be in **early development / MVP stage**:

1. **Working features**: App launcher, calculator, Docker management, web search, screenshot capture, global shortcuts, system tray
2. **Partially implemented**: OCR (UI + capture works, AI text extraction mocked), Settings UI (visual only)
3. **Not yet implemented**:
   - Real AI chat API integration
   - Real OAuth flows for AI providers
   - Actual API key usage in HTTP requests
   - AI-powered OCR text extraction
   - Model fetching/dynamic model lists
   - Windows/Linux app launcher support
   - SQLite database usage (initialized but unused)

## Key Decisions

1. **Tauri over Electron**: Chosen for smaller bundle size and native Rust performance
2. **Plugin architecture**: Decoupled search providers for extensibility
3. **Single HTML entry with window routing**: `main.tsx` uses Tauri window label to render App vs Selector
4. **Rust handles screen capture**: Frontend only sends coordinates; all capture logic in Rust to avoid CORS/security issues
5. **localStorage for settings**: Simple but insecure for API keys — should migrate to Tauri secure storage or keychain
6. **Mock AI responses**: Placeholder implementation while API integration is planned

## Security Notes

- API keys stored in plaintext `localStorage` (vulnerability)
- CSP allows `https:` and `http://localhost:*` connections
- No OAuth redirect handling implemented
- `macos-private-api` enabled in Tauri config

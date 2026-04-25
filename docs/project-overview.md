# GQuick Project Overview

## What is GQuick?

GQuick is a cross-platform desktop productivity launcher built with **Tauri v2** and **React 19**. It provides a Spotlight-like interface that appears via global keyboard shortcut, letting you open apps, search files, chat with AI, translate text, capture screenshots, extract text via OCR, and more — all without leaving the keyboard.

**Primary target:** macOS (with Windows and Linux support)

---

## Current Feature Set (What Actually Works)

### Core Launchers
- **App Launcher** — Scans and launches applications
  - macOS: `/Applications`, `/System/Applications` (`.app` bundles)
  - Windows: Start Menu `.lnk` files
  - Linux: `.desktop` files from `/usr/share/applications` and user data dir
- **File Search** — Fast filename-based search across your home directory with keyword scoring
- **Smart File Search** — AI-powered natural language file search that reads file contents and ranks results using your configured AI provider. Supports time filters (`today`, `last week`, `recent`, etc.)

### AI Chat (Fully Implemented)
- **Real SSE streaming** to OpenAI, Google Gemini, Kimi/Moonshot, and Anthropic Claude
- **Multi-turn conversation** with full history context
- **Image inputs** — attach up to 5 images via paste, drag-and-drop, or native file dialog
- **Markdown rendering** with code blocks, tables, lists, GFM support
- **Model auto-discovery** — fetches available models from provider APIs with 24-hour cache

### Translation (Fully Implemented)
- **Quick Translate** — type `t: text`, `tr: text`, or `> text` for instant translation (auto-detects German/English direction, 400ms debounce)
- **Full Translation UI** — `translate:` or `/translate` command opens a dedicated UI with source/target language selection, swap button, and copy-to-clipboard

### Screen Capture & OCR
- **Screenshot Capture** — `Alt+S` opens a fullscreen transparent selector; drag to capture a region, saved to `~/Desktop/gquick_capture.png`, copied to clipboard as image
- **OCR Text Extraction** — `Alt+O` opens the same selector; extracts text via **Tesseract OCR** on macOS (Rust `tesseract` crate 0.15) or **AI vision models** on Windows/Linux (OpenAI, Gemini, Kimi, Anthropic), copies extracted text to clipboard

### Utilities
- **Calculator** — type math expressions directly in the search bar (e.g. `2+2*5`); result copied to clipboard on Enter
- **Docker Manager** — list, start, stop, restart containers; list and delete images (requires Docker CLI installed)
- **Web Search** — `google ...` or `search ...` opens Google search in default browser

### System Integration
- **Global Shortcuts** — configurable via Settings with live ShortcutRecorder component
  - Default toggle: `Alt+Space` (macOS/Linux), `Alt+Shift+Space` (Windows)
  - Default screenshot: `Alt+S`
  - Default OCR: `Alt+O`
- **System Tray** — runs in background with tray icon; click tray icon to toggle window
- **Auto-hide** — window hides when focus is lost (except during native file dialogs)
- **macOS dock icon hidden** — `ActivationPolicy::Accessory`

---

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.0 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 7.0.4 | Build tool / dev server |
| Tailwind CSS | 4.2.4 | Styling |
| Lucide React | 1.8.0 | Icons |
| react-markdown | 10.1.0 | Chat message rendering |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown |

### Backend (Rust)
| Technology | Version | Purpose |
|------------|---------|---------|
| Tauri | 2.0 | Desktop framework |
| xcap | 0.9 | Screen capture |
| image | 0.25 | Image processing / cropping |
| tesseract | 0.15 | OCR text extraction (macOS only) |
| AI Vision APIs | — | OCR via OpenAI/Gemini/Kimi/Anthropic (Windows/Linux) |
| walkdir | 2 | File system traversal |
| chrono | 0.4 | Date/time formatting |
| dirs | 5 | Standard directory paths |

### Tauri Plugins
- `tauri-plugin-opener` — open files/URLs in default apps
- `tauri-plugin-clipboard-manager` — write images and text to clipboard
- `tauri-plugin-global-shortcut` — system-wide keyboard shortcuts
- `tauri-plugin-shell` — execute system commands
- `tauri-plugin-fs` — file system access
- `tauri-plugin-dialog` — native file picker for image attachments
- `tauri-plugin-sql` — SQLite (initialized but currently unused)

---

## Architecture

GQuick uses a **two-window architecture** sharing a single HTML entry point (`main.tsx` routes by Tauri window label):

1. **`"main"` window** — The launcher interface (680px wide, rounded, transparent, borderless)
   - Search view with plugin results
   - Chat view with AI streaming
   - Settings view with API/shortcut configuration
   - Actions overlay (plugin directory)

2. **`"selector"` window** — Fullscreen transparent overlay for drag-to-select region capture

### Plugin System
6 plugins live in `src/plugins/`. Each implements:

```typescript
interface GQuickPlugin {
  metadata: PluginMetadata;
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
```

Plugins are queried in parallel on every keystroke (150ms debounce), results are flattened and sorted by `score`.

### Key Rust Commands
| Command | Description |
|---------|-------------|
| `list_apps` / `open_app` | Cross-platform app discovery and launching |
| `search_files` | Fast filename search with keyword scoring |
| `smart_search_files` | Content-aware file search with metadata and previews |
| `capture_region` | Screen capture + OCR or clipboard copy |
| `update_main_shortcut` / `update_screenshot_shortcut` / `update_ocr_shortcut` | Live shortcut reconfiguration |
| `open_image_dialog` | Native image picker for chat attachments |
| `close_selector` | Force-close selector window |

---

## How to Build and Run

### Prerequisites
- Node.js 20+
- Rust toolchain
- Tesseract OCR installed (macOS only; Windows/Linux use AI vision models)

### macOS
```bash
# Install Tesseract
brew install tesseract

# Install dependencies and run
npm install
npm run tauri dev
```

### Windows
```bash
npm install
npm run tauri dev
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev \
  librsvg2-dev patchelf libpipewire-0.3-dev \
  libclang-dev clang

npm install
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```
Built bundles appear in `src-tauri/target/release/bundle/`.

---

## Known Limitations

1. **API keys stored in plaintext `localStorage`** — not secure; should migrate to Tauri secure storage or OS keychain
2. **No persistent chat history** — conversations are lost when the app is closed
3. **File index scope** — scans home directory only, max depth 6, skips hidden dirs and common build/cache folders
4. **SQLite initialized but unused** — `tauri-plugin-sql` is included but no database tables are created or used
5. **OCR language** — Tesseract on macOS uses English only (`eng`); AI vision OCR on Windows/Linux uses the model's multilingual capability with no explicit language control
6. **macOS-only tessdata bundling** — on macOS, looks for `tessdata/` in app resource dir; Windows/Linux use AI APIs and do not need local tessdata
7. **No search result caching** — every keystroke re-queries all plugins (though file index is cached 5 minutes)
8. **Smart search token limits** — file content sent to AI is truncated to 5000 chars to stay within API limits

---

## File Structure

```
src/
  App.tsx              # Main launcher UI (search, chat, actions)
  Settings.tsx         # API provider, model, shortcut config
  Selector.tsx         # Fullscreen region selection overlay
  main.tsx             # Window label router
  components/
    MarkdownMessage.tsx    # Chat message rendering
    ShortcutRecorder.tsx   # Interactive shortcut capture
    Tooltip.tsx            # Hover tooltip
  utils/
    streaming.ts           # SSE streaming for OpenAI/Gemini/Anthropic
    quickTranslate.ts      # Quick translate detection + API calls
    cn.ts                  # Tailwind class merge utility
  plugins/
    index.ts               # Plugin registry (6 plugins)
    types.ts               # Plugin interfaces
    appLauncher.tsx        # Cross-platform app launcher
    fileSearch.tsx         # Fast + smart file search
    calculator.tsx         # Math expression evaluator
    docker.tsx             # Docker container/image manager
    webSearch.tsx          # Google search
    translate.tsx          # AI translation plugin

src-tauri/
  src/lib.rs           # All Rust commands, shortcuts, tray, window mgmt
  Cargo.toml           # Rust dependencies
  tauri.conf.json      # App config, CSP, window settings
```

---

## What Works vs What Doesn’t

| Feature | Status | Notes |
|---------|--------|-------|
| App Launcher | ✅ Works | Cross-platform |
| File Search (Fast) | ✅ Works | Keyword scoring, 50 results |
| File Search (Smart) | ✅ Works | AI content ranking, time filters |
| Calculator | ✅ Works | Eval via `new Function()` |
| Docker Manager | ✅ Works | Requires Docker CLI |
| Web Search | ✅ Works | Opens browser |
| Quick Translate | ✅ Works | `t:`, `tr:`, `>` prefixes |
| Full Translate UI | ✅ Works | Language selection, swap, copy |
| Screenshot Capture | ✅ Works | Saves + copies to clipboard |
| OCR | ✅ Works | Real Tesseract, copies text |
| AI Chat | ✅ Works | Streaming, images, multi-turn |
| Model Fetching | ✅ Works | Live API, 24h cache |
| Global Shortcuts | ✅ Works | All 3 configurable |
| System Tray | ✅ Works | Toggle + quit menu |
| Image Attachments | ✅ Works | Paste, dialog, up to 5 |
| Persistent History | ❌ Not implemented | Lost on close |
| Secure API Storage | ❌ Not implemented | Plaintext localStorage |
| SQLite Usage | ❌ Not implemented | Plugin included but unused |

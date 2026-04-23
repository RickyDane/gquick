# Release Notes: GQuick v0.1.0 — AI-Powered Productivity Launcher

## Summary

GQuick is a fully functional cross-platform desktop productivity launcher built with Tauri v2 and React 19. This release includes six search plugins, real AI chat with streaming and image support, local Tesseract OCR, screenshot capture, configurable global shortcuts, and a comprehensive settings panel — all accessible from a single keyboard-driven interface.

---

## What's New

### AI Chat with Real Streaming
- **Multi-provider support**: OpenAI (GPT), Google Gemini, Kimi/Moonshot, Anthropic Claude
- **Real-time SSE streaming**: Assistant responses appear word-by-word as they are generated
- **Image inputs**: Attach up to 5 images via paste, native file dialog, or drag-and-drop. Supported in chat for vision-capable models
- **Multi-turn conversations**: Full chat history context sent with each message
- **Markdown rendering**: Code blocks, tables, lists, bold/italic, blockquotes, and inline code styled for dark mode

### Local OCR Engine
- **Real Tesseract OCR**: Uses the Rust `tesseract` crate (v0.15) with English language model
- **Global shortcut**: `Alt+O` to trigger region selection and text extraction
- **Clipboard integration**: Extracted text automatically copied to clipboard
- **Preview notification**: Emits `ocr-complete` event with first 100 characters
- **Graceful degradation**: Clear error message if Tesseract is not installed

### Screenshot Capture
- **Region selection**: `Alt+S` opens a fullscreen transparent overlay; drag to select any screen region
- **Retina-aware**: Correctly maps logical to physical coordinates using monitor scale factors
- **Clipboard copy**: Captured image copied directly to clipboard
- **Save location**: Saved as `gquick_capture.png` on the Desktop

### File Search (Fast + Smart)
- **Fast search**: Keyword-based filename and path scoring across home directory; returns top 50 results in milliseconds
- **Smart search**: Natural language queries like "find files about budgeting from last week"
  - Reads file metadata (created, modified, size)
  - Reads text file contents (up to 100KB) for preview
  - Time-based filtering: `today`, `yesterday`, `last week`, `last month`, `recent`
  - **AI ranking**: Sends file descriptions to your configured AI provider to rank results by actual relevance
- **File index caching**: 5-minute TTL to balance freshness and performance

### Translation
- **Quick Translate**: Type `t: text`, `tr: text`, or `> text` for instant AI translation with auto language detection (German/English)
- **Full Translation UI**: Type `translate:` or `/translate` to open a dedicated panel with 12 languages, swap button, and copy-to-clipboard

### Docker Management
- List containers with start/stop/restart actions
- List images with delete action
- Inline preview buttons for quick container control

### Calculator
- Evaluate mathematical expressions directly in the search bar
- Result copied to clipboard on Enter

### Web Search
- Quick Google search opened in your default browser

### App Launcher
- Cross-platform application discovery and launching
- macOS: `.app` bundles from `/Applications` and `/System/Applications`
- Windows: `.lnk` shortcuts from Start Menu
- Linux: `.desktop` files with Name/Exec parsing, NoDisplay/Hidden filtering

### Settings & Configuration
- **API provider selection**: OpenAI, Google Gemini, Kimi/Moonshot, Anthropic Claude
- **API key input**: Password field with show/hide toggle
- **Live model fetching**: Automatically fetches available models when API key is entered, with 24-hour localStorage caching
- **Configurable global shortcuts**: Open window, screenshot, and OCR shortcuts all customizable via interactive ShortcutRecorder component
- **Platform-aware defaults**: `Alt+Space` on macOS/Linux, `Alt+Shift+Space` on Windows

### UI/UX Improvements
- **Actions overlay**: `Cmd/Ctrl+K` opens a searchable directory of all plugins and app actions
- **Tooltip component**: Hover tooltips for chat clear button and model indicator
- **ShortcutRecorder component**: Click-to-record global shortcut capture with modifier key validation
- **Smart search badge**: Purple "Smart" badge appears on AI-ranked file search results
- **Loading states**: Spinners for translation, smart search analysis, and model fetching
- **Auto-hide on blur**: Main window hides when focus is lost; dialog-aware (won't hide during native file picker)

---

## Bug Fixes
- Fixed "black screen" captures by correctly mapping logical to physical coordinates using the window's scale factor
- Fixed race conditions when rapidly switching API keys or providers in Settings (AbortController + debounce)
- Fixed selector window not closing reliably by adding a dedicated Rust `close_selector` command
- Fixed file dialog causing main window to hide by tracking dialog open state in Rust
- Fixed multi-monitor capture errors by matching Tauri monitor name with xcap monitor

---

## Migration Notes
No migration required for new users. Install Tesseract OCR for your platform to enable OCR functionality.

---

## Breaking Changes
- **OAuth authentication removed**: Previous OAuth flow was replaced with API Key-only authentication. Users must enter their API key directly in Settings.

---

## Dependencies Added
- `tesseract` Rust crate (0.15) for OCR
- `react-markdown` (10.1.0) and `remark-gfm` (4.0.1) for chat message rendering
- `lucide-react` (1.8.0) for iconography
- `tauri-plugin-dialog` (2.7.0) for native image file picker
- `xcap` (0.9) and `image` (0.25) for screen capture and processing

---

## Known Issues
- API keys are stored in plaintext `localStorage` (not encrypted)
- Chat history is not persisted across app restarts
- File search limited to home directory, max depth 6
- Tesseract OCR uses English language model only; no UI to select other languages
- SQLite plugin is included but unused

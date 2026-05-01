# GQuick Functionalities and Plugins

## Summary
GQuick is a cross-platform desktop launcher built with Tauri v2, React 19, and TypeScript. It opens from global shortcuts and combines app launching, file search, AI chat, screenshots, OCR, notes, Docker tools, web search, translation, weather, network info, and speed testing in one keyboard-first interface.

This directory is the user and developer documentation hub for current overall functionality and built-in plugins.

## Documents
- [Plugin catalog](plugin-catalog.md): triggers, user actions, and AI tool support.
- [How to build a simple plugin](simple-plugin-guide.md): quick start and detailed plan for new contributors.
- [Setup and configuration](setup-configuration.md): AI providers, OCR, Docker, shortcuts, and local setup.
- [Developer notes](developer-notes.md): how to add or update plugins and plugin tools.
- [Limitations and security notes](limitations-security.md): known caveats documented in code and project context.
- [Release notes](release-notes.md): concise summary of this documentation update.
- [Commit message](commit-message.md): proposed conventional commit message.

## Feature Overview

### Launcher and search
- **App launching**: finds and opens installed applications across macOS, Windows, and Linux.
- **File search**: searches local files and folders by name and opens selected results.
- **Smart file search**: uses natural-language file queries and, when AI is configured, ranks candidate files by relevance.
- **Actions overlay**: opens app views and commands with `Cmd/Ctrl+K`.

### AI and language features
- **AI chat**: streams responses from configured AI providers and supports image attachments.
- **Plugin tools for chat**: exposes selected plugin capabilities as callable AI tools.
- **Quick translate**: translates text from launcher prefixes such as `t:` and `tr:`.
- **Full translate UI**: opens source/target language controls from `translate:` or `/translate`.

### Capture and OCR
- **Screenshot capture**: select a screen region and copy/save the image.
- **OCR**: select a screen region and copy extracted text. macOS uses local Tesseract; Windows/Linux use configured AI vision providers.

### Productivity plugins
- **Notes**: quick note capture, search, and a full notes view backed by local SQLite.
- **Docker**: local container/image management, Docker Hub search, run/pull flows, logs/inspect/exec/compose/prune access from the Docker view.
- **Calculator**: safe arithmetic parser for simple expressions.
- **Web search**: opens Google results in the default browser.
- **Weather**: saves a weather location and shows current weather plus forecast using Open-Meteo.
- **Network info**: copies local/public IP, Wi-Fi, and latency summary.
- **Speedtest**: checks latency, download, and upload with Cloudflare speed endpoints.

## Common Shortcuts
| Shortcut | Action | Configurable |
|---|---|---|
| `Alt+Space` | Toggle main GQuick launcher | Yes |
| `Alt+S` | Region screenshot | Yes |
| `Alt+O` | Region OCR | Yes |
| `Cmd/Ctrl+K` | Actions overlay | No |
| `Cmd/Ctrl+Left Shift+C` | Chat view | No |
| `Cmd/Ctrl+Left Shift+D` | Docker view | No |
| `Cmd/Ctrl+,` | Settings | No |
| `Cmd/Ctrl+N` | Notes view | No |
| `CmdOrCtrl+Shift+N` | Prefill quick note | Yes, local shortcut |
| `CmdOrCtrl+Shift+S` | Prefill note search | Yes, local shortcut |
| `Cmd/Ctrl+R` | Clear chat while in chat view | No |
| `Escape` | Back/close current view | No |

## Validation Notes
- Current plugin registry includes 10 plugins: app launcher, file search, calculator, Docker, web search, translate, notes, network info, speedtest, and weather.
- `docs/project-overview.md` and the root `README.md` now track the current plugin registry more closely, but this directory remains the detailed reference for plugin coverage and runtime file-search behavior.
- Kimi/Moonshot code paths exist in streaming/tool conversion and some utilities, but Settings currently hides Kimi from the selectable provider list.

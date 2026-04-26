# Setup and Configuration

## AI Providers

Open Settings with `Cmd/Ctrl+,`, then configure:
1. Provider
2. API key
3. Model
4. Save

Currently selectable providers in Settings:
- OpenAI
- Google Gemini
- Anthropic Claude

Additional code paths exist for Kimi/Moonshot, but the Settings provider option is currently commented out. Do not document Kimi as a selectable user option until it is re-enabled.

AI-powered features that need provider setup:
- AI chat
- image-enabled chat
- smart file ranking
- quick/full translation
- Windows/Linux AI-based OCR
- plugin tools in chat

## API Key Storage
API keys are stored in browser `localStorage` under keys such as `api-key`, `api-provider`, and `selected-model`. This is plain-text local storage, not OS keychain storage.

## OCR and Screenshots

| Platform | Screenshot | OCR |
|---|---|---|
| macOS | Native capture through Rust/xcap | Local Tesseract (`eng`) |
| Windows/Linux | Native capture through Rust/xcap | AI vision via configured provider |

Defaults:
- Screenshot shortcut: `Alt+S`
- OCR shortcut: `Alt+O`
- Captures save to `~/Desktop/gquick_capture.png`
- Screenshot mode copies image to clipboard
- OCR mode copies extracted text to clipboard

macOS development requirement:
```bash
brew install tesseract
```

## Docker

Docker features require:
- Docker CLI installed
- Docker daemon running
- Docker Compose available for compose features

Use `docker:` in the launcher to open Docker search/results. Use `Cmd/Ctrl+Left Shift+D` to open the Docker page directly.

Docker Hub search uses the public Docker Hub API from the frontend. Local container/image/compose commands are handled by Rust and the Docker CLI.

## Shortcuts

Configurable in Settings:
- Open Window: default `Alt+Space`
- Screenshot: default `Alt+S`
- OCR: default `Alt+O`
- Quick Note local shortcut: default `CmdOrCtrl+Shift+N`
- Search Notes local shortcut: default `CmdOrCtrl+Shift+S`

Fixed in-app shortcuts:
- `Cmd/Ctrl+K`: actions overlay
- `Cmd/Ctrl+Left Shift+C`: chat view
- `Cmd/Ctrl+Left Shift+D`: Docker view
- `Cmd/Ctrl+N`: notes view
- `Cmd/Ctrl+R`: clear chat while in chat view
- `Escape`: close/back

## Notes
Notes are persisted locally through SQLite. Quick capture uses `note:`. Searching uses `notes:` or `search notes:`.

## Weather
Weather does not need an API key. It uses Open-Meteo geocoding and forecast APIs. Saved location is stored in `localStorage` as `weather-location`.

## Speedtest
Speedtest uses Cloudflare speed endpoints. It can consume network data based on the configured duration and sample sizes.

Default speedtest configuration:
- Duration: 15 seconds
- Download sample: 50 MB
- Upload sample: 25 MB

## Development Setup
Minimum expected local setup:
- Node.js 20+
- Rust toolchain
- Platform Tauri dependencies
- Tesseract on macOS if testing local OCR

Common commands:
```bash
npm install
npm run tauri dev
npm run tauri build
```

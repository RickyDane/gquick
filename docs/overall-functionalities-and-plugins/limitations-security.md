# Known Limitations and Security Notes

## Security Notes
- **API keys are stored in plain-text `localStorage`**. Project context recommends migrating to secure storage or OS keychain.
- **AI features call external providers** when configured. Chat, translation, smart ranking, AI OCR, and tool-enabled chat may send prompts or selected content to provider APIs.
- **Smart file ranking can include file metadata and safe content previews/full content** for candidate files. File reads are restricted, but users should avoid searching sensitive content with AI features if this is not acceptable.
- **Public IP lookup uses `api.ipify.org`** and is cached briefly.
- **Weather and speedtest call external APIs**: Open-Meteo and Cloudflare speed endpoints.
- **Docker commands can affect local containers/images**. Destructive UI actions should require confirmation.
- **Tauri CSP allows `https:` and `http://localhost:*` connections** per project context.
- **`macos-private-api` is enabled** in Tauri config per project context.

## File Search and AI Read Limits
- File search focuses on user-accessible search roots and skips hidden/system/build/cache patterns.
- Search/index behavior avoids symlinks and caps traversal/results in backend code.
- AI `read_file` only reads safe text files already known to the current index/search flow.
- Likely secrets, credentials, and key files are rejected.
- Read sizes are capped; large content is truncated.

## Platform Limitations
- macOS OCR uses local Tesseract with English language data.
- Windows/Linux OCR relies on configured AI vision providers rather than local Tesseract.
- Linux focus restoration is best effort and depends on X11/`xdotool` support per project context.
- Screen capture and global shortcuts may require OS permissions.

## Product Limitations
- Chat history is not documented as persistently stored; current context notes no persistent chat history.
- Some older docs are stale: plugin counts and feature status in `README.md` and `docs/project-overview.md` do not fully match current plugin registry.
- Kimi/Moonshot has code paths but is not currently selectable in Settings.
- Docker requires Docker CLI/daemon; Docker Hub search requires network access.
- Speedtest results depend on Cloudflare endpoint availability, CORS behavior, and current network conditions.

## Gaps Needing Reverse-Engineer Follow-up
- Confirm exact packaged OCR behavior and tessdata bundling for non-development macOS builds.
- Confirm current Tauri allowlist/CSP implications for all external endpoints.
- Refresh architecture docs to include weather, speedtest, Docker view expansion, and current plugin tool set.
- Reconcile provider documentation around Kimi/Moonshot with current Settings UI.

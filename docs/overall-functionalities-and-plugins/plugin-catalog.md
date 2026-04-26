# Plugin Catalog

## Built-in Plugins

| Plugin | ID | Main triggers | Primary actions | AI tools |
|---|---|---|---|---|
| Applications | `app-launcher` | Type app name; keywords `open`, `launch`, `app` | Open installed app | None currently |
| Files & Folders | `file-search` | Any query with 2+ chars; smart keywords like `find`, `about`, `last week`, `contains` | Open files/folders; smart AI ranking when configured | `search_files`, `read_file` |
| Calculator | `calculator` | Math expression using numbers, `+ - * /`, decimals, parentheses | Copy result and hide launcher | `calculate` |
| Docker | `docker` | `docker:` | Open Docker page; start/stop/restart/remove containers; run/delete images; search/pull Docker Hub results | No tools in current plugin file |
| Web Search | `web-search` | `search:` or queries containing `google`, `search`, `web` | Open Google search in default browser | No tool in current plugin file |
| Translate | `translate` | `translate:`, `/translate`, `translate`, `translation`; quick translate `t:`/`tr:` handled by App | Open translate UI or quick-translate result | None currently |
| Notes | `notes` | `note:`, `notes:`, `search notes:`, `note`, `notes`, `memo` | Save quick note, search notes, open notes view | `search_notes`, `create_note` |
| Network Info | `network-info` | `net`, `network`, `net:`, `network:`, `wifi`, `wi-fi`, `vpn` | Copy network summary or details | `get_network_info` |
| Speedtest | `speedtest` | `speedtest`, `speed test`, `internet speed`, `/st` | Start/view/stop speed test; configure duration and sample sizes | None currently |
| Weather | `weather` | `/wt`, `weather:`, `weather`, `forecast` | Search/save location; show current weather and 7-day forecast | `get_current_weather`, `get_weather_forecast` |

## Plugin Details

### Applications
- Scans platform app locations through the Rust `list_apps` command.
- Opens selections with `open_app`.
- Caches app list in the frontend for the current session.

### Files & Folders
- Fast search calls `launcher_search_files` and opens results with `open_file`.
- Smart search calls `smart_search_files`, then optionally uses the configured AI model to rank candidates.
- AI `read_file` is restricted to safe text files returned by the search index.

### Calculator
- Supports simple arithmetic only: `+`, `-`, `*`, `/`, decimals, parentheses, and unary `+`/`-`.
- Uses a bounded parser, not arbitrary JavaScript evaluation.

### Docker
- Opt-in by prefix to avoid slow Docker CLI calls during normal search.
- Docker page supports containers, images, Docker Hub search, compose/activity flows, and command output display.
- Risky search-result actions such as remove/delete ask for confirmation.
- Requires Docker CLI and daemon for local operations.

### Web Search
- `search: cats` searches Google for `cats`.
- General queries containing web-search words may also show the Google result.

### Translate
- Quick translate is handled outside the plugin in `App.tsx`/`quickTranslate.ts` for loading-state control.
- Full translate UI supports auto-detect source plus explicit target language selection.
- Requires an AI provider, API key, and selected model.

### Notes
- `note: Buy milk` saves a quick note.
- `notes: project` or `search notes: project` searches saved notes.
- `note`, `notes`, or `memo` opens the full notes view.
- Notes are stored locally through Rust commands and SQLite.

### Network Info
- Shows local IP, public IP, Wi-Fi SSID, VPN status, and latency.
- Public IP uses `api.ipify.org` and is cached briefly.

### Speedtest
- Uses Cloudflare frontend HTTP endpoints.
- Default settings: 15 seconds, 50 MB download sample, 25 MB upload sample.
- User-configured limits: 5–300 seconds, 1–1000 MB download, 1–200 MB upload.

### Weather
- Uses Open-Meteo geocoding and forecast APIs; no weather API key required.
- Saves selected location in `localStorage`.
- Displays current temperature, condition, humidity, wind, apparent temperature, and 7-day forecast.

## AI Tool Support Summary
Plugins may expose structured tools to AI chat through `src/utils/toolManager.ts`.

| Tool | Plugin | Purpose |
|---|---|---|
| `calculate` | Calculator | Evaluate simple math expression |
| `search_files` | Files & Folders | Search local indexed files/folders |
| `read_file` | Files & Folders | Read a safe local text file from search results |
| `search_notes` | Notes | Search saved notes |
| `create_note` | Notes | Save a new note |
| `get_network_info` | Network Info | Return network status as JSON |
| `get_current_weather` | Weather | Fetch current weather for a location |
| `get_weather_forecast` | Weather | Fetch 7-day forecast for a location |

Note: project context mentions earlier planned tools for Docker, web search, and app launching. Current plugin files do not expose those tools, so this catalog treats them as not currently available.

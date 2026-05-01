# GQuick Architecture

GQuick is a Tauri v2 desktop launcher with a React 19 frontend. The app combines a Spotlight-like search UI, plugin search/actions, AI chat with provider-specific streaming and tool calling, screenshot/OCR capture, notes, Docker management, weather, speed test, network diagnostics, translation, file/app search, calculator, web search, and inline terminal execution.

## System map

```mermaid
graph TB
  User[User] --> Shortcuts[Global shortcuts / tray / launcher window]
  Shortcuts --> Rust[Tauri Rust backend]
  Rust --> Main[main webview: App.tsx]
  Rust --> Selector[selector webview: Selector.tsx]

  subgraph Frontend[React + TypeScript]
    Main --> Registry[src/plugins registry]
    Registry --> Plugins[Search plugins]
    Main --> Chat[AI chat + images]
    Chat --> ToolMgr[src/utils/toolManager.ts]
    Main --> Settings[Settings.tsx]
    Main --> NotesView[NotesView]
    Main --> DockerView[DockerView]
  end

  subgraph Backend[Rust commands]
    Rust --> Apps[list_apps/open_app]
    Rust --> Files[launcher_search_files/search_files/smart_search_files/read_file/open_file]
    Rust --> Capture[capture_region]
    Rust --> Docker[Docker CLI + Hub API proxy]
    Rust --> Notes[(SQLite notes)]
    Rust --> Net[get_network_info]
    Rust --> Terminal[terminal command runner]
    Rust --> ShortMgr[shortcut/window/focus management]
  end

  Chat --> Providers[OpenAI/Gemini/Anthropic]
  Plugins --> WebAPIs[Open-Meteo, Cloudflare speed test, Google search URL]
  Docker --> DockerCLI[Docker CLI/daemon]
  Capture --> OS[Screen, clipboard, OCR]
```

## Runtime data flow

```mermaid
flowchart LR
  Query[Launcher query] --> Router[getPluginsForQuery]
  Router --> Prefix{Explicit prefix?}
  Prefix -->|yes| Matched[Only matching prefixed plugins]
  Prefix -->|no| All[All plugins]
  Matched --> Split{Debounce config?}
  All --> Split
  Split -->|none| Immediate[Immediate getItems]
  Split -->|>0ms| Debounced[Debounced getItems]
  Immediate --> Dedup[Deduplicate by id]
  Debounced --> Dedup
  Dedup --> Results[Flatten + score sort]
  Results --> Select[Enter/click]
  Select --> Action[Plugin onSelect/actions]
  Action --> Invoke[Tauri invoke or frontend API]
```

## Key corrections from validation

- Plugin tool manager lives at `src/utils/toolManager.ts`, not `src/plugins/toolManager.ts`.
- Settings currently exposes OpenAI, Google Gemini, and Anthropic; Kimi/Moonshot code paths remain hidden.
- Current plugin registry includes `speedtestPlugin`; older docs omitted it.
- Docker plugin no longer exposes AI tools in current code. Docker search/actions are UI/plugin-driven and backed by Rust commands plus frontend Docker Hub search.
- Web Search plugin does not expose an AI tool. OpenAI hosted web search support is handled in `App.tsx`/streaming for supported OpenAI Responses models.
- File search is runtime `jwalk` scanning with safety policy, not a persistent file index.
- `recentFilesPlugin` is an immediate plugin that surfaces recently opened files/folders from `localStorage` usage history above filesystem scan results.
- Backend command surface now includes Docker Compose/logs/exec/inspect/prune, Docker Hub search, inline terminal commands, `quit_app`, and `hide_main_window`.

## Documentation index

- `arch/context.md` — Navigator-facing architecture context.
- `arch/plugin-system.md` — plugin interface, registry, routing, lifecycle.
- `arch/plugins.md` — current plugin catalog and capabilities.
- `arch/recent-files-plugin.md` — immediate plugin that surfaces recently opened files/folders from usage history.
- `arch/plugin-tools.md` — AI tool-calling architecture and current tool inventory.
- `arch/backend-tauri.md` — Rust command surface and cross-platform integrations.
- `arch/data/flows.md` — major app data flows.
- `arch/data/models.md` — key data models and schemas.
- `arch/api/contracts.md` — Tauri/frontend/API contracts.
- `arch/api/sequences.md` — sequence diagrams.
- `arch/components/relationships.md` — component relationships.

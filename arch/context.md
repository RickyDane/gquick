# GQuick Project Context

## Overview

GQuick is a Tauri v2 + React 19 desktop productivity launcher. It provides keyboard-driven plugin search/actions, AI chat with images and plugin tools, screenshot/OCR capture, notes, Docker management, weather, speed testing, network info, file/app search, calculator, web search, translation, and terminal helpers.

## Architecture summary

- Frontend: React/TypeScript single app routed by Tauri window label (`main` vs `selector`). `App.tsx` is the main state machine for search/chat/settings/actions/notes/docker.
- Plugin layer: `src/plugins/index.ts` registry routes queries to `GQuickPlugin` implementations. Plugins return `SearchResultItem[]` with optional previews/actions and may expose AI tools.
- AI layer: frontend calls OpenAI/Kimi/Gemini/Anthropic directly, streams responses, converts plugin tool schemas per provider, executes tool calls, then sends follow-up requests.
- Backend: `src-tauri/src/lib.rs` owns OS integration, global shortcuts, tray/window lifecycle, file/app search/open, screenshot/OCR, Docker CLI/Compose, SQLite notes, network info, dialogs, and terminal execution.
- Persistence: SQLite notes in app data dir; frontend `localStorage` for settings, model/provider/API keys, weather/speedtest preferences.

## Current plugin registry

Applications, Files & Folders, Calculator, Docker, Web Search, Translate, Notes, Network info, Speedtest, Weather.

## Current AI plugin tools

Calculator: `calculate`; Files: `search_files`, `read_file`; Notes: `search_notes`, `create_note`; Network: `get_network_info`; Weather: `get_current_weather`, `get_weather_forecast`.

## Validated corrections

- `src/utils/toolManager.ts` is the actual tool manager path.
- Docker and Web Search are not current plugin AI tools.
- Speedtest is a current plugin.
- File search uses runtime scanning and safe read policy, not a persistent index.
- Backend command surface is broader than older docs: includes Docker Compose, logs/exec/inspect/prune, Docker Hub search, inline terminal, quit/hide window.

## Primary docs

Start with `arch/README.md`, then use `arch/plugin-system.md`, `arch/plugins.md`, `arch/plugin-tools.md`, and `arch/backend-tauri.md` for implementation planning.

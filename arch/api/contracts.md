# API and Command Contracts

## Tauri command contract summary

Frontend calls Rust through `invoke(command, args)` from `@tauri-apps/api/core`. Argument keys use camelCase on the TypeScript side for Rust snake_case parameters where Tauri maps names.

### Launcher/system

| Command | Args | Returns | Used by |
|---|---|---|---|
| `list_apps` | none | `AppInfo[]` | app launcher |
| `open_app` | `{ path }` | void | app launcher |
| `hide_main_window` | none/window | void | App window controls |
| `quit_app` | none | void | Settings/menu |

### Files

| Command | Args | Returns |
|---|---|---|
| `launcher_search_files` | `{ query }` | `FileInfo[]` |
| `search_files` | `{ query }` | `FileInfo[]` |
| `smart_search_files` | `{ query }` | `SmartFileInfo[]` |
| `read_file` | `{ path, maxBytes? }` | text string |
| `open_file` | `{ path }` | void |

### Notes

| Command | Args | Returns |
|---|---|---|
| `create_note` | `{ title, content }` | `Note` |
| `get_notes` | none | `Note[]` |
| `update_note` | `{ id, title, content }` | `Note` |
| `delete_note` | `{ id }` | void |
| `search_notes` | `{ query }` | `Note[]` |
| `get_note_by_id` | `{ id }` | `Note` |

### Docker

| Command | Args | Returns |
|---|---|---|
| `docker_status` | none | `DockerStatus` |
| `search_docker_hub` | query/page args | Docker Hub result DTOs |
| `list_containers` | none | `ContainerInfo[]` |
| `list_images` | none | `ImageInfo[]` |
| `manage_container` | `{ id, action, confirmed? }` | `DockerCommandResult` |
| `delete_image` | `{ id, force?, confirmed? }` | `DockerCommandResult` |
| `pull_image` | `{ image }` | `DockerCommandResult` |
| `run_container` | `{ options }` | `DockerCommandResult` |
| `container_logs` | `{ id, tail?, timestamps? }` | `DockerCommandResult` |
| `exec_container` | `{ id, command }` | `DockerCommandResult` |
| `inspect_docker` | `{ target }` | `DockerCommandResult` |
| `prune_docker` | `{ kind, volumes?, force?, confirmed? }` | `DockerCommandResult` |
| `compose_read_file` | `{ path }` | string |
| `compose_write_file` | `{ path, content, overwrite?, confirmed? }` | void |
| `compose_action` | `{ path, action, detach?, volumes?, confirmed? }` | `DockerCommandResult` |

### Capture/OCR/dialog/shortcuts/terminal/network

| Command | Args | Returns |
|---|---|---|
| `capture_region` | `{ x, y, width, height, mode }` | saved image path |
| `open_image_dialog` | none | `ImageAttachment[]` |
| `close_selector` | none/window | void |
| `update_main_shortcut` | `{ shortcut }` | void |
| `update_screenshot_shortcut` | `{ shortcut }` | void |
| `update_ocr_shortcut` | `{ shortcut }` | void |
| `get_network_info` | none | `NetworkInfo` |
| `open_terminal_command` | `{ command }` | void |
| `run_terminal_command_inline` | `{ id, command }` | `TerminalCommandResult` plus output events |
| `cancel_terminal_command` | `{ id }` | void |
| `cancel_all_terminal_commands` | none | void |

## External provider contracts

- OpenAI/Kimi Chat Completions: frontend fetch with streaming SSE and function-calling tools.
- OpenAI Responses: frontend fetch with streaming SSE, function tools, and optional hosted web search for supported models.
- Google Gemini: `generateContent` and `alt=sse` streaming with `functionDeclarations`.
- Anthropic: `/v1/messages` streaming with tool use blocks.
- Open-Meteo: weather geocoding and forecast/current weather.
- Cloudflare speed test: frontend latency/download/upload sampling endpoints.
- Docker Hub: frontend `src/utils/dockerHub.ts` plus Rust `search_docker_hub` command path for Docker views.

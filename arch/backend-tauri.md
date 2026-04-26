# Tauri Backend and Cross-Platform Integrations

Source of truth: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`.

## Backend responsibilities

- Window lifecycle: hidden launcher window, selector window, focus restoration, tray menu.
- Global shortcuts: main launcher, screenshot, OCR, dynamic shortcut updates.
- System integration: app listing/launching, file open/search, network info, screenshot/OCR, clipboard, native dialogs.
- Local persistence: SQLite notes database in app data directory.
- Docker CLI operations and Docker Hub search proxy.
- Terminal command opening/running/canceling.

## Registered commands

| Area | Commands |
|---|---|
| App/window | `greet`, `quit_app`, `hide_main_window`, `close_selector` |
| Apps | `list_apps`, `open_app` |
| Network | `get_network_info` |
| Docker status/search | `docker_status`, `search_docker_hub` |
| Docker local | `list_containers`, `list_images`, `delete_image`, `manage_container`, `pull_image`, `run_container`, `container_logs`, `exec_container`, `inspect_docker`, `prune_docker` |
| Docker Compose | `compose_read_file`, `compose_write_file`, `compose_action` |
| Capture/OCR | `capture_region` |
| Files | `search_files`, `launcher_search_files`, `smart_search_files`, `read_file`, `open_file` |
| Shortcuts | `update_main_shortcut`, `update_screenshot_shortcut`, `update_ocr_shortcut` |
| Dialog/image attachment | `open_image_dialog` |
| Notes | `create_note`, `get_notes`, `update_note`, `delete_note`, `search_notes`, `get_note_by_id` |
| Terminal | `open_terminal_command`, `run_terminal_command_inline`, `cancel_terminal_command`, `cancel_all_terminal_commands` |

## Cross-platform behavior

| Feature | macOS | Windows | Linux |
|---|---|---|---|
| Default launcher shortcut | `Alt+Space` | `Alt+Shift+Space` | `Alt+Space` |
| App discovery | `/Applications`, `/System/Applications`, `~/Applications`, app icon extraction/caching | Start Menu `.lnk` files | `.desktop` entries in application dirs |
| App launch | `open` | `cmd /C start` | `xdg-open` |
| OCR | Native Tesseract command path through `tesseract` crate | Emits base64 image for frontend AI vision OCR | Emits base64 image for frontend AI vision OCR |
| Terminal open | Terminal.app via `osascript` argv | `cmd /K` | Tries common terminal emulators |
| Inline command shell | `sh -lc`, own process group | `cmd /C`, canceled via `taskkill` | `sh -lc`, own process group |

## Startup and lifecycle

```mermaid
sequenceDiagram
  participant Tauri
  participant Plugins as Tauri plugins
  participant State
  participant Tray
  participant Window

  Tauri->>Plugins: init opener, clipboard, global-shortcut, dialog
  Tauri->>Tray: build menu Open/Settings/Quit
  Tauri->>State: manage ShortcutState, DialogState, PreviousFocusState, TerminalState
  Tauri->>State: open SQLite gquick.db + create notes table
  Tauri->>Plugins: register main/screenshot/OCR shortcuts
  Tauri->>Window: intercept close/focus-lost to hide launcher
```

## Screenshot/OCR flow

```mermaid
flowchart TD
  Shortcut[Alt+S or Alt+O] --> Selector[Create/show selector window]
  Selector --> Drag[User selects region]
  Drag --> Capture[capture_region]
  Capture --> Hide[Hide selector, wait 150ms]
  Hide --> Xcap[xcap monitor capture]
  Xcap --> Crop[Scale coords, crop image]
  Crop --> Save[Save ~/Desktop/gquick_capture.png]
  Save --> Mode{Mode}
  Mode -->|screenshot| Clipboard[Write image to clipboard]
  Mode -->|OCR macOS| Tesseract[Run Tesseract, copy text, emit ocr-complete]
  Mode -->|OCR Win/Linux| Emit[Emit ocr-image-ready base64 for AI vision]
```

## Safety boundaries

- Docker destructive operations require explicit `confirmed` values for remove/kill/delete/prune/compose volume removal/compose overwrite.
- Docker references and compose paths are validated before invoking the CLI.
- File read tool rejects unsafe/hidden/symlink/secret/outside-root paths and clamps max bytes.
- Inline terminal only runs one command at a time and asks frontend to confirm close/hide while command is running.

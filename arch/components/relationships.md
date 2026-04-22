# Component Interactions

## Frontend-Backend Communication

### Tauri Commands

The frontend invokes Rust commands via `@tauri-apps/api/core`:

```typescript
import { invoke } from "@tauri-apps/api/core";

// App Launcher
const apps = await invoke<AppInfo[]>("list_apps");
await invoke("open_app", { path: app.path });

// Docker
const containers = await invoke<ContainerInfo[]>("list_containers");
const images = await invoke<ImageInfo[]>("list_images");
await invoke("manage_container", { id: c.id, action: "stop" });
await invoke("delete_image", { id: img.id });

// Screen Capture
await invoke("capture_region", { 
  x, y, width, height, mode: "screenshot" | "ocr" 
});
```

### Tauri Events

The backend emits events to the frontend:

```typescript
import { listen } from "@tauri-apps/api/event";

// Selector window listens for mode changes
const unlisten = await listen<string>("set-mode", (event) => {
  setMode(event.payload);
});
```

### Window Management

```typescript
import { getCurrentWindow } from "@tauri-apps/api/window";

// Hide window
await getCurrentWindow().hide();

// Close window
await getCurrentWindow().close();
```

## Plugin Data Flow

```mermaid
sequenceDiagram
    participant User
    participant App as App.tsx
    participant Registry as Plugin Registry
    participant Plugin as Individual Plugin
    participant Rust as Rust Backend

    User->>App: Types query
    App->>Registry: getItems(query)
    Registry->>Plugin: getItems(query)
    Plugin->>Rust: invoke commands (if needed)
    Rust-->>Plugin: Return data
    Plugin-->>Registry: Return SearchResultItem[]
    Registry-->>App: Flattened results
    App->>App: Render list
    User->>App: Press Enter
    App->>Plugin: item.onSelect()
    Plugin->>Rust: invoke action command
    Rust-->>Plugin: Success/Error
```

## Settings Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Settings as Settings.tsx
    participant Storage as localStorage

    User->>Settings: Open settings
    Settings->>Storage: Read saved values
    Storage-->>Settings: Return api-key, provider, etc.
    Settings->>Settings: Populate form fields

    User->>Settings: Modify settings
    Settings->>Settings: Update local state

    User->>Settings: Click Save
    Settings->>Storage: Write api-key, provider, model
    Settings->>App: onClose callback
```

## Screen Capture Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Shortcut as Global Shortcut Handler
    participant Selector as Selector Window
    participant Rust as capture_region (Rust)
    participant xcap as xcap crate
    participant Clipboard as Clipboard

    User->>Shortcut: Press Alt+S or Alt+O
    Shortcut->>Selector: Create/show selector window
    User->>Selector: Drag to select region
    Selector->>Rust: invoke("capture_region", coords, mode)
    Rust->>Rust: Hide selector window
    Rust->>Rust: Sleep 150ms
    Rust->>xcap: Capture monitor image
    xcap-->>Rust: Fullscreen image
    Rust->>Rust: Crop to selected region
    Rust->>Rust: Save to ~/Desktop/gquick_capture.png

    alt mode == "screenshot"
        Rust->>Rust: Open image with `open` command
    else mode == "ocr"
        Rust->>Clipboard: Write mock text
    end

    Rust->>Selector: Close window
```

## Chat Data Flow (Mocked)

```mermaid
sequenceDiagram
    participant User
    participant App as App.tsx
    participant State as React State

    User->>App: Type message + Enter
    App->>State: Add user message
    App->>App: Render user bubble
    App->>App: setTimeout(600ms)
    App->>State: Add mock assistant response
    App->>App: Render assistant bubble
```

## Dependency Graph

```mermaid
graph LR
    subgraph "Frontend"
        A[App.tsx]
        S[Settings.tsx]
        Se[Selector.tsx]
        M[main.tsx]
        P[Plugins]
    end

    subgraph "Tauri API"
        T1[@tauri-apps/api/core]
        T2[@tauri-apps/api/window]
        T3[@tauri-apps/api/event]
    end

    subgraph "Tauri Plugins"
        TP1[@tauri-apps/plugin-opener]
        TP2[@tauri-apps/plugin-clipboard-manager]
    end

    A --> T1
    A --> T2
    A --> P
    A --> S
    Se --> T1
    Se --> T2
    Se --> T3
    M --> T2
    P --> T1
    P --> TP1
```

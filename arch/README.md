# GQuick Architecture Overview

GQuick is a macOS productivity launcher built with **Tauri 2.0** (Rust backend) and **React 19** (TypeScript frontend).

## System Architecture

```mermaid
graph TB
    subgraph "Frontend (React 19 + TypeScript)"
        A[App.tsx<br/>Search + Chat UI] --> B[Plugin System]
        A --> C[Settings.tsx<br/>AI Config UI]
        D[Selector.tsx<br/>Region Selection] --> E[Tauri Commands]
        B --> F[App Launcher]
        B --> G[Calculator]
        B --> H[Docker Manager]
        B --> I[Web Search]
    end

    subgraph "Tauri Bridge"
        E --> J[invoke commands]
        K[Global Shortcuts] --> L[Shortcut Handler]
    end

    subgraph "Backend (Rust)"
        J --> M[list_apps]
        J --> N[capture_region]
        J --> O[Docker Commands]
        J --> P[open_app]
        L --> Q[Window Manager]
        Q --> R[System Tray]
        N --> S[xcap crate]
        N --> T[image crate]
    end

    subgraph "System"
        S --> U[Screen Capture]
        T --> V[Image Crop/Save]
        O --> W[Docker CLI]
        P --> X[macOS open]
        R --> Y[Menu Bar Icon]
    end
```

## Window Architecture

GQuick uses two Tauri windows:

1. **"main"** — The launcher interface (search, chat, settings)
2. **"selector"** — Fullscreen transparent overlay for region selection

Both share the same HTML entry point; `main.tsx` routes based on `window.label`.

## Plugin Architecture

The plugin system allows decoupled search providers:

```mermaid
flowchart LR
    Query[User Query] --> Registry[Plugin Registry]
    Registry --> P1[App Launcher]
    Registry --> P2[Calculator]
    Registry --> P3[Docker]
    Registry --> P4[Web Search]
    P1 --> Results[Flattened Results]
    P2 --> Results
    P3 --> Results
    P4 --> Results
    Results --> UI[App.tsx List]
```

Each plugin implements `GQuickPlugin`:
- `metadata`: ID, title, icon, keywords
- `getItems(query)`: Returns `Promise<SearchResultItem[]>`

## Data Flow

### Search Flow
```
User Input → Debounce (50ms) → Parallel Plugin Queries → Flatten → Render
```

### Screenshot/OCR Flow
```
Alt+S/O → Create Selector Window → User Drags Region → 
Send Coords to Rust → Hide Window → 150ms Delay → 
xcap Capture → Crop → Save to Desktop → Handle Mode
```

### Chat Flow (Mocked)
```
User Message → Local State Update → 600ms Delay → 
Mock Response → Local State Update
```

## Key Design Decisions

1. **Rust handles all screen capture**: Avoids browser security restrictions
2. **Single HTML with window routing**: Simplifies build, shared CSS/JS
3. **localStorage for settings**: Simple but insecure for API keys
4. **Plugin system**: Easy to add new search providers
5. **Transparent borderless windows**: Native Spotlight-like feel

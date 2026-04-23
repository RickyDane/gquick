# GQuick Architecture Overview

GQuick is a cross-platform desktop productivity launcher built with **Tauri 2.0** (Rust backend) and **React 19** (TypeScript frontend).

## System Architecture

```mermaid
graph TB
    subgraph "Frontend (React 19 + TypeScript)"
        A[App.tsx<br/>Search + Chat + Actions] --> B[Plugin System]
        A --> C[Settings.tsx<br/>API + Shortcuts Config]
        D[Selector.tsx<br/>Region Selection] --> E[Tauri Commands]
        B --> F[App Launcher]
        B --> G[Calculator]
        B --> H[Docker Manager]
        B --> I[Web Search]
        B --> J[File Search]
        B --> K[Translate]
    end

    subgraph "Tauri Bridge"
        E --> L[invoke commands]
        M[Global Shortcuts] --> N[Shortcut Handler]
        O[Events] --> P[listen/emit]
    end

    subgraph "Backend (Rust)"
        L --> Q[list_apps / open_app]
        L --> R[capture_region]
        L --> S[search_files / smart_search_files]
        L --> T[Docker Commands]
        L --> U[update_shortcut]
        N --> V[Window Manager]
        V --> W[System Tray]
        R --> X[xcap crate]
        R --> Y[image crate]
        R --> Z[tesseract crate]
        S --> AA[FileIndex + walkdir]
    end

    subgraph "System"
        X --> AB[Screen Capture]
        Y --> AC[Image Crop/Save]
        Z --> AD[OCR Text Extraction]
        T --> AE[Docker CLI]
        Q --> AF[macOS/Win/Linux Apps]
        W --> AG[Menu Bar Icon]
        AA --> AH[File System]
    end
```

## Window Architecture

GQuick uses two Tauri windows:

1. **"main"** — The launcher interface (search, chat, settings, actions)
2. **"selector"** — Fullscreen transparent overlay for region selection

Both share the same HTML entry point; `main.tsx` routes based on `window.label`.

## Plugin Architecture

The plugin system allows decoupled search providers:

```mermaid
flowchart LR
    Query[User Query] --> Registry[Plugin Registry]
    Registry --> P1[App Launcher]
    Registry --> P2[File Search]
    Registry --> P3[Calculator]
    Registry --> P4[Docker]
    Registry --> P5[Web Search]
    Registry --> P6[Translate]
    P1 --> Results[Flattened Results]
    P2 --> Results
    P3 --> Results
    P4 --> Results
    P5 --> Results
    P6 --> Results
    Results --> UI[App.tsx List]
```

Each plugin implements `GQuickPlugin`:
- `metadata`: ID, title, icon, keywords, subtitle
- `getItems(query)`: Returns `Promise<SearchResultItem[]>`

## Data Flow

### Search Flow
```
User Input → Debounce (150ms) → Parallel Plugin Queries → Flatten + Sort → Render
```

### Screenshot/OCR Flow
```
Alt+S/O → Create Selector Window → User Drags Region → 
Send Coords to Rust → Hide Window → 150ms Delay → 
xcap Capture → Crop → Save to Desktop → Handle Mode
(screenshot: copy image to clipboard | ocr: run Tesseract → copy text to clipboard)
```

### AI Chat Flow (Real Streaming)
```
User Message + Optional Images → Provider-specific SSE streaming →
Real-time Markdown rendering in chat UI
```

### Quick Translate Flow
```
User types "t: text" or "> text" → 400ms debounce → AI API call →
Single result display → Enter copies to clipboard
```

## Key Design Decisions

1. **Rust handles all screen capture and OCR**: Avoids browser security restrictions; Tesseract runs locally
2. **Single HTML with window routing**: Simplifies build, shared CSS/JS
3. **localStorage for settings**: Simple but insecure for API keys
4. **Plugin system**: Easy to add new search providers
5. **Transparent borderless windows**: Native Spotlight-like feel
6. **Real AI streaming via SSE**: Responsive chat experience across all providers
7. **File index with caching**: 5-minute TTL, home directory, max depth 6

# Component Interactions

## Frontend-Backend Communication

### Tauri Commands

The frontend invokes Rust commands via `@tauri-apps/api/core`:

```typescript
import { invoke } from "@tauri-apps/api/core";

// App Launcher
const apps = await invoke<AppInfo[]>("list_apps");
await invoke("open_app", { path: app.path });

// File Search
const files = await invoke<FileInfo[]>("search_files", { query });
const smartFiles = await invoke<SmartFileInfo[]>("smart_search_files", { query });
await invoke("open_file", { path: file.path });

// Docker
const containers = await invoke<ContainerInfo[]>("list_containers");
const images = await invoke<ImageInfo[]>("list_images");
await invoke("manage_container", { id: c.id, action: "stop" });
await invoke("delete_image", { id: img.id });

// Screen Capture
await invoke("capture_region", { 
  x, y, width, height, mode: "screenshot" | "ocr" 
});

// Shortcuts
await invoke("update_main_shortcut", { shortcut: "Alt+Space" });
await invoke("update_screenshot_shortcut", { shortcut: "Alt+S" });
await invoke("update_ocr_shortcut", { shortcut: "Alt+O" });

// Image Dialog
const images = await invoke<ImageAttachment[]>("open_image_dialog");

// Close Selector
await invoke("close_selector");
```

### Tauri Events

The backend emits events to the frontend:

```typescript
import { listen } from "@tauri-apps/api/event";

// Selector window listens for mode changes
const unlisten = await listen<string>("set-mode", (event) => {
  setMode(event.payload);
});

// App listens for window hidden to reset state
const unlisten = await listen("window-hidden", () => {
  setView("search");
  setQuery("");
  // ... reset state
});

// App listens for OCR completion
const unlisten = await listen<string>("ocr-complete", (event) => {
  // Show OCR preview notification
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
    participant AI as AI API

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

### Smart File Search with AI Ranking

```mermaid
sequenceDiagram
    participant User
    participant App as App.tsx
    participant FilePlugin as fileSearch Plugin
    participant Rust as Rust Backend
    participant AI as AI Provider API

    User->>App: Types "find files about budget"
    App->>FilePlugin: getItems(query)
    FilePlugin->>Rust: invoke("smart_search_files", {query})
    Rust->>Rust: Build index, scan files, filter
    Rust-->>FilePlugin: SmartFileInfo[] with metadata + content
    FilePlugin->>AI: callAiRankFiles(query, files)
    AI-->>FilePlugin: ranked indices
    FilePlugin->>FilePlugin: Reorder by AI ranking
    FilePlugin-->>App: SearchResultItem[]
    App->>App: Render with "Smart" badge
```

## Settings Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Settings as Settings.tsx
    participant Storage as localStorage
    participant Rust as Rust Backend

    User->>Settings: Open settings
    Settings->>Storage: Read saved values
    Storage-->>Settings: Return api-key, provider, shortcuts, etc.
    Settings->>Settings: Populate form fields

    User->>Settings: Enter API key / select provider
    Settings->>AI: Fetch models (with 500ms debounce)
    AI-->>Settings: Model list
    Settings->>Storage: Cache models (24h)

    User->>Settings: Record new shortcut
    Settings->>Settings: ShortcutRecorder captures keys
    Settings->>Rust: invoke("update_main_shortcut", {shortcut})
    Rust-->>Settings: Ok

    User->>Settings: Click Save
    Settings->>Storage: Write api-key, provider, model, shortcuts
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
    participant Image as image crate
    participant Tesseract as tesseract crate
    participant Clipboard as Clipboard Manager

    User->>Shortcut: Press Alt+S or Alt+O
    Shortcut->>Selector: Create/show selector window
    User->>Selector: Drag to select region
    Selector->>Rust: invoke("capture_region", coords, mode)
    Rust->>Rust: Hide selector window
    Rust->>Rust: Sleep 150ms
    Rust->>xcap: Capture monitor image
    xcap-->>Rust: Fullscreen image
    Rust->>Image: Crop to region
    Image-->>Rust: Cropped image
    Rust->>Rust: Save to ~/Desktop/gquick_capture.png

    alt mode == "screenshot"
        Rust->>Clipboard: write_image(cropped)
    else mode == "ocr"
        Rust->>Tesseract: set_image(path) + get_text()
        Tesseract-->>Rust: Extracted text
        Rust->>Clipboard: write_text(ocr_text)
        Rust->>App: emit("ocr-complete", preview)
    end

    Rust->>Selector: Close window
```

## AI Chat Data Flow (Real Streaming)

```mermaid
sequenceDiagram
    participant User
    participant App as App.tsx
    participant Stream as streaming.ts
    participant API as AI Provider API

    User->>App: Type message (+ optional images)
    App->>App: Add user message to state
    App->>App: Add empty assistant message
    App->>Stream: streamOpenAI / streamGemini / streamAnthropic
    Stream->>API: POST with stream=true (SSE)
    API-->>Stream: Server-Sent Events (chunks)

    loop For each chunk
        Stream->>Stream: Parse delta/content
        Stream->>App: onContent(text)
        App->>App: Update assistant message state
        App->>App: Re-render with MarkdownMessage
    end

    Stream->>App: onDone()
    App->>App: Set isLoading=false
```

## Quick Translate Data Flow

```mermaid
sequenceDiagram
    participant User
    participant App as App.tsx
    participant QT as quickTranslate.ts
    participant API as AI Provider API

    User->>App: Type "t: Guten Morgen"
    App->>App: Detect prefix, set isTranslating=true
    App->>QT: performQuickTranslate("Guten Morgen")
    QT->>QT: isLikelyGerman → true → target=English
    QT->>API: POST translation prompt
    API-->>QT: Translated text
    QT-->>App: {result, detectedLang, targetLang}
    App->>App: set isTranslating=false
    App->>App: Display result item
    User->>App: Press Enter
    App->>Clipboard: Copy result
    App->>App: Hide window
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
        Stream[streaming.ts]
        QT[quickTranslate.ts]
        MM[MarkdownMessage]
        SR[ShortcutRecorder]
        TT[Tooltip]
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
    A --> T3
    A --> P
    A --> S
    A --> Stream
    A --> QT
    A --> MM
    A --> TT
    S --> T1
    S --> SR
    Se --> T1
    Se --> T2
    Se --> T3
    M --> T2
    P --> T1
    P --> TP1
    Stream --> API[External AI APIs]
    QT --> API
```

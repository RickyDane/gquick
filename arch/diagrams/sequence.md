# Sequence Diagrams

## Application Startup

```mermaid
sequenceDiagram
    participant User
    participant App as GQuick App
    participant Builder as Tauri Builder
    participant Tray as System Tray
    participant Shortcuts as Global Shortcuts
    participant Window as Main Window

    User->>App: Launch Application
    App->>Builder: tauri::Builder::default()
    Builder->>Builder: Initialize plugins (opener, clipboard, global-shortcut, shell, fs, dialog, sql)
    Builder->>Builder: Configure window events
    Builder->>Builder: Register invoke handlers
    Builder->>App: Build and run

    App->>Tray: Create tray icon with menu
    Tray->>Tray: Add "Quit" menu item
    Tray->>Tray: Configure click handler (toggle_window)

    App->>Shortcuts: Register Alt+Space (main)
    App->>Shortcuts: Register Alt+S (screenshot)
    App->>Shortcuts: Register Alt+O (OCR)

    App->>Window: Create main window
    Window->>Window: Set size: 760x800
    Window->>Window: Set transparent, borderless, skipTaskbar
    Window->>Window: Hide initially

    App-->>User: App ready (hidden)
```

## Search and Launch

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Plugins as Plugin System
    participant AL as App Launcher Plugin
    participant FS as File Search Plugin
    participant Calc as Calculator Plugin
    participant Docker as Docker Plugin
    participant WS as Web Search Plugin
    participant Rust as Rust Backend

    User->>App: Press Alt+Space
    App->>App: Show window
    App->>App: Focus input

    User->>App: Type "calc 2+2"
    App->>App: setQuery("calc 2+2")
    App->>App: setActiveIndex(0)
    App->>App: setTimeout(fetchItems, 150ms)

    App->>Plugins: plugins.map(p => p.getItems("calc 2+2"))
    Plugins->>AL: getItems("calc 2+2")
    AL->>AL: Filter cached apps
    AL-->>Plugins: []

    Plugins->>FS: getItems("calc 2+2")
    FS->>Rust: invoke("search_files", {query})
    Rust->>Rust: Search file index
    Rust-->>FS: FileInfo[]
    FS-->>Plugins: []

    Plugins->>Calc: getItems("calc 2+2")
    Calc->>Calc: Validate regex
    Calc->>Calc: Evaluate: 2+2 = 4
    Calc-->>Plugins: [{title: "= 4", subtitle: "Calculation: 2+2"}]

    Plugins->>Docker: getItems("calc 2+2")
    Docker->>Rust: invoke("list_containers")
    Rust->>Rust: docker ps -a
    Rust-->>Docker: []
    Docker-->>Plugins: []

    Plugins->>WS: getItems("calc 2+2")
    WS-->>Plugins: [Google search result]

    Plugins-->>App: Flattened results
    App->>App: setItems(results)
    App->>App: Render list

    User->>App: Press Enter
    App->>Calc: item.onSelect()
    Calc->>Calc: navigator.clipboard.writeText("4")
    App->>App: Hide window
```

## Smart File Search

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant FS as File Search Plugin
    participant Rust as Rust Backend
    participant AI as AI Provider API

    User->>App: Type "find files about budget from last week"
    App->>App: isSmartSearchQuery = true
    App->>App: setTimeout(fetchItems, 150ms)

    App->>FS: getItems(query)
    FS->>Rust: invoke("smart_search_files", {query})
    Rust->>Rust: Check cache (5-min TTL)
    Rust->>Rust: Build index if needed (walkdir, max depth 6)
    Rust->>Rust: Filter candidates, read metadata
    Rust->>Rust: Read text content previews
    Rust->>Rust: Apply time filter (last week)
    Rust-->>FS: SmartFileInfo[] (up to 100)

    FS->>FS: Format file descriptions
    FS->>AI: POST ranking prompt with file data
    AI-->>FS: Ranked indices [5, 2, 8, 1]
    FS->>FS: Reorder files by AI ranking
    FS-->>App: SearchResultItem[] with "Smart" badge
    App->>App: Render results
```

## Screenshot Capture

```mermaid
sequenceDiagram
    actor User
    participant GS as Global Shortcut
    participant Rust as Rust Backend
    participant Selector as Selector Window
    participant xcap as xcap crate
    participant Image as image crate
    participant Clipboard as Clipboard Manager

    User->>GS: Press Alt+S
    GS->>Rust: Handler triggered
    Rust->>Rust: Get primary monitor info
    Rust->>Rust: Calculate logical size/position

    alt Selector exists
        Rust->>Selector: emit("set-mode", "screenshot")
        Rust->>Selector: show(), setFocus()
    else Selector doesn't exist
        Rust->>Rust: WebviewWindowBuilder::new("selector")
        Rust->>Selector: Set fullscreen, transparent, always_on_top
        Rust->>Selector: Build, show, focus
    end

    User->>Selector: Drag from (100,100) to (500,400)
    Selector->>Selector: Calculate: x=100, y=100, w=400, h=300
    Selector->>Rust: invoke("capture_region", coords, "screenshot")

    Rust->>Rust: Get monitor name and scale factor (e.g., 2.0)
    Rust->>Selector: window.hide()
    Rust->>Rust: thread::sleep(150ms)

    Rust->>xcap: Monitor::all()
    xcap-->>Rust: Monitor list
    Rust->>Rust: Find matching monitor by name
    Rust->>xcap: monitor.capture_image()
    xcap-->>Rust: Full monitor image

    Rust->>Rust: Convert logical to physical
    Rust->>Rust: phys_x = 200, phys_y = 200, phys_w = 800, phys_h = 600
    Rust->>Image: imageops::crop_imm(image, 200, 200, 800, 600)
    Image-->>Rust: Cropped image

    Rust->>Rust: Save to ~/Desktop/gquick_capture.png

    Rust->>Clipboard: clipboard.write_image(cropped)
    Rust->>Selector: window.close()
    Rust-->>Selector: Return path string
```

## OCR Flow (Real Tesseract Implementation)

```mermaid
sequenceDiagram
    actor User
    participant GS as Global Shortcut
    participant Rust as Rust Backend
    participant Selector as Selector Window
    participant xcap as xcap crate
    participant Image as image crate
    participant Tesseract as tesseract crate
    participant Clipboard as Clipboard Manager
    participant App as App.tsx

    User->>GS: Press Alt+O
    GS->>Rust: Handler triggered
    Rust->>Rust: mode = "ocr"
    Rust->>Selector: Create/show selector window

    User->>Selector: Drag to select region
    Selector->>Rust: invoke("capture_region", coords, "ocr")

    Rust->>Rust: Hide selector, sleep 150ms
    Rust->>xcap: Capture monitor image
    xcap-->>Rust: Fullscreen image
    Rust->>Image: Crop to region
    Image-->>Rust: Cropped image
    Rust->>Rust: Save to ~/Desktop/gquick_capture.png

    Rust->>Tesseract: Tesseract::new(data_path, "eng")
    Tesseract-->>Rust: Tesseract instance
    Rust->>Tesseract: set_image(path)
    Tesseract-->>Rust: Image loaded
    Rust->>Tesseract: get_text()
    Tesseract-->>Rust: Extracted text

    Rust->>Clipboard: write_text(ocr_text)
    Rust->>App: emit("ocr-complete", preview)
    Rust->>Selector: window.close()
    Rust-->>Selector: Return path string
```

## AI Chat Flow (Real Streaming)

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Stream as streaming.ts
    participant API as AI Provider API

    User->>App: Press Cmd/Ctrl + Left Shift + C
    App->>App: setView("chat")
    App->>App: Render chat UI

    User->>App: Type "Explain quantum computing"
    App->>App: setChatInput("Explain quantum computing")

    User->>App: Press Enter
    App->>App: handleSendMessage()
    App->>App: Add user message to state
    App->>App: Add empty assistant message
    App->>App: setIsLoading(true)

    alt Provider is OpenAI/Kimi
        App->>Stream: streamOpenAI(url, headers, body, callbacks)
    else Provider is Google
        App->>Stream: streamGemini(url, headers, body, callbacks)
    else Provider is Anthropic
        App->>Stream: streamAnthropic(url, headers, body, callbacks)
    end

    Stream->>API: POST with stream=true (SSE)
    API-->>Stream: Server-Sent Events

    loop For each chunk
        Stream->>Stream: Parse delta/content
        Stream->>App: onContent(text)
        App->>App: Update assistant message state
        App->>App: Render with MarkdownMessage
    end

    Stream->>App: onDone()
    App->>App: setIsLoading(false)
```

## Settings Configuration

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Settings as Settings.tsx
    participant Storage as localStorage
    participant Rust as Rust Backend
    participant API as AI Provider API

    User->>App: Press ⌘,
    App->>App: setView("settings")
    App->>Settings: Render <Settings onClose={handleClose} />

    Settings->>Storage: getItem("main-shortcut")
    Storage-->>Settings: "Alt+Space"
    Settings->>Settings: setMainShortcut("Alt+Space")

    Settings->>Storage: getItem("api-key")
    Storage-->>Settings: "sk-abc123"
    Settings->>Settings: setApiKey("sk-abc123")

    Settings->>Storage: getItem("api-provider")
    Storage-->>Settings: "openai"
    Settings->>Settings: setApiProvider("openai")

    Settings->>Storage: getItem("selected-model")
    Storage-->>Settings: "gpt-4o"
    Settings->>Settings: setSelectedModel("gpt-4o")

    Settings->>App: Render with loaded values

    User->>Settings: Record new main shortcut (Alt+Shift+Space)
    Settings->>Rust: invoke("update_main_shortcut", {shortcut: "Alt+Shift+Space"})
    Rust-->>Settings: Ok
    Settings->>Settings: setMainShortcut("Alt+Shift+Space")

    User->>Settings: Enter new API key
    Settings->>Settings: setApiKey("sk-newkey")

    User->>Settings: Change provider to "google"
    Settings->>Settings: setApiProvider("google")
    Settings->>API: Fetch models (500ms debounce)
    API-->>Settings: Model list
    Settings->>Settings: setModels(models)
    Settings->>Storage: Cache models (24h)

    User->>Settings: Select "gemini-1.5-pro"
    Settings->>Settings: setSelectedModel("gemini-1.5-pro")

    User->>Settings: Click Save
    Settings->>Storage: setItem("api-key", "sk-newkey")
    Settings->>Storage: setItem("api-provider", "google")
    Settings->>Storage: setItem("selected-model", "gemini-1.5-pro")
    Settings->>Storage: setItem("main-shortcut", "Alt+Shift+Space")
    Settings->>App: onClose()
    App->>App: setView("search")
```

## Docker Container Management

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Docker as Docker Plugin
    participant Rust as Rust Backend
    participant System as Docker Daemon

    User->>App: Type "docker"
    App->>Docker: getItems("docker")

    Docker->>Rust: invoke("list_containers")
    Rust->>System: docker ps -a --format "..."
    System-->>Rust: Container list
    Rust-->>Docker: ContainerInfo[]

    Docker->>Rust: invoke("list_images")
    Rust->>System: docker images --format "..."
    System-->>Rust: Image list
    Rust-->>Docker: ImageInfo[]

    Docker->>Docker: Filter and format results
    Docker-->>App: SearchResultItem[]
    App->>App: Render results

    User->>App: Select container "nginx"
    App->>Docker: Show actions preview

    alt User clicks "Stop"
        Docker->>Rust: invoke("manage_container", {id: "abc", action: "stop"})
        Rust->>System: docker stop abc
        System-->>Rust: Success
        Rust-->>Docker: Ok(())
    else User clicks "Restart"
        Docker->>Rust: invoke("manage_container", {id: "abc", action: "restart"})
        Rust->>System: docker restart abc
        System-->>Rust: Success
        Rust-->>Docker: Ok(())
    end

    Docker->>App: Refresh list
```

## Quick Translate

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant QT as quickTranslate.ts
    participant API as AI Provider API

    User->>App: Type "> Guten Morgen"
    App->>App: isQuickTranslateQuery returns true
    App->>App: setIsTranslating(true)
    App->>App: setTimeout(doTranslate, 400ms)

    App->>QT: performQuickTranslate("Guten Morgen")
    QT->>QT: isLikelyGerman("Guten Morgen") = true
    QT->>QT: targetLang = "English"
    QT->>QT: Build prompt: "Translate to English..."

    QT->>API: POST /v1/chat/completions
    API-->>QT: "Good morning"

    QT-->>App: {result: "Good morning", detectedLang: "German", targetLang: "English"}
    App->>App: setIsTranslating(false)
    App->>App: Display single result item

    User->>App: Press Enter
    App->>App: navigator.clipboard.writeText("Good morning")
    App->>App: Hide window
```

## Global Shortcut Registration Sequence

```mermaid
sequenceDiagram
    participant Main as main.rs
    participant Builder as tauri::Builder
    participant GS as Global Shortcut Plugin
    participant App as AppHandle

    Main->>Builder: tauri::Builder::default()
    Builder->>Builder: plugin(opener)
    Builder->>Builder: plugin(clipboard-manager)
    Builder->>Builder: plugin(shell)
    Builder->>Builder: plugin(fs)
    Builder->>Builder: plugin(dialog)
    Builder->>Builder: plugin(sql)
    Builder->>GS: plugin(global-shortcut with handler)
    GS->>GS: Define shortcut handler (check all 3 shortcuts)
    Builder->>Builder: setup(|app| { ... })
    Builder->>App: Build app
    App->>GS: Register Alt+Space (main)
    App->>GS: Register Alt+S (screenshot)
    App->>GS: Register Alt+O (OCR)
    App->>App: manage(ShortcutState)
    App->>App: manage(DialogState)
    GS-->>App: Shortcuts registered
```

## Window Toggle Sequence

```mermaid
sequenceDiagram
    actor User
    participant GS as Global Shortcut
    participant Rust as Rust Backend
    participant Window as Main Window

    User->>GS: Press Alt+Space
    GS->>Rust: Shortcut handler (state == Pressed)
    Rust->>Rust: toggle_window(app)
    Rust->>Window: app.get_webview_window("main")
    Window-->>Rust: Option<Window>

    alt Window is visible
        Rust->>Window: window.hide()
        Rust->>Window: emit("window-hidden", ())
    else Window is hidden
        Rust->>Window: Center on primary monitor
        Rust->>Window: window.show()
        Rust->>Window: window.set_focus()
        Rust->>Window: emit("window-shown", ())
    end
```

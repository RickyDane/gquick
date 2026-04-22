# API Interaction Sequences

## Screen Capture Sequence

```mermaid
sequenceDiagram
    actor User
    participant GS as Global Shortcut
    participant Rust as Rust Backend
    participant Selector as Selector Window
    participant xcap as xcap crate
    participant Image as image crate
    participant FS as File System
    participant Clipboard as Clipboard

    User->>GS: Press Alt+S or Alt+O
    GS->>Rust: Shortcut handler triggered
    Rust->>Rust: Get primary monitor info
    Rust->>Selector: Check if selector window exists

    alt Window exists
        Rust->>Selector: emit("set-mode", mode)
        Rust->>Selector: show(), setFocus()
    else Window doesn't exist
        Rust->>Selector: WebviewWindowBuilder::new("selector")
        Rust->>Selector: Set fullscreen, transparent, always_on_top
        Rust->>Selector: build(), show(), setFocus()
    end

    User->>Selector: Mouse down at (x1, y1)
    Selector->>Selector: setStart({x: x1, y: y1})
    User->>Selector: Mouse move to (x2, y2)
    Selector->>Selector: setCurrent({x: x2, y: y2})
    User->>Selector: Mouse up
    Selector->>Selector: Calculate bounding box
    Selector->>Rust: invoke("capture_region", {x, y, width, height, mode})

    Rust->>Rust: Get monitor name and scale factor
    Rust->>Selector: window.hide()
    Rust->>Rust: thread::sleep(150ms)
    Rust->>xcap: Monitor::all()
    xcap-->>Rust: List of monitors
    Rust->>Rust: Find matching monitor by name
    Rust->>xcap: monitor.capture_image()
    xcap-->>Rust: Full monitor image
    Rust->>Image: imageops::crop_imm(image, phys_x, phys_y, phys_w, phys_h)
    Image-->>Rust: Cropped image
    Rust->>FS: cropped.save("~/Desktop/gquick_capture.png")
    FS-->>Rust: Success

    alt mode == "screenshot"
        Rust->>Rust: Command::new("open").arg(path).spawn()
    else mode == "ocr"
        Rust->>Clipboard: clipboard.write_text("Sample OCR Text...")
    end

    Rust->>Selector: window.close()
    Rust-->>Selector: Return path string
```

## Plugin Search Sequence

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Registry as Plugin Registry
    participant AppLauncher as App Launcher Plugin
    participant Calculator as Calculator Plugin
    participant Docker as Docker Plugin
    participant WebSearch as Web Search Plugin
    participant Rust as Rust Backend

    User->>App: Type "docker"
    App->>App: setQuery("docker")
    App->>App: setActiveIndex(0)
    App->>App: setTimeout(fetchItems, 50ms)

    App->>Registry: plugins.map(p => p.getItems("docker"))
    Registry->>AppLauncher: getItems("docker")
    AppLauncher->>AppLauncher: Filter cached apps
    AppLauncher-->>Registry: [] (no matches)

    Registry->>Calculator: getItems("docker")
    Calculator->>Calculator: Test regex /^[-+*/.()0-9\s]+$/
    Calculator-->>Registry: [] (no match)

    Registry->>Docker: getItems("docker")
    Docker->>Rust: invoke("list_containers")
    Rust->>Rust: docker ps -a
    Rust-->>Docker: ContainerInfo[]
    Docker->>Docker: Filter by query
    Docker->>Rust: invoke("list_images")
    Rust->>Rust: docker images
    Rust-->>Docker: ImageInfo[]
    Docker->>Docker: Filter by query
    Docker-->>Registry: SearchResultItem[]

    Registry->>WebSearch: getItems("docker")
    WebSearch-->>Registry: [SearchResultItem] (Google search)

    Registry->>App: Promise.all resolved
    App->>App: setItems(flattenedResults)
    App->>App: Render results list
```

## Chat Message Sequence (Mocked)

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant State as React State

    User->>App: Press ⌘C
    App->>App: setView("chat")
    App->>App: Render chat UI

    User->>App: Type "Hello"
    App->>App: setChatInput("Hello")

    User->>App: Press Enter
    App->>App: handleSendMessage()
    App->>State: Add user message {role: "user", content: "Hello"}
    App->>App: setChatInput("")
    App->>App: Render user bubble
    App->>App: scrollIntoView()

    App->>App: setTimeout(600ms)
    App->>State: Add assistant message {role: "assistant", content: "Mock response..."}
    App->>App: Render assistant bubble
    App->>App: scrollIntoView()
```

## Settings Save Sequence

```mermaid
sequenceDiagram
    actor User
    participant Settings as Settings.tsx
    participant Storage as localStorage
    participant App as App.tsx

    User->>App: Press ⌘,
    App->>App: setView("settings")
    App->>Settings: Render <Settings onClose={...} />

    Settings->>Storage: localStorage.getItem("api-key")
    Storage-->>Settings: "sk-..."
    Settings->>Settings: setApiKey("sk-...")

    Settings->>Storage: localStorage.getItem("api-provider")
    Storage-->>Settings: "openai"
    Settings->>Settings: setApiProvider("openai")

    User->>Settings: Change API key
    Settings->>Settings: setApiKey("new-key")

    User->>Settings: Click "Save Changes"
    Settings->>Storage: localStorage.setItem("api-key", "new-key")
    Settings->>Storage: localStorage.setItem("api-provider", "openai")
    Settings->>Storage: localStorage.setItem("ocr-model", "gpt-4o-mini")
    Settings->>App: onClose()
    App->>App: setView("search")
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
    Builder->>Builder: plugin(clipboard)
    Builder->>GS: plugin(global-shortcut with handler)
    GS->>GS: Define shortcut handler
    Builder->>Builder: setup(|app| { ... })
    Builder->>App: Build app
    App->>GS: Register Alt+Space
    App->>GS: Register Alt+S
    App->>GS: Register Alt+O
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
    else Window is hidden
        Rust->>Window: window.show()
        Rust->>Window: window.set_focus()
    end
```

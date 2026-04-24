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
    participant Tesseract as tesseract crate
    participant Clipboard as Clipboard
    participant App as App.tsx

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
    Selector->>Selector: setCurrent({x: x2, y: 22})
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
    Rust->>Rust: cropped.save("~/Desktop/gquick_capture.png")
    Rust-->>Rust: Success

    alt mode == "screenshot"
        Rust->>Clipboard: clipboard.write_image(cropped)
    else mode == "ocr"
        Rust->>Tesseract: Tesseract::new(data_path, "eng")
        Tesseract-->>Rust: Tesseract instance
        Rust->>Tesseract: set_image(path)
        Tesseract-->>Rust: Image loaded
        Rust->>Tesseract: get_text()
        Tesseract-->>Rust: Extracted text
        Rust->>Clipboard: clipboard.write_text(ocr_text)
        Rust->>App: emit("ocr-complete", preview)
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
    participant FileSearch as File Search Plugin
    participant Calculator as Calculator Plugin
    participant Docker as Docker Plugin
    participant WebSearch as Web Search Plugin
    participant Translate as Translate Plugin
    participant Rust as Rust Backend

    User->>App: Type "docker"
    App->>App: setQuery("docker")
    App->>App: setActiveIndex(0)
    App->>App: setTimeout(fetchItems, 150ms)

    App->>Registry: plugins.map(p => p.getItems("docker"))
    Registry->>AppLauncher: getItems("docker")
    AppLauncher->>AppLauncher: Filter cached apps
    AppLauncher-->>Registry: [] (no matches)

    Registry->>FileSearch: getItems("docker")
    FileSearch->>Rust: invoke("search_files", {query: "docker"})
    Rust->>Rust: Search file index
    Rust-->>FileSearch: FileInfo[]
    FileSearch-->>Registry: SearchResultItem[]

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

    Registry->>Translate: getItems("docker")
    Translate-->>Registry: [] (no translate prefix)

    Registry->>App: Promise.all resolved
    App->>App: setItems(flattenedResults)
    App->>App: sort by score descending
    App->>App: Render results list
```

## Smart File Search Sequence

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
    App->>App: Show "Analyzing files with AI..."

    App->>FS: getItems(query)
    FS->>Rust: invoke("smart_search_files", {query})
    Rust->>Rust: Check cache (5-min TTL)
    alt Cache stale or missing
        Rust->>Rust: build_file_index()
        Rust->>Rust: walkdir home dir, max depth 6
        Rust->>Rust: Skip hidden/system dirs
        Rust->>Rust: Store in FILE_INDEX
    end
    Rust->>Rust: Filter candidates by keywords
    Rust->>Rust: Read metadata (created, modified, size)
    Rust->>Rust: Read text content (up to 100KB)
    Rust->>Rust: parse_time_filter("last week")
    Rust->>Rust: Filter by modification time
    Rust-->>FS: SmartFileInfo[] (up to 100)

    FS->>FS: Format file descriptions for AI
    FS->>AI: POST ranking prompt
    Note over FS,AI: "Given query X and these files, return ranked indices"
    AI-->>FS: [5, 2, 8, 1]
    FS->>FS: Reorder by AI ranking
    FS->>FS: Append unranked files
    FS-->>App: SearchResultItem[]
    App->>App: Render with "Smart" badge
```

## Chat Message Sequence (Real Streaming)

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Stream as streaming.ts
    participant API as AI Provider API

    User->>App: Press ⌘ Left Shift C
    App->>App: setView("chat")
    App->>App: Render chat UI

    User->>App: Type "Hello"
    App->>App: setChatInput("Hello")

    User->>App: Press Enter
    App->>App: handleSendMessage()
    App->>App: Add user message {role: "user", content: "Hello"}
    App->>App: setChatInput("")
    App->>App: Add empty assistant message
    App->>App: setIsLoading(true)

    alt Provider is OpenAI/Kimi
        App->>Stream: streamOpenAI(url, headers, body, callbacks)
    else Provider is Google
        App->>Stream: streamGemini(url, headers, body, callbacks)
    else Provider is Anthropic
        App->>Stream: streamAnthropic(url, headers, body, callbacks)
    end

    Stream->>API: POST with stream=true
    API-->>Stream: SSE response

    loop For each chunk
        Stream->>Stream: readSSEStream(reader)
        Stream->>Stream: Parse data: lines
        Stream->>App: onContent(accumulatedText)
        App->>App: Update assistant message state
        App->>App: Render with MarkdownMessage
        App->>App: scrollIntoView()
    end

    Stream->>App: onDone()
    App->>App: setIsLoading(false)
```

## Chat with Image Attachments Sequence

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant Dialog as open_image_dialog (Rust)
    participant Stream as streaming.ts
    participant API as AI Provider API

    User->>App: Click image attachment button
    App->>Dialog: invoke("open_image_dialog")
    Dialog->>Dialog: Show native file picker
    User->>Dialog: Select images
    Dialog-->>App: ImageAttachment[] {data_url, mime_type, base64}
    App->>App: setAttachedImages(images)

    User->>App: Type "What's in this image?"
    User->>App: Press Enter
    App->>App: handleSendMessage()
    App->>App: Add user message with images
    App->>App: Clear attachedImages

    alt Provider is OpenAI/Kimi
        App->>Stream: streamOpenAI with content array
        Note over App,Stream: content: [{type:"text"}, {type:"image_url", image_url:{url:dataUrl}}]
    else Provider is Google
        App->>Stream: streamGemini with inlineData
        Note over App,Stream: parts: [{text}, {inlineData:{mimeType, data:base64}}]
    else Provider is Anthropic
        App->>Stream: streamAnthropic with image blocks
        Note over App,Stream: content: [{type:"text"}, {type:"image", source:{type:"base64", media_type, data}}]
    end

    Stream->>API: POST with images
    API-->>Stream: SSE response
    Stream->>App: onContent(text)
    App->>App: Update assistant message
```

## Settings Save Sequence

```mermaid
sequenceDiagram
    actor User
    participant Settings as Settings.tsx
    participant Storage as localStorage
    participant Rust as Rust Backend
    participant App as App.tsx

    User->>App: Press ⌘,
    App->>App: setView("settings")
    App->>Settings: Render <Settings onClose={...} />

    Settings->>Storage: localStorage.getItem("main-shortcut")
    Storage-->>Settings: "Alt+Space"
    Settings->>Settings: setMainShortcut("Alt+Space")

    Settings->>Storage: localStorage.getItem("api-key")
    Storage-->>Settings: "sk-..."
    Settings->>Settings: setApiKey("sk-...")

    Settings->>Storage: localStorage.getItem("api-provider")
    Storage-->>Settings: "openai"
    Settings->>Settings: setApiProvider("openai")

    Settings->>Storage: localStorage.getItem("selected-model")
    Storage-->>Settings: "gpt-4o"
    Settings->>Settings: setSelectedModel("gpt-4o")

    User->>Settings: Record new shortcut (Alt+Shift+Space)
    Settings->>Rust: invoke("update_main_shortcut", {shortcut: "Alt+Shift+Space"})
    Rust-->>Settings: Ok
    Settings->>Settings: setMainShortcut("Alt+Shift+Space")

    User->>Settings: Change API key
    Settings->>Settings: setApiKey("new-key")

    User->>Settings: Click Save
    Settings->>Storage: localStorage.setItem("api-key", "new-key")
    Settings->>Storage: localStorage.setItem("api-provider", "openai")
    Settings->>Storage: localStorage.setItem("selected-model", "gpt-4o")
    Settings->>Storage: localStorage.setItem("main-shortcut", "Alt+Shift+Space")
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
    Builder->>Builder: plugin(clipboard-manager)
    Builder->>Builder: plugin(shell)
    Builder->>Builder: plugin(fs)
    Builder->>Builder: plugin(dialog)
    Builder->>Builder: plugin(sql)
    Builder->>GS: plugin(global-shortcut with handler)
    GS->>GS: Define shortcut handler
    Note over GS: Handler checks all 3 shortcuts:<br/>main, screenshot, ocr
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
        Rust->>Window: Calculate centered position
        Rust->>Window: window.set_position(x, y)
        Rust->>Window: window.show()
        Rust->>Window: window.set_focus()
        Rust->>Window: emit("window-shown", ())
    end
```

## Quick Translate Sequence

```mermaid
sequenceDiagram
    actor User
    participant App as App.tsx
    participant QT as quickTranslate.ts
    participant API as AI Provider API

    User->>App: Type "> Guten Morgen"
    App->>App: isQuickTranslateQuery
    App->>App: setIsTranslating(true)
    App->>App: setTimeout(doTranslate, 400ms)

    App->>QT: performQuickTranslate("Guten Morgen")
    QT->>QT: isLikelyGerman
    Note over QT: Checks umlauts and German words
    QT->>QT: targetLang = "English"
    QT->>QT: sourceHint = "German"

    QT->>API: POST /v1/chat/completions
    Note over QT,API: "Translate this text to English..."
    API-->>QT: "Good morning"

    QT-->>App: {result, detectedLang, targetLang}
    App->>App: setIsTranslating(false)
    App->>App: Display result

    User->>App: Press Enter
    App->>App: navigator.clipboard.writeText(result)
    App->>App: Hide window
```

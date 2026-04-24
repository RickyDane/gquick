# Business Flow Diagrams

## Main Application Flow

```mermaid
flowchart TD
    Start([App Launch]) --> Tray[Create System Tray]
    Tray --> Shortcuts[Register Global Shortcuts]
    Shortcuts --> Hidden[Hide Main Window]
    Hidden --> Wait[Wait for User Input]

    Wait -->|Alt+Space| Toggle{Window Visible?}
    Toggle -->|Yes| Hide[Hide Window]
    Toggle -->|No| Show[Show + Focus Window]
    Hide --> Wait
    Show --> Wait

    Wait -->|Alt+S| Screenshot[Open Selector
    Screenshot Mode]
    Wait -->|Alt+O| OCR[Open Selector
    OCR Mode]

    Screenshot --> Select[User Selects Region]
    OCR --> Select
    Select --> Capture[Capture Screen]
    Capture --> Mode{Mode?}
    Mode -->|screenshot| CopyImg[Copy Image
    to Clipboard]
    Mode -->|ocr| Tesseract[Tesseract OCR
    Copy Text to Clipboard]
    CopyImg --> Wait
    Tesseract --> Wait

    Wait -->|Tray Click| Toggle
    Wait -->|Quit| Exit([Exit App])
```

## Search Flow

```mermaid
flowchart LR
    Start([User Types]) --> Debounce[Debounce 150ms]
    Debounce --> Parallel[Query All Plugins]

    Parallel --> AppLauncher[App Launcher]
    Parallel --> FileSearch[File Search]
    Parallel --> Calculator[Calculator]
    Parallel --> Docker[Docker]
    Parallel --> WebSearch[Web Search]
    Parallel --> Translate[Translate]

    AppLauncher --> Filter1{Matches?}
    FileSearch --> Filter2{Smart Query?}
    Calculator --> Filter3{Valid Math?}
    Docker --> Filter4{Matches?}
    WebSearch --> Filter5{Always}
    Translate --> Filter6{Prefix Match?}

    Filter1 -->|Yes| Results1[App Results]
    Filter1 -->|No| Empty1[Skip]
    Filter2 -->|Yes| Results2[Smart File Results
    + AI Ranking]
    Filter2 -->|No| Results2b[Fast File Results]
    Filter3 -->|Yes| Results3[Calc Result]
    Filter3 -->|No| Empty2[Skip]
    Filter4 -->|Yes| Results4[Docker Results]
    Filter4 -->|No| Empty3[Skip]
    Filter5 --> Results5[Search Link]
    Filter6 -->|Yes| Results6[Translate UI]
    Filter6 -->|No| Empty4[Skip]

    Results1 --> Flatten[Flatten + Sort by Score]
    Results2 --> Flatten
    Results2b --> Flatten
    Results3 --> Flatten
    Results4 --> Flatten
    Results5 --> Flatten
    Results6 --> Flatten

    Flatten --> Render[Render List]
    Render --> Navigate[Arrow Keys Navigate]
    Navigate --> Enter[Enter to Select]
    Enter --> Action[Execute onSelect]
```

## Chat Flow (Real AI Streaming)

```mermaid
flowchart TD
    Start([Enter Chat]) --> View[Switch to Chat View]
    View --> Input[User Types Message]
    Input --> Attach{Attach Images?}
    Attach -->|Paste/File Dialog| AddImg[Add up to 5 Images]
    Attach -->|No| Send[Press Enter]
    AddImg --> Send
    Send --> AddUser[Add User Message
to State]
    AddUser --> Render1[Render User Bubble
    + Images]
    Render1 --> Stream[Call Streaming API
    SSE]
    Stream -->|OpenAI/Kimi| OpenAI[streamOpenAI]
    Stream -->|Google| Gemini[streamGemini]
    Stream -->|Anthropic| Claude[streamAnthropic]
    OpenAI --> Chunk[Receive Chunk]
    Gemini --> Chunk
    Claude --> Chunk
    Chunk --> Update[Update Assistant
    Message State]
    Update --> Render2[Render Assistant Bubble
    MarkdownMessage]
    Render2 --> More{More Chunks?}
    More -->|Yes| Chunk
    More -->|No| Done[Stream Done]
    Done --> MoreMsg{More Messages?}
    MoreMsg -->|Yes| Input
    MoreMsg -->|No| End([End])
```

## Quick Translate Flow

```mermaid
flowchart TD
    Start([Type Query]) --> Prefix{Quick Prefix?}
    Prefix -->|t: / tr: / >| Debounce[Debounce 400ms]
    Prefix -->|No| Normal[Normal Search Flow]
    Debounce --> Detect[Detect Language]
    Detect --> API[Call AI API
    Translation Prompt]
    API --> Result[Display Single Result]
    Result --> Enter[Press Enter]
    Enter --> Copy[Copy to Clipboard]
    Copy --> Hide[Hide Window]
    Normal --> NormalEnd[Continue Search]
```

## Settings Configuration Flow

```mermaid
flowchart TD
    Start([Open Settings]) --> Load[Load from localStorage]
    Load --> Render[Render Form]

    Render --> Shortcuts[Shortcuts Section]
    Shortcuts --> Record[Record Shortcut
    ShortcutRecorder]
    Record --> Sync[Sync with Rust Backend]
    Sync --> Render

    Render --> APIKey[API Key Section]
    APIKey --> SelectProvider[Select Provider]
    SelectProvider --> Fetch[Fetch Models from API
    500ms debounce]
    Fetch --> Cache[Cache Models 24h]
    Cache --> Render
    APIKey --> EnterKey[Enter API Key]
    EnterKey --> Render
    APIKey --> ToggleVisibility[Toggle Show/Hide]
    ToggleVisibility --> Render

    Render --> Model[Model Selection]
    Model --> SelectModel[Select Model]
    SelectModel --> Render

    Render --> Save[Click Save]
    Save --> Persist[Save to localStorage]
    Persist --> Close[Close Settings]
    Close --> End([Return to Search])
```

## Region Selection Flow

```mermaid
flowchart TD
    Start([Trigger Alt+S/O]) --> Create[Create/Show Selector Window]
    Create --> Fullscreen[Fullscreen Transparent Overlay]
    Fullscreen --> Wait[Wait for Mouse Input]

    Wait -->|Mouse Down| StartDrag[Record Start Position]
    StartDrag --> Dragging[Mouse Move]
    Dragging --> Update[Update Current Position]
    Update --> Draw[Draw Selection Rectangle]
    Draw --> Dragging

    Dragging -->|Mouse Up| EndDrag[Calculate Bounds]
    EndDrag --> Valid{Width > 2 &&
    Height > 2?}
    Valid -->|Yes| Capture[Invoke capture_region]
    Valid -->|No| Reset[Reset Selection]
    Reset --> Wait

    Capture --> Rust[Rust Backend Processes]
    Rust --> Hide[Hide Selector]
    Hide --> Delay[Wait 150ms]
    Delay --> ScreenCap[Capture Screen
    xcap]
    ScreenCap --> Crop[Crop Region
    image crate]
    Crop --> Save[Save to Desktop]

    Save --> Mode{Mode?}
    Mode -->|screenshot| CopyImg[Copy Image
    to Clipboard]
    Mode -->|ocr| Tesseract[Tesseract OCR]
    Tesseract --> CopyText[Copy Text
    to Clipboard]
    Tesseract --> Emit[Emit ocr-complete]

    CopyImg --> Close[Close Selector]
    CopyText --> Close
    Close --> End([Done])

    Wait -->|Escape| Cancel[Close Selector]
    Cancel --> End
```

## Docker Management Flow (Target)

```mermaid
flowchart TD
    Start([Docker entry]) --> Entry{Entry point?}
    Entry -->|Search query| Plugin[src/plugins/docker.tsx]
    Entry -->|Cmd/Ctrl + Left Shift + D| Page[DockerPage dedicated view]

    Plugin --> Hub[Docker Hub public API search]
    Plugin --> Local[invoke docker_status/list]
    Page --> Local

    Local --> Status{CLI + daemon OK?}
    Status -->|CLI missing| CliErr[Show install Docker CLI error]
    Status -->|Daemon down| DaemonErr[Show start Docker daemon error]
    Status -->|OK| Commands[Run typed Tauri Docker commands]

    Hub --> ResultActions[Search result action menu]
    Commands --> Manage[Images/containers/compose/logs/inspect]

    ResultActions --> Pull[pull_image]
    ResultActions --> Run[run_container options]
    Manage --> Logs[container_logs]
    Manage --> Exec[exec_container shell]
    Manage --> Inspect[inspect_docker]
    Manage --> Prune[prune_docker]
    Manage --> Compose[compose_read/write/action]

    Pull --> Risk{Risky?}
    Run --> Risk
    Exec --> Risk
    Prune --> Risk
    Compose --> Risk
    Risk -->|Yes| Confirm[Frontend confirmation modal]
    Risk -->|No| Invoke[Tauri invoke]
    Confirm --> Invoke
    Invoke --> DockerCLI[Docker CLI / docker compose]
    DockerCLI --> Refresh[Refresh Docker page/search data]
```

## Smart File Search Flow

```mermaid
flowchart TD
    Start([Type Smart Query]) --> Detect{Contains Keywords?}
    Detect -->|Yes| Smart[Call smart_search_files]
    Detect -->|No| Fast[Call search_files]

    Fast --> Index1[Use Cached File Index]
    Index1 --> Score1[Keyword Scoring]
    Score1 --> Top50[Return Top 50]
    Top50 --> RenderFast[Render Results]

    Smart --> Index2[Build/Refresh File Index]
    Index2 --> Metadata[Read Metadata
    created/modified/size]
    Metadata --> Content[Read Text Content
    up to 100KB]
    Content --> Filter[Apply Time Filters
    if specified]
    Filter --> Candidates[Return up to 100 Candidates]
    Candidates --> AI[Call AI API
    Rank by Relevance]
    AI --> Reorder[Reorder by AI Ranking]
    Reorder --> RenderSmart[Render with "Smart" Badge]
```

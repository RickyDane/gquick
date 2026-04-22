# Data Models and Schemas

## Frontend Types

### Plugin Types (`src/plugins/types.ts`)

```typescript
interface PluginAction {
  id: string;
  label: string;
  shortcut?: string;
  onRun: () => void;
}

interface PluginMetadata {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  keywords: string[];
}

interface SearchResultItem {
  id: string;
  pluginId: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon | string | React.ReactNode;
  onSelect: () => void;
  actions?: PluginAction[];
  renderPreview?: () => React.ReactNode;
}

interface GQuickPlugin {
  metadata: PluginMetadata;
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
```

### Chat Message Type (`src/App.tsx`)

```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}
```

## Backend Types (Rust)

### App Info (`src-tauri/src/lib.rs`)

```rust
#[derive(serde::Serialize)]
struct AppInfo {
    name: String,
    path: String,
    icon: Option<String>,
}
```

### Docker Types (`src-tauri/src/lib.rs`)

```rust
#[derive(serde::Serialize)]
struct ContainerInfo {
    id: String,
    image: String,
    status: String,
    names: String,
}

#[derive(serde::Serialize)]
struct ImageInfo {
    id: String,
    repository: String,
    tag: String,
    size: String,
    created_since: String,
}
```

## localStorage Schema

| Key | Type | Description |
|-----|------|-------------|
| `api-key` | `string` | Raw API key for AI provider |
| `api-provider` | `string` | Provider ID: `"openai"`, `"google"`, `"kimi"`, `"anthropic"` |
| `ocr-model` | `string` | Model ID: `"gpt-4o-mini"`, `"gpt-4o"`, `"gemini-2.0-flash"`, `"claude-3-5-sonnet"` |
| `auth-provider` | `string \| null` | Connected OAuth provider ID |

## Data Flow Diagrams

### Search Data Flow

```mermaid
flowchart LR
    Input[User Input] --> Debounce[50ms Debounce]
    Debounce --> Parallel[Parallel Plugin Queries]
    Parallel --> P1[App Launcher]
    Parallel --> P2[Calculator]
    Parallel --> P3[Docker]
    Parallel --> P4[Web Search]
    P1 --> Flatten[Flatten Results]
    P2 --> Flatten
    P3 --> Flatten
    P4 --> Flatten
    Flatten --> Render[Render List]
    Render --> Nav[Keyboard Navigation]
```

### Settings Persistence Flow

```mermaid
flowchart LR
    UI[Settings UI] --> State[React State]
    State --> Save[Save Button]
    Save --> localStorage[(localStorage)]
    localStorage --> Load[Component Mount]
    Load --> State
```

### Screen Capture Data Flow

```mermaid
flowchart LR
    Shortcut[Alt+S/O] --> Create[Create Selector Window]
    Create --> Drag[User Drag]
    Drag --> Coords[Coordinates]
    Coords --> Rust[Rust Backend]
    Rust --> Hide[Hide Window]
    Hide --> Delay[150ms Delay]
    Delay --> Capture[xcap Capture]
    Capture --> Crop[image Crop]
    Crop --> Save[Save to Desktop]
    Save --> Mode{Mode?}
    Mode -->|screenshot| Open[Open Image]
    Mode -->|ocr| Mock[Mock OCR Text]
    Mock --> Clipboard[Write Clipboard]
```

## File System Data

### Screenshot Save Path

```
macOS: ~/Desktop/gquick_capture.png
Other: ./gquick_capture.png (current directory)
```

### App Discovery Paths (macOS)

```
/Applications
/System/Applications
```

## SQLite Database

The app initializes `tauri-plugin-sql` with SQLite support, but **no tables or queries are defined yet**. The database connection is available but unused.

Potential future tables:
- `chat_history` — persisted chat messages
- `settings` — encrypted settings storage (replacement for localStorage)
- `app_usage` — usage analytics for better ranking

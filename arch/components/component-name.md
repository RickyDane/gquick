# Component Documentation

## App.tsx

**File**: `src/App.tsx`
**Type**: React Component (Main Window)

### Responsibilities
- Renders the main launcher interface
- Manages three views: `search`, `chat`, `settings`
- Handles keyboard navigation (arrow keys, Enter, Escape)
- Integrates with plugin system for search results
- Manages chat message state (mocked AI)
- Renders actions overlay (⌘K)

### State
| State | Type | Description |
|-------|------|-------------|
| `query` | `string` | Current search input |
| `activeIndex` | `number` | Currently highlighted result |
| `view` | `"search" \| "chat" \| "settings"` | Current view mode |
| `showActions` | `boolean` | Actions overlay visibility |
| `items` | `SearchResultItem[]` | Flattened plugin results |
| `messages` | `Message[]` | Chat message history |
| `chatInput` | `string` | Chat input field value |

### Key Behaviors
- Debounces plugin queries at 50ms
- Auto-focuses input when not in settings
- Auto-scrolls chat to bottom on new messages
- Hides window on Escape when in search view

---

## Selector.tsx

**File**: `src/Selector.tsx`
**Type**: React Component (Selector Window)

### Responsibilities
- Renders fullscreen transparent overlay for region selection
- Handles mouse drag to define capture region
- Sends coordinates to Rust `capture_region` command
- Displays mode-specific instructions

### State
| State | Type | Description |
|-------|------|-------------|
| `start` | `{x, y} \| null` | Mouse down position |
| `current` | `{x, y} \| null` | Current mouse position |
| `mode` | `string` | `"screenshot"` or `"ocr"` |
| `isCapturing` | `boolean` | Prevents duplicate captures |

### Key Behaviors
- Listens for `set-mode` Tauri event for window reuse
- Closes on Escape
- Calculates bounding box from drag coordinates
- Invokes `capture_region` with x, y, width, height, mode

---

## Settings.tsx

**File**: `src/Settings.tsx`
**Type**: React Component

### Responsibilities
- Renders AI provider configuration UI
- Manages OAuth connection state (visual only)
- Manages API key input and visibility toggle
- Manages OCR model selection
- Persists settings to localStorage

### Settings Stored
| Key | localStorage Key | Description |
|-----|-----------------|-------------|
| API Key | `api-key` | Raw API key string |
| API Provider | `api-provider` | Selected provider ID |
| OCR Model | `ocr-model` | Selected vision model |
| Auth Provider | `auth-provider` | Connected OAuth provider |

### Supported Providers
- **OAuth UI**: Google AI, OpenAI, Kimi/Moonshot
- **API Key**: OpenAI, Google Gemini, Kimi/Moonshot, Anthropic Claude
- **OCR Models**: GPT-4o mini, GPT-4o, Gemini 2.0 Flash, Claude 3.5 Sonnet

---

## main.tsx

**File**: `src/main.tsx`
**Type**: React Entry Point

### Responsibilities
- Determines which component to render based on Tauri window label
- `label === "selector"` → renders `<Selector />`
- Otherwise → renders `<App />`
- Waits for window label to be available before rendering

---

## Plugin System

### types.ts

Defines the plugin contract:

```typescript
interface GQuickPlugin {
  metadata: PluginMetadata;
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
```

### appLauncher.tsx

- Scans `/Applications` and `/System/Applications`
- Caches results in memory (`appsCache`)
- Filters by app name containing query
- Invokes `open_app` command on selection

### calculator.tsx

- Validates input against `/^[-+*/.()0-9\s]+$/`
- Uses `new Function()` to evaluate expression
- Copies result to clipboard on selection

### docker.tsx

- Invokes `list_containers` and `list_images` commands
- Filters containers/images by query
- Provides actions: Start/Stop/Restart containers, Delete images
- Limits to 5 results per category

### webSearch.tsx

- Always returns single Google search result
- Uses `@tauri-apps/plugin-opener` to open browser
- Encodes query in URL

## Component Relationships

```mermaid
graph TB
    main[main.tsx] -->|label == "selector"| Selector
    main -->|otherwise| App
    App --> Settings
    App --> PluginSystem[Plugin System]
    PluginSystem --> AppLauncher
    PluginSystem --> Calculator
    PluginSystem --> Docker
    PluginSystem --> WebSearch
    App --> ChatUI[Chat UI]
    Selector -->|invoke| capture_region
    Settings --> localStorage
```

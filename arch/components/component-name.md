# Component Documentation

## App.tsx

**File**: `src/App.tsx`
**Type**: React Component (Main Window)
**Size**: ~950 lines

### Responsibilities
- Renders the main launcher interface
- Manages four views: `search`, `chat`, `settings`, `actions`
- Handles keyboard navigation (arrow keys, Enter, Escape, global shortcuts)
- Integrates with plugin system for search results
- Manages AI chat with real streaming SSE calls to OpenAI, Gemini, Kimi, Anthropic
- Supports image attachments in chat (paste, file dialog, up to 5 images)
- Handles quick translate prefixes (`t:`, `tr:`, `>`) with loading states
- Listens to `window-hidden` Tauri event to reset state

### State
| State | Type | Description |
|-------|------|-------------|
| `query` | `string` | Current search input |
| `activeIndex` | `number` | Currently highlighted result |
| `view` | `"search" \| "chat" \| "settings" \| "actions"` | Current view mode |
| `activeActionIndex` | `number` | Highlighted action in actions view |
| `items` | `SearchResultItem[]` | Flattened plugin results |
| `messages` | `Message[]` | Chat message history (with optional images) |
| `chatInput` | `string` | Chat input field value |
| `selectedModel` | `string` | Currently selected AI model |
| `isLoading` | `boolean` | Chat streaming in progress |
| `isSearching` | `boolean` | Search query in progress |
| `isTranslating` | `boolean` | Quick translate API call in progress |
| `attachedImages` | `ChatImage[]` | Images attached to next chat message |

### Key Behaviors
- Debounces plugin queries at 150ms
- Debounces quick translate at 400ms
- Auto-focuses input when not in settings/actions
- Auto-scrolls chat to bottom on new messages
- Hides window on Escape when in search view
- Syncs saved shortcuts with Rust backend on mount
- Processes pasted image files in chat view
- Resets all state when window is hidden

---

## Selector.tsx

**File**: `src/Selector.tsx`
**Type**: React Component (Selector Window)

### Responsibilities
- Renders fullscreen transparent overlay for region selection
- Handles mouse drag to define capture region
- Sends coordinates to Rust `capture_region` command
- Displays mode-specific instructions (screenshot vs OCR)
- Listens for `set-mode` Tauri event for window reuse

### State
| State | Type | Description |
|-------|------|-------------|
| `start` | `{x, y} \| null` | Mouse down position |
| `current` | `{x, y} \| null` | Current mouse position |
| `mode` | `string` | `"screenshot"` or `"ocr"` |
| `isCapturing` | `boolean` | Prevents duplicate captures |

### Key Behaviors
- Focuses window natively and in DOM on mount
- Gets initial mode from URL query params
- Closes on Escape via `close_selector` Rust command
- Uses `flushSync` to hide selection div before capture
- Waits 100ms for browser paint before invoking capture

---

## Settings.tsx

**File**: `src/Settings.tsx`
**Type**: React Component

### Responsibilities
- Renders AI provider configuration UI with live model fetching
- Manages API key input and visibility toggle
- Provides provider selection (OpenAI, Google, Kimi, Anthropic)
- Fetches and caches model lists from APIs (24h cache)
- Records and updates global shortcuts via `ShortcutRecorder`
- Persists settings to localStorage

### Settings Stored
| Key | localStorage Key | Description |
|-----|-----------------|-------------|
| API Key | `api-key` | Raw API key string |
| API Provider | `api-provider` | Selected provider ID |
| Selected Model | `selected-model` | Active model ID |
| Main Shortcut | `main-shortcut` | Global launcher shortcut |
| Screenshot Shortcut | `screenshot-shortcut` | Screenshot shortcut |
| OCR Shortcut | `ocr-shortcut` | OCR shortcut |

### Supported Providers
- **API Key**: OpenAI, Google Gemini, Kimi/Moonshot, Anthropic Claude
- **Model Fetching**: Live API calls to fetch available models (cached 24h)

---

## main.tsx

**File**: `src/main.tsx`
**Type**: React Entry Point

### Responsibilities
- Determines which component to render based on Tauri window label
- `label === "selector"` → renders `<Selector />`
- Otherwise → renders `<App />`
- Uses `getCurrentWindow().label` for routing

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

- Cross-platform app discovery (macOS `.app`, Windows `.lnk`, Linux `.desktop`)
- Caches results in memory (`appsCache`)
- Filters by app name containing query
- Invokes `open_app` command on selection
- Scores exact starts higher than partial matches

### fileSearch.tsx

- **Fast mode**: Calls `search_files` Rust command for filename search
- **Smart mode**: Detects natural language queries, calls `smart_search_files`
- AI ranking: Sends file descriptions to AI API for relevance ranking
- Reads file metadata, content previews, supports time filters
- Displays "Smart" badge for AI-ranked results

### calculator.tsx

- Validates input against `/^[-+*/.()0-9\s]+$/`
- Uses `new Function()` to evaluate expression
- Copies result to clipboard on selection

### docker.tsx

- Invokes `list_containers` and `list_images` commands
- Filters containers/images by query
- Provides inline actions: Start/Stop/Restart containers, Delete images
- Limits to 5 results per category
- Renders action buttons in preview area

### webSearch.tsx

- Always returns single Google search result
- Uses `@tauri-apps/plugin-opener` to open browser
- Encodes query in URL

### translate.tsx

- **Quick translate**: Handled in App.tsx for `t:`, `tr:`, `>` prefixes
- **Full translate UI**: Language selection (source/target), text input, AI translation
- Supports 12 languages including auto-detect
- Uses real AI API calls with all configured providers
- Renders inline preview panel when triggered via `translate:` or `/translate`

## Component Relationships

```mermaid
graph TB
    main[main.tsx] -->|label == "selector"| Selector
    main -->|otherwise| App
    App --> Settings
    App --> PluginSystem[Plugin System]
    PluginSystem --> AppLauncher
    PluginSystem --> FileSearch
    PluginSystem --> Calculator
    PluginSystem --> Docker
    PluginSystem --> WebSearch
    PluginSystem --> Translate
    App --> ChatUI[Chat UI]
    App --> MarkdownMsg[MarkdownMessage]
    App --> Tooltip
    Settings --> ShortcutRecorder
    Selector -->|invoke| capture_region
    Selector -->|invoke| close_selector
    Settings --> localStorage
    App -->|invoke| update_main_shortcut
    App -->|invoke| update_screenshot_shortcut
    App -->|invoke| update_ocr_shortcut
    FileSearch -->|invoke| search_files
    FileSearch -->|invoke| smart_search_files
    FileSearch -->|invoke| open_file
    App -->|listen| window-hidden
```

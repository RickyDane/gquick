# API Contracts and Endpoints

## Tauri Commands (Rust → Frontend)

All commands are defined in `src-tauri/src/lib.rs` and invoked from the frontend via `@tauri-apps/api/core`.

### `greet`

**Status**: Demo/Unused

```rust
#[tauri::command]
fn greet(name: &str) -> String
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Name to greet |

**Returns**: `string` — Greeting message

---

### `list_apps`

**Status**: Active

```rust
#[tauri::command]
fn list_apps() -> Vec<AppInfo>
```

**Returns**: `AppInfo[]`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Application name |
| `path` | `string` | Full path to app bundle or executable |
| `icon` | `string \| null` | Icon path (always null currently) |

**Platform Support**:
- **macOS**: Scans `/Applications`, `/System/Applications` for `.app`
- **Windows**: Scans Start Menu paths for `.lnk`
- **Linux**: Scans `/usr/share/applications`, desktop dirs for `.desktop`

---

### `open_app`

**Status**: Active

```rust
#[tauri::command]
fn open_app(path: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to app bundle or executable |

**Returns**: `Result<void, string>` — Error message on failure

**Platform**: macOS (`open`), Windows (`cmd /C start`), Linux (`xdg-open`)

---

### `search_files`

**Status**: Active

```rust
#[tauri::command]
fn search_files(query: String) -> Result<Vec<FileInfo>, String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Search query string |

**Returns**: `Result<FileInfo[], string>`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | File or folder name |
| `path` | `string` | Full path |
| `is_dir` | `boolean` | Whether it's a directory |

**Behavior**: Keyword-based scoring, returns top 50 results. Uses cached file index (5-min TTL).

---

### `smart_search_files`

**Status**: Active

```rust
#[tauri::command]
fn smart_search_files(query: String) -> Result<Vec<SmartFileInfo>, String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | `string` | Natural language query |

**Returns**: `Result<SmartFileInfo[], string>`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | File or folder name |
| `path` | `string` | Full path |
| `is_dir` | `boolean` | Whether it's a directory |
| `created` | `string \| null` | ISO 8601 creation time |
| `modified` | `string \| null` | ISO 8601 modification time |
| `size` | `number` | File size in bytes |
| `content_preview` | `string \| null` | Flattened content preview (up to 3000 chars) |
| `full_content` | `string \| null` | Full text content (up to 100KB) |

**Behavior**: Reads file metadata, text content previews, supports time filtering (`today`, `last week`, etc.). Returns up to 100 candidates.

---

### `open_file`

**Status**: Active

```rust
#[tauri::command]
fn open_file(app: tauri::AppHandle, path: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | File path to open |

**Returns**: `Result<void, string>`

**Behavior**: Opens file with default application via `tauri-plugin-opener`.

---

### `list_containers`

**Status**: Active

```rust
#[tauri::command]
fn list_containers() -> Result<Vec<ContainerInfo>, String>
```

**Returns**: `ContainerInfo[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Container ID |
| `image` | `string` | Docker image name |
| `status` | `string` | Container status (e.g., "Up 2 hours") |
| `names` | `string` | Container name |

**Command executed**: `docker ps -a --format "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}"`

---

### `list_images`

**Status**: Active

```rust
#[tauri::command]
fn list_images() -> Result<Vec<ImageInfo>, String>
```

**Returns**: `ImageInfo[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Image ID |
| `repository` | `string` | Image repository |
| `tag` | `string` | Image tag |
| `size` | `string` | Image size |
| `created_since` | `string` | Creation timestamp |

**Command executed**: `docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedAt}}"`

---

### `manage_container`

**Status**: Active

```rust
#[tauri::command]
fn manage_container(id: String, action: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Container ID |
| `action` | `string` | Action: `"start"`, `"stop"`, `"restart"` |

**Returns**: `Result<void, string>`

**Command executed**: `docker {action} {id}`

---

### `delete_image`

**Status**: Active

```rust
#[tauri::command]
fn delete_image(id: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Image ID |

**Returns**: `Result<void, string>`

**Command executed**: `docker rmi -f {id}`

---

### `capture_region`

**Status**: Active

```rust
#[tauri::command]
fn capture_region(
    window: tauri::Window,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    mode: String
) -> Result<String, String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Region left coordinate (logical) |
| `y` | `number` | Region top coordinate (logical) |
| `width` | `number` | Region width (logical) |
| `height` | `number` | Region height (logical) |
| `mode` | `string` | `"screenshot"` or `"ocr"` |

**Returns**: `Result<string, string>` — File path on success, error message on failure

**Behavior**:
1. Gets monitor info and scale factor
2. Hides the selector window
3. Waits 150ms for screen to clear
4. Captures full monitor image via `xcap`
5. Converts logical to physical coordinates
6. Crops the image
7. Saves to `~/Desktop/gquick_capture.png`
8. If `mode == "screenshot"`: copies image to clipboard
9. If `mode == "ocr"`: runs Tesseract OCR, copies text to clipboard, emits `ocr-complete`
10. Closes the selector window

---

### `update_main_shortcut`

**Status**: Active

```rust
#[tauri::command]
fn update_main_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `shortcut` | `string` | Shortcut string (e.g., `"Alt+Space"`) |

**Returns**: `Result<void, string>`

**Behavior**: Parses shortcut, registers new global shortcut, unregisters old one.

---

### `update_screenshot_shortcut`

**Status**: Active

```rust
#[tauri::command]
fn update_screenshot_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String>
```

Same behavior as `update_main_shortcut` but for screenshot shortcut.

---

### `update_ocr_shortcut`

**Status**: Active

```rust
#[tauri::command]
fn update_ocr_shortcut(app: tauri::AppHandle, shortcut: String) -> Result<(), String>
```

Same behavior as `update_main_shortcut` but for OCR shortcut.

---

### `open_image_dialog`

**Status**: Active

```rust
#[tauri::command]
async fn open_image_dialog(
    app: tauri::AppHandle,
    state: tauri::State<'_, DialogState>
) -> Result<Vec<ImageAttachment>, String>
```

**Returns**: `ImageAttachment[]`

| Field | Type | Description |
|-------|------|-------------|
| `data_url` | `string` | Data URL for image display |
| `mime_type` | `string` | Image MIME type |
| `base64` | `string` | Base64-encoded image data |

**Behavior**: Opens native multi-file picker for images (png, jpg, jpeg, webp, gif). Skips files > 5MB. Returns base64-encoded images for chat attachment.

---

### `close_selector`

**Status**: Active

```rust
#[tauri::command]
fn close_selector(window: tauri::Window)
```

**Behavior**: Closes the selector window. Used by Selector.tsx on Escape key.

---

## Tauri Events (Backend → Frontend)

### `set-mode`

**Direction**: Rust → Selector window

```typescript
listen<string>("set-mode", (event) => {
  // event.payload is "screenshot" or "ocr"
});
```

**Purpose**: When the selector window is reused (already exists), the backend emits this event to update the mode without recreating the window.

**Sent from**: `lib.rs` global shortcut handler

---

### `window-hidden`

**Direction**: Rust → Main window

```typescript
listen("window-hidden", () => {
  // Reset search/chat state
});
```

**Purpose**: Emitted when the main window is hidden (blur, Escape, close requested). App.tsx listens to reset state.

**Sent from**: `lib.rs` window event handler and `toggle_window`

---

### `window-shown`

**Direction**: Rust → Main window

```typescript
listen("window-shown", () => {
  // Window is now visible
});
```

**Purpose**: Emitted when the main window is shown.

---

### `ocr-complete`

**Direction**: Rust → Main window

```typescript
listen<string>("ocr-complete", (event) => {
  // event.payload is first 100 chars of OCR text
});
```

**Purpose**: Emitted after OCR text is extracted and copied to clipboard.

---

## External AI APIs (Implemented)

All AI features make real HTTP calls. No mocking.

### OpenAI / Kimi

| Endpoint | Method | Headers |
|----------|--------|---------|
| `https://api.openai.com/v1/chat/completions` | POST | `Authorization: Bearer {apiKey}`, `Content-Type: application/json` |
| `https://api.moonshot.ai/v1/chat/completions` | POST | Same as OpenAI |

**Body**:
```json
{
  "model": "gpt-4o",
  "messages": [...],
  "stream": true
}
```

### Google Gemini

| Endpoint | Method | Headers |
|----------|--------|---------|
| `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}&alt=sse` | POST | `Content-Type: application/json` |

### Anthropic Claude

| Endpoint | Method | Headers |
|----------|--------|---------|
| `https://api.anthropic.com/v1/messages` | POST | `x-api-key: {apiKey}`, `anthropic-version: 2023-06-01`, `Content-Type: application/json` |

**Body**:
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 4096,
  "messages": [...],
  "stream": true
}
```

---

## Plugin API Contract

Each plugin must implement:

```typescript
interface GQuickPlugin {
  metadata: {
    id: string;        // Unique plugin identifier
    title: string;     // Display name
    subtitle?: string; // Optional description
    icon: LucideIcon;  // Icon component
    keywords: string[]; // Search keywords
  };
  getItems: (query: string) => Promise<SearchResultItem[]>;
}
```

Each result item:

```typescript
interface SearchResultItem {
  id: string;           // Unique item ID
  pluginId: string;     // Parent plugin ID
  title: string;        // Primary display text
  subtitle?: string;    // Secondary display text
  icon: LucideIcon | string | React.ReactNode;
  onSelect: () => void; // Action on selection
  actions?: PluginAction[]; // Additional actions
  renderPreview?: () => React.ReactNode; // Inline preview panel
  score?: number;       // Higher = more relevant
}
```

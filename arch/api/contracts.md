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
| `path` | `string` | Full path to .app bundle |
| `icon` | `string \| null` | Icon path (always null currently) |

**Platform**: macOS only (scans `/Applications`, `/System/Applications`)

---

### `open_app`

**Status**: Active

```rust
#[tauri::command]
fn open_app(path: String) -> Result<(), String>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to .app bundle |

**Returns**: `Result<void, string>` — Error message on failure

**Platform**: macOS (`open`), Windows (`cmd /C start`), Linux (`xdg-open`)

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

**Status**: Active (OCR is mocked)

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
8. If `mode == "screenshot"`: opens image with system viewer
9. If `mode == "ocr"`: writes mock text to clipboard
10. Closes the selector window

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

**Sent from**: `lib.rs:279`

---

## External APIs (Not Yet Implemented)

### Planned AI Provider APIs

The Settings UI references these providers but no actual API integration exists:

| Provider | Base URL (typical) | Auth Method |
|----------|-------------------|-------------|
| OpenAI | `https://api.openai.com/v1` | API Key (Bearer) |
| Google Gemini | `https://generativelanguage.googleapis.com` | API Key (query param) |
| Anthropic Claude | `https://api.anthropic.com/v1` | API Key (x-api-key header) |
| Kimi/Moonshot | `https://api.moonshot.cn/v1` | API Key (Bearer) |

### Planned OAuth Flows

No OAuth implementation exists. The UI shows "Connect" buttons that only toggle local state.

Typical OAuth 2.0 flow would be:
1. User clicks "Connect" for provider
2. App opens browser to provider's OAuth authorization URL
3. User authenticates and authorizes
4. Provider redirects to app with authorization code
5. App exchanges code for access token
6. Token stored securely (keychain/secure storage)

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
}
```

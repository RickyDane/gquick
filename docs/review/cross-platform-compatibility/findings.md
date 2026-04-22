# Code Review Findings: Cross-Platform Compatibility

## [CP-001] `Alt+Space` conflicts with Windows system shortcut

**Severity:** Critical
**Location:** `src-tauri/src/lib.rs:1087`

### Description
The default shortcut on non-Windows platforms is `Alt+Space`. On Windows, this opens the system menu for the active window. While the Windows default is `Alt+Shift+Space`, the `#[cfg(not(target_os = "windows"))]` fallback includes Linux where `Alt+Space` is also commonly bound by window managers (e.g., GNOME, KDE) for window operations.

### Evidence
```rust
#[cfg(not(target_os = "windows"))]
let default_shortcut = "Alt+Space".to_string();
```

### Impact
On Linux with certain window managers, the global shortcut may fail to register or conflict with existing system shortcuts, preventing the app from opening.

### Recommendation
Use `Alt+Shift+Space` as the universal default, or add Linux-specific detection to choose a safer shortcut.

---

## [CP-002] `parse_shortcut` does not validate empty modifier strings

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:858-938`

### Description
`parse_shortcut` accepts strings like `"Space"` (no modifiers) because it only checks `parts.len() < 2`. A single-part shortcut would set `mods = Modifiers::empty()` and register a bare key, which is almost never what the user wants and could cause accidental triggers.

### Evidence
```rust
let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
if parts.len() < 2 {
    return Err("Invalid shortcut format".into());
}
```

### Impact
Users could accidentally set a shortcut with no modifiers, causing the window to toggle on every keypress of that key.

### Recommendation
Require at least one modifier (Alt, Ctrl, Shift, Super) for all shortcuts.

---

## [CP-003] `open_file` and `open_app` use `spawn()` without waiting, potential zombie processes

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:510-533`, `833-856`

### Description
Both `open_file` and `open_app` call `.spawn()` and immediately return `Ok(())`. The child processes are never reaped. On Unix systems, this creates zombie processes. On Windows, handles may leak.

### Evidence
```rust
std::process::Command::new("open")
    .arg(&path)
    .spawn()
    .map_err(|e| e.to_string())?;
```

### Impact
Resource leaks over long-running sessions. Potential for zombie process accumulation.

### Recommendation
Use `tauri_plugin_opener` (already a dependency!) instead of raw `std::process::Command`. It handles cross-platform opening correctly and avoids process reaping issues.

---

## [CP-004] `build_file_index` skips hidden directories but not hidden files

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:286-289`

### Description
The `filter_entry` skips directories starting with `.`, but hidden files (also starting with `.`) are still collected into the index because the filter only applies at the entry level and doesn't prevent files from being added later.

Wait — actually `filter_entry` in `walkdir` controls whether the entry is yielded AND whether its children are descended into. Hidden files inside non-hidden directories will still be yielded because the filter only checks the entry's own name.

Actually re-reading: `filter_entry` is called for EVERY entry (files and dirs). If a file name starts with `.`, it will be filtered out. So hidden files ARE skipped. However, the `skip_dirs` set contains directory names without the `.` prefix for some (e.g., `node_modules` vs `.git`). This is inconsistent.

### Impact
Inconsistent filtering logic. Some dot-prefixed dirs are in `skip_dirs` with the dot, others without.

### Recommendation
Standardize: either all hidden items are skipped by the `starts_with('.')` check (which handles it), or explicitly list all without dots. The `starts_with('.')` already covers `.git`, `.npm`, etc., so those entries in `skip_dirs` are redundant.

---

## [CP-005] Linux `.desktop` parsing is fragile

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:665-723`

### Description
The `.desktop` parser is a hand-rolled line parser that:
1. Only reads the first `[Desktop Entry]` section — valid, but doesn't handle localized names (`Name[en_US]`)
2. Doesn't handle `TryExec` or `OnlyShowIn`/`NotShowIn` fields
3. Doesn't validate that `Exec` contains a valid command
4. `dirs::data_dir()` can return `None`, and `.unwrap_or_default()` gives an empty string, which then gets filtered — but the `dirs` crate behavior should be checked

### Evidence
```rust
"Name" if name.is_none() => name = Some(value.to_string()),
```

### Impact
May show apps that shouldn't be shown, or miss localized names. Apps with `NoDisplay=true` are filtered, but other desktop environment constraints are ignored.

### Recommendation
Consider using a dedicated `.desktop` parser crate like `freedesktop-desktop-entry` for robustness.

---

## [CP-006] Windows `.lnk` scanning doesn't resolve targets

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:642-663`

### Description
Windows `.lnk` files are collected by path, but the actual target executable is not resolved. When `open_app` is called with a `.lnk` path, `cmd /C start "" <path>` should handle it, but this is implicit behavior.

### Impact
Some `.lnk` files may not open correctly if they point to non-executable targets or require special handling.

### Recommendation
Document this behavior or use a Windows API to resolve `.lnk` targets before storing.

---

## [CP-007] `capture_region` hardcodes PNG filename, causing overwrites

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:772-773`

### Description
Every capture saves to `desktop_dir.join("gquick_capture.png")`, overwriting the previous capture. Users lose prior screenshots.

### Evidence
```rust
let path = desktop_dir.join("gquick_capture.png").to_string_lossy().to_string();
```

### Impact
Data loss — previous captures are silently overwritten.

### Recommendation
Use a timestamped filename: `gquick_capture_20240115_143022.png`.

---

## [CP-008] `capture_region` doesn't restore window on error paths

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:728-830`

### Description
The window is hidden at line 736, but if an error occurs before line 828 (e.g., monitor not found, capture failed, region too small), the window is never shown again. The user sees the app disappear.

### Evidence
```rust
let _ = window.hide();
// ... error paths return Err(...) without showing window again
```

### Impact
App appears to crash or vanish. Poor UX.

### Recommendation
Use a guard pattern or explicitly show/close the window in all return paths. Since the function ends with `window.close()`, consider using `defer`/`finally` semantics or restructuring to ensure the window is always closed (which would trigger the normal app flow).

---

## [CP-009] `navigator.platform` is deprecated

**Severity:** Minor
**Location:** `src/App.tsx:15`

### Description
`navigator.platform` is deprecated and may be removed from browsers. While Tauri uses a WebView where this still works, it's not future-proof.

### Evidence
```typescript
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
```

### Impact
Future browser/WebView updates may break platform detection.

### Recommendation
Use `navigator.userAgentData?.platform` with fallback, or expose platform from Tauri backend via an invoke call.

---

## [CP-010] Shortcut sync in `App.tsx` doesn't handle parse errors

**Severity:** Minor
**Location:** `src/App.tsx:64-76`

### Description
The shortcut sync effect calls `update_main_shortcut` with the saved value, but if the saved shortcut is invalid (e.g., user manually edited localStorage), the error is only logged to console. The app continues with a broken shortcut state.

### Evidence
```typescript
try {
  await invoke("update_main_shortcut", { shortcut: saved });
} catch (err) {
  console.error("Failed to sync shortcut:", err);
}
```

### Impact
User may have a non-functional shortcut with no visible feedback.

### Recommendation
Show a UI notification or reset to default on parse failure.

---

## [CP-011] `build_file_index` uses blocking I/O on main thread

**Severity:** Major
**Location:** `src-tauri/src/lib.rs:261-314`

### Description
`build_file_index` performs synchronous filesystem traversal. When called from `search_files` or `smart_search_files`, it blocks the Tauri command thread. With large home directories, this can freeze the UI for seconds.

### Evidence
```rust
let walker = walkdir::WalkDir::new(&home)
    .max_depth(6)
    .follow_links(false)
    .into_iter()
```

### Impact
UI freezes during index rebuild. Poor user experience.

### Recommendation
Run index building in a background thread using `std::thread::spawn` or Tauri's async command support.

---

## [CP-012] `get_or_create_index` uses `Mutex` without poisoning recovery

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:72-83`

### Description
All `.lock().unwrap()` calls will panic if a thread holding the mutex panics. This is acceptable for most cases but could crash the app if a background thread panics while holding the lock.

### Impact
Potential app crash on mutex poisoning.

### Recommendation
Use `Mutex::into_inner()` or handle poisoning explicitly if moving index building to a background thread.

---

## [CP-013] `parse_shortcut` case-sensitivity for keys is inconsistent

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:865-917`

### Description
Key matching uses `.to_lowercase()`, but modifier matching also uses `.to_lowercase()`. However, the `key` variable is compared after lowercasing, which is correct. But the original `key` is not trimmed — `"Space "` would fail.

Actually, `parts` are created with `.trim()` on each part, so this is fine. But the error message shows the untrimmed key if it fails.

### Impact
Minor UX issue with error messages.

### Recommendation
Trim the key before using it in error messages.

---

## [CP-014] `list_apps` on Linux doesn't handle `Exec` field substitutions

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:714`

### Description
The `Exec` field in `.desktop` files often contains field codes like `%U`, `%F`, `%i`, `%c`. These are not valid command-line arguments and should be stripped before execution.

### Evidence
```rust
path: exec.unwrap_or_else(|| path.to_string_lossy().to_string()),
```

### Impact
Attempting to run a `.desktop` file's `Exec` line with field codes may fail.

### Recommendation
Strip known field codes (`%f`, `%F`, `%u`, `%U`, `%i`, `%c`, `%k`) from the `Exec` value before storing.

---

## [CP-015] `open_file` on Windows doesn't quote paths with spaces

**Severity:** Critical
**Location:** `src-tauri/src/lib.rs:519-524`

### Description
The Windows `open_file` implementation passes the path directly to `cmd /C start "" <path>`. If the path contains spaces, `cmd` may interpret parts of the path as additional arguments.

### Evidence
```rust
std::process::Command::new("cmd")
    .args(["/C", "start", "", &path])
```

### Impact
Paths with spaces fail to open. Potential command injection if the path is crafted (though paths come from filesystem, not user input, so injection risk is low).

### Recommendation
Use `tauri_plugin_opener` which handles quoting correctly, or wrap the path in quotes.

---

## [CP-016] `dirs::desktop_dir()` can fail, fallback to current_dir is problematic

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:772`

### Description
If `dirs::desktop_dir()` returns `None`, the fallback is `std::env::current_dir()`, which could be any directory (e.g., the app's install directory on Windows). This is unexpected for users.

### Evidence
```rust
let desktop_dir = dirs::desktop_dir().unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));
```

### Impact
Screenshots saved to unexpected locations.

### Recommendation
Use a well-known fallback like the user's home directory, or show an error if the desktop cannot be determined.

---

## [CP-017] `xcap::Monitor::all()` called twice on fallback

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:742-748`

### Description
If the first monitor name match fails, `xcap::Monitor::all()` is called a second time. This is redundant — the result from line 742 could be reused.

### Evidence
```rust
let xcap_monitor = xcap_monitors.into_iter()
    .find(|m| m.name().ok().as_deref() == Some(&tauri_name))
    .or_else(|| {
        xcap::Monitor::all().ok()?.into_iter().next()  // Second call!
    })
```

### Impact
Minor performance overhead, unnecessary system calls.

### Recommendation
Use `xcap_monitors.into_iter().next()` as the fallback instead of calling `Monitor::all()` again.

---

## [CP-018] `shortcut.mods == main_shortcut.mods` may fail for equivalent modifiers

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:1005-1008`

### Description
Modifier comparison uses bitwise equality. If the registered shortcut has `SUPER` on macOS but the parsed shortcut from state has `CONTROL` (due to `cmdorctrl` parsing), they won't match even though they represent the same physical shortcut.

Wait — actually `parse_shortcut` handles `cmdorctrl` by setting the platform-appropriate modifier, so the stored string should match. But if a user manually edits the shortcut string to use `cmd` on non-macOS, it would store `SUPER` which wouldn't match a `CONTROL` registration.

### Impact
Edge case: manually edited shortcuts may not trigger the toggle.

### Recommendation
Normalize modifiers during comparison or store the parsed `Shortcut` struct instead of the string.

---

## [CP-019] `App.tsx` global keyboard handler uses `e.key === "c"` which fires for `Ctrl+C` in input fields

**Severity:** Major
**Location:** `src/App.tsx:146-149`

### Description
The global keydown handler checks `(e.metaKey || e.ctrlKey) && e.key === "c"` to open chat. This intercepts `Ctrl+C` (copy) globally, including when the user is trying to copy text from the search results or chat history.

### Evidence
```typescript
if ((e.metaKey || e.ctrlKey) && e.key === "c" && view !== "actions") {
   e.preventDefault();
   setView("chat");
}
```

### Impact
Copy functionality is broken in the app. Users cannot copy text.

### Recommendation
Only trigger when the input is not focused, or use a different shortcut that doesn't conflict with standard copy.

---

## [CP-020] `update_main_shortcut` doesn't validate shortcut is unique

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:940-958`

### Description
When updating the main shortcut, there's no check that the new shortcut doesn't conflict with the screenshot (`Alt+S`) or OCR (`Alt+O`) shortcuts. If a user sets the main shortcut to `Alt+S`, both handlers may fire.

### Impact
Unexpected behavior when shortcuts overlap.

### Recommendation
Validate against reserved shortcuts before allowing the update.

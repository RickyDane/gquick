# GQuick Cross-Platform Audit — Findings

> Historical audit. It predates the current runtime file-search and documentation updates, so some recommendations here are now stale.

## Executive Summary

GQuick is a Tauri-based launcher/utility app currently **macOS-only**. While some areas are already cross-platform ready, critical functionality (app discovery, screen capture save paths, and some window behaviors) will break or behave incorrectly on Windows and Linux. This document details every issue found, its severity, and recommended fixes.

---

## 1. App Discovery / Launching (`list_apps`, `open_app`, appLauncher plugin)

### Status: ❌ BROKEN on Windows/Linux

**Severity: Critical**

The `list_apps` command in `lib.rs` (lines 610–639) is **hardcoded for macOS**:

```rust
#[cfg(target_os = "macos")]
{
    let paths = vec!["/Applications", "/System/Applications"];
    // ... iterates .app bundles
}
// TODO: Add Windows and Linux support
```

- **macOS**: Reads `.app` bundles from `/Applications` and `/System/Applications`. ✅
- **Windows**: Returns an empty list. No Start Menu / Program Files scanning. ❌
- **Linux**: Returns an empty list. No `.desktop` file scanning. ❌

The `open_app` command (lines 740–763) **does** have cross-platform implementations using `open` (macOS), `cmd /C start` (Windows), and `xdg-open` (Linux). ✅

**Frontend (`appLauncher.tsx`)**: Assumes `list_apps` returns data. On Windows/Linux the plugin will always show "No results". No platform guards.

**Recommended Fix:**
- **Windows**: Scan `C:\ProgramData\Microsoft\Windows\Start Menu\Programs` and `%APPDATA%\Microsoft\Windows\Start Menu\Programs` for `.lnk` files. Resolve `.lnk` targets using the `lnk` crate or COM APIs. Alternatively, use the `windows` crate to query installed apps via the Shell API.
- **Linux**: Scan `/usr/share/applications` and `~/.local/share/applications` for `.desktop` files. Parse `Name=` and `Exec=` fields using a crate like `freedesktop-desktop-entry`.
- **Frontend**: Optionally show a platform-specific message if no apps are found (e.g., "App discovery not yet supported on this platform").

---

## 2. File Operations (`open_file`, runtime file search)

### Status: ⚠️ PARTIAL

**Severity: Medium**

`open_file` (lines 503–527) has platform-specific handlers for macOS, Windows, and Linux. ✅

`runtime file search` (lines 261–308) has **partial** cross-platform support:
- Correctly uses `USERPROFILE` on Windows and `HOME` on Unix. ✅
- **Issue**: Skip-dirs list includes macOS-specific names (`Caches`, `Library`, `.Trash`) but is missing Windows-specific noise dirs (`AppData`, `NTUSER.DAT*`, `Recent`, `SendTo`) and Linux-specific dirs (`.cache`, `.config` is already there). These extra dirs will bloat the index and slow search on Windows/Linux.
- **Issue**: `max_depth(6)` from home may be too shallow on Windows where user documents are deeply nested (`C:\Users\<user>\OneDrive\Documents\...`).
- **Issue**: No platform-specific indexing exclusions (e.g., `C:\Windows`, `/proc`, `/sys`).

**Frontend (`fileSearch.tsx`)**: Fully platform-agnostic. ✅

**Recommended Fix:**
- Expand `skip_dirs` with Windows and Linux specific directories.
- Consider platform-specific `max_depth` or root paths (e.g., on Windows, also index `C:\Users\<user>\Desktop` explicitly).
- Add exclusion for system directories (`C:\Windows`, `/proc`, `/sys`, `/dev`).

---

## 3. Screen Capture (`capture_region`, save paths, opening captured images)

### Status: ⚠️ PARTIAL

**Severity: High**

`capture_region` (lines 641–737) uses `xcap` for cross-platform screen capture. ✅

**Issues:**
1. **Save path is macOS-only** (lines 685–688):
   ```rust
   #[cfg(target_os = "macos")]
   let path = format!("{}/Desktop/gquick_capture.png", std::env::var("HOME").unwrap());
   #[cfg(not(target_os = "macos"))]
   let path = "gquick_capture.png".to_string();
   ```
   On Windows/Linux, the image is saved to the **current working directory** (likely the install dir or user profile), which is unpredictable and may fail due to permissions. It also won't appear on the Desktop.

2. **Opening captured image** (lines 693–695):
   ```rust
   if mode == "screenshot" {
       #[cfg(target_os = "macos")]
       let _ = std::process::Command::new("open").arg(&path).spawn();
   }
   ```
   Only opens the image on macOS. On Windows/Linux, the screenshot is silently saved with no feedback to the user.

3. **OCR path**: Tesseract reads from the same `path` variable. If the path is invalid or unwritable on Windows/Linux, OCR will fail.

**Recommended Fix:**
- Use platform-specific Desktop paths:
  - Windows: `%USERPROFILE%\Desktop\gquick_capture.png` (or `KNOWNFOLDERID_Desktop` via `dirs` crate)
  - Linux: `$HOME/Desktop/gquick_capture.png` (or use `xdg-user-dir DESKTOP`)
- Use the `dirs` crate (`dirs::desktop_dir()`) for a clean cross-platform Desktop path.
- Open the image after capture on all platforms (reuse `open_file` logic).

---

## 4. Global Shortcuts (Alt+Space, Alt+S, Alt+O)

### Status: ⚠️ PARTIAL

**Severity: High**

The app registers three global shortcuts at startup (lines 996–1003):
- `Alt+Space` — toggle main window
- `Alt+S` — screenshot mode
- `Alt+O` — OCR mode

**Issues:**
1. **Alt+Space**: On Windows, `Alt+Space` is a **system-reserved shortcut** that opens the window menu (minimize/maximize/close) for the focused window. Registering it globally will likely fail or conflict with Windows shell behavior. On some Linux DEs (GNOME, KDE), it may also be reserved.
2. **Alt+S / Alt+O**: Less likely to conflict, but on Linux with certain window managers or accessibility tools, Alt+letter combos can be intercepted.
3. **No fallback or conflict detection**: If registration fails, the app silently continues. The user has no way to know the shortcut didn't work except that the app doesn't open.
4. **Settings UI (`Settings.tsx`)**: Offers `Alt+Space`, `CmdOrCtrl+Space`, `Alt+Shift+Space`, etc. This is good, but the default `Alt+Space` is problematic on Windows.

**Recommended Fix:**
- Change the **default** shortcut based on platform:
  - macOS: `Alt+Space` or `Cmd+Space` (though `Cmd+Space` is Spotlight — maybe `Alt+Space` is safest)
  - Windows: `Alt+Shift+Space` or `Ctrl+Shift+Space` (avoid `Alt+Space`)
  - Linux: `Alt+Space` may work, but test on major DEs; consider `Super+Space`
- Handle registration failures gracefully: show a notification or tray tooltip if a shortcut can't be registered.
- Allow users to customize screenshot/OCR shortcuts in Settings as well.

---

## 5. Window Management (decorations, transparency, dock icon, system tray)

### Status: ⚠️ PARTIAL

**Severity: Medium**

### 5.1 Decorations & Transparency

`tauri.conf.json` (lines 20–23):
```json
"decorations": false,
"transparent": true,
"shadow": false,
```

- **macOS**: Works well with `macOSPrivateApi: true`. ✅
- **Windows**: Transparency on Windows in Tauri requires WebView2 and can have performance issues or visual artifacts on some systems. It is supported but less polished than macOS. ⚠️
- **Linux**: Transparency support depends on the compositor (Wayland vs X11). On X11 with a compositor it works; on Wayland or without compositor, transparency may fail (black background). ⚠️

### 5.2 Dock Icon Hiding

`lib.rs` line 968–969:
```rust
#[cfg(target_os = "macos")]
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

- **macOS**: Hides dock icon, app runs from tray only. ✅
- **Windows**: No equivalent code. The app will show a taskbar button. This may be desired or not — if the goal is a "launcher that stays hidden", the taskbar button is acceptable but not ideal. ⚠️
- **Linux**: No equivalent code. Behavior depends on DE. ⚠️

**Recommended Fix:**
- **Windows**: Use `skipTaskbar: true` in `tauri.conf.json` (already set ✅) — this should prevent the taskbar button from appearing when the window is hidden. Verify it works.
- **Linux**: There's no universal API to hide from the taskbar. Some WMs respect `skipTaskbar`, others don't. Document the limitation.

### 5.3 System Tray

Tray icon setup (lines 974–989) is cross-platform Tauri API. ✅

**Issue**: Tray icon uses `app.default_window_icon().unwrap().clone()`. Ensure `icon.ico` and `icon.png` are bundled correctly for Windows/Linux.

---

## 6. Tauri Configuration (`macOSPrivateApi`, bundle config, icons)

### Status: ⚠️ PARTIAL

**Severity: Medium**

`tauri.conf.json`:
- `"macOSPrivateApi": true` (line 27): Required for transparency and shadowless windows on macOS. On Windows/Linux this flag is ignored. ✅
- `"skipTaskbar": true` (line 24): Works on Windows. On Linux, behavior varies. ⚠️
- **Bundle targets**: `"targets": "all"` — this will attempt to build `.msi`, `.deb`, `.rpm`, `.AppImage`, `.dmg`, etc. Make sure CI/build machines have the required tooling. ✅
- **Icons**: `icons/icon.ico` and `icons/icon.png` are referenced. Ensure these files exist and are valid. ⚠️ (not verified in this audit)

**Recommended Fix:**
- Verify `icons/icon.ico` exists and is a valid multi-size ICO (16x16, 32x32, 48x48, 256x256).
- Verify `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png` exist.
- For Linux, consider adding a `.desktop` file template for proper app launcher integration.

---

## 7. Dependencies (OCR, xcap platform support)

### Status: ✅ READY (OCR), ⚠️ PARTIAL (xcap on Linux Wayland)

**Severity: Medium**

### 7.1 `xcap` (screen capture)

`Cargo.toml`: `xcap = "0.9"`

- `xcap` supports Windows, macOS, and Linux. ✅
- **Linux requirement**: On Linux, `xcap` requires `libxcb`, `libxrandr`, and possibly `libdbus` depending on the backend. Wayland support in `xcap` is limited; it may fall back to X11 or fail on pure Wayland sessions. ⚠️
- **Windows requirement**: Works out of the box on Windows 10/11. ✅

### 7.2 OCR (Platform-Specific)

**macOS**: Uses `tesseract = "0.15"` (Rust binding to C++ Tesseract). Requires Homebrew install (`brew install tesseract`). The dependency is gated with `[target.'cfg(target_os = "macos")'.dependencies]`. ⚠️

**Windows/Linux**: Uses AI vision models (OpenAI, Google Gemini, Kimi, Anthropic) via the frontend. No local OCR engine required. The Rust backend captures the screen, encodes the image to base64, and emits it to the frontend which calls the configured AI API. ✅

**Recommended Fix:**
- **macOS**: Continue bundling Tesseract or document the Homebrew dependency clearly.
- **All platforms**: Detect AI provider availability at runtime and gracefully disable OCR if no API key is configured (already partially handled with error messages).
- **Linux Wayland**: Document that screen capture may require XWayland or an X11 session.

---

## 8. Frontend (platform-specific code in React)

### Status: ✅ READY

**Severity: Low / N/A**

The React frontend (`App.tsx`, `Settings.tsx`, `fileSearch.tsx`, `appLauncher.tsx`) contains **no platform-specific code**. All platform abstraction is done via Tauri commands. ✅

Minor notes:
- **Shortcut labels in UI**: `Settings.tsx` shows `⌘ C` and `⌘ ,` as shortcut hints in the Actions panel (line 249–250). These are macOS symbols. On Windows/Linux, users may expect `Ctrl+C` and `Ctrl+,`. Consider making these labels dynamic based on platform.
- **Placeholder text**: `App.tsx` line 670 shows `⌘K for actions`. Same issue — should show `Ctrl+K` on non-macOS.

**Recommended Fix:**
- Use a small utility to detect platform (`navigator.platform` or a Tauri OS info command) and render `Ctrl` vs `⌘` labels dynamically.

---

## 9. Docker Integration (`list_containers`, `list_images`, etc.)

### Status: ✅ READY

**Severity: N/A**

Docker commands are invoked via `std::process::Command`. Docker Desktop is available on macOS, Windows, and Linux. The CLI interface is identical. ✅

Note: On Windows, Docker may require WSL2 backend; the `docker` command must be in `PATH`. This is a user environment issue, not an app issue.

---

## 10. Additional Observations

### 10.1 Cargo.toml `name` mismatch

`Cargo.toml` package name is `tauri-app`, but the product name in `tauri.conf.json` is `GQuick`. The lib name is `tauri_app_lib`. This is fine functionally but slightly inconsistent.

### 10.2 `fuzzy-matcher` dependency

Listed in `Cargo.toml` but not used in `lib.rs`. Can be removed to reduce build size.

### 10.3 Hardcoded English OCR

`capture_region` uses `Tesseract::new(None, Some("eng"))`. Non-English users will get poor OCR results. Consider making the language configurable or auto-detecting.

---

## Summary Table

| Area | Status | Severity | Key Issue |
|------|--------|----------|-----------|
| App Discovery | ❌ BROKEN | Critical | `list_apps` only scans macOS `.app` bundles |
| File Operations | ⚠️ PARTIAL | Medium | `build_file_index` skip-dirs not Windows/Linux optimized |
| Screen Capture | ⚠️ PARTIAL | High | Save path and open-image are macOS-only |
| Global Shortcuts | ⚠️ PARTIAL | High | `Alt+Space` conflicts on Windows; no fallback on fail |
| Window Management | ⚠️ PARTIAL | Medium | Transparency iffy on Linux; no dock-hide on Win/Linux |
| Tauri Config | ⚠️ PARTIAL | Medium | Verify icons; Linux `.desktop` integration missing |
| Dependencies | ⚠️ PARTIAL | High | Tesseract not bundled; xcap Wayland uncertain |
| Frontend | ✅ READY | Low | Only minor shortcut label inconsistencies |
| Docker | ✅ READY | N/A | CLI is cross-platform |

---

## Priority Fix Order

1. **App Discovery** — implement Windows Start Menu and Linux `.desktop` scanning.
2. **Screen Capture paths** — use `dirs::desktop_dir()` and open image on all platforms.
3. **Global Shortcuts** — change default on Windows, handle registration failures.
4. **Tesseract bundling** — bundle on Windows, detect availability on all platforms.
5. **File index tuning** — add Windows/Linux skip directories.
6. **Frontend labels** — dynamic `Ctrl`/`⌘` display.
7. **Linux packaging** — add `.desktop` file and test on X11/Wayland.

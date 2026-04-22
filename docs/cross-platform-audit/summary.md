# GQuick Cross-Platform Audit — Summary

## Overview

GQuick is a Tauri-based desktop launcher and utility app (screenshot, OCR, file search, AI chat, Docker management). It is currently **macOS-ready** but requires significant work to function correctly on **Windows** and **Linux**.

## Overall Readiness

| Platform | Status | Blockers |
|----------|--------|----------|
| **macOS** | ✅ Ready | — |
| **Windows** | ❌ Not Ready | App discovery missing; `Alt+Space` conflict; Tesseract not bundled; save paths wrong |
| **Linux** | ❌ Not Ready | App discovery missing; Wayland capture uncertainty; Tesseract not bundled; save paths wrong |

## Critical Issues (Must Fix Before Release)

### 1. App Discovery is macOS-Only
The `list_apps` Rust command only scans `/Applications` for `.app` bundles. On Windows/Linux it returns an empty list, rendering the App Launcher plugin useless.

**Fix**: Scan Windows Start Menu `.lnk` files and Linux `.desktop` files.

### 2. Screenshot Save Paths Are Wrong on Windows/Linux
Captured images are saved to the current working directory instead of the Desktop on non-macOS platforms. This is unpredictable and often permission-restricted.

**Fix**: Use the `dirs` crate to get the cross-platform Desktop directory.

### 3. `Alt+Space` is System-Reserved on Windows
The default global shortcut to open GQuick conflicts with the Windows window-system menu. Registration may fail or behave erratically.

**Fix**: Use `Alt+Shift+Space` or `Ctrl+Shift+Space` as the Windows default.

### 4. Tesseract OCR is Not Bundled
The app assumes Tesseract is installed on the host system. This is not true by default on Windows and some Linux distributions.

**Fix**: Bundle Tesseract binaries on Windows; add runtime detection and graceful degradation on all platforms.

## High Issues (Strongly Recommended)

### 5. No Feedback After Screenshot on Windows/Linux
After capturing a screenshot, the app only runs `open` (macOS) to show the image. Windows/Linux users get no visual confirmation.

**Fix**: Reuse the existing `open_file` cross-platform logic to open the saved image.

### 6. Shortcut Registration Failures Are Silent
If a global shortcut can't be registered, the app continues without warning the user.

**Fix**: Catch registration errors and show a tray notification or settings warning.

### 7. File Index Includes System Noise on Windows/Linux
The file walker skip-list lacks Windows directories (`AppData`, `NTUSER.DAT`, etc.) and Linux system paths (`/proc`, `/sys`).

**Fix**: Expand the skip-list per platform.

## Medium Issues (Polish)

### 8. Frontend Shows macOS Shortcut Symbols Everywhere
The UI displays `⌘ C`, `⌘ ,`, and `⌘ K` regardless of platform. Windows/Linux users expect `Ctrl`.

**Fix**: Detect platform and render `Ctrl` or `⌘` dynamically.

### 9. Window Transparency May Break on Linux
Linux transparency requires a compositor. On Wayland or non-composited X11, the window may show a black background.

**Fix**: Test on major Linux DEs (GNOME, KDE, XFCE). Document limitations.

### 10. Linux Desktop Integration Missing
No `.desktop` file is provided for Linux packaging, so the app won't appear in the user's app menu.

**Fix**: Add a `.desktop` template to the bundle config.

## Quick Wins (Low Effort, High Impact)

| Fix | Effort | Impact |
|-----|--------|--------|
| Use `dirs::desktop_dir()` for screenshots | 5 min | High |
| Call `open_file` after screenshot on all platforms | 5 min | High |
| Expand `skip_dirs` for Windows/Linux | 10 min | Medium |
| Change default shortcut on Windows | 10 min | High |
| Dynamic `Ctrl`/`⌘` labels in React | 20 min | Medium |
| Remove unused `fuzzy-matcher` dep | 2 min | Low |

## Recommended Implementation Order

```
1. Fix screenshot save paths + open feedback
2. Fix global shortcut defaults + error handling
3. Implement Windows app discovery (Start Menu .lnk)
4. Implement Linux app discovery (.desktop files)
5. Bundle Tesseract on Windows / detect at runtime
6. Tune file indexer for Windows/Linux
7. Add Linux .desktop packaging
8. Polish frontend shortcut labels
9. Test on Windows 10/11 and major Linux distros
```

## Files Requiring Changes

| File | Lines | What to Change |
|------|-------|----------------|
| `src-tauri/src/lib.rs` | 610–639 | Implement `list_apps` for Windows/Linux |
| `src-tauri/src/lib.rs` | 641–737 | Fix save path; open image on all platforms |
| `src-tauri/src/lib.rs` | 996–1003 | Platform-specific default shortcuts |
| `src-tauri/src/lib.rs` | 261–308 | Expand `skip_dirs` |
| `src-tauri/Cargo.toml` | — | Add `dirs` crate; remove `fuzzy-matcher` |
| `src/Settings.tsx` | 23–30 | Update shortcut options for Windows |
| `src/App.tsx` | 249–250, 670 | Dynamic shortcut labels |
| `tauri.conf.json` | — | Verify icons; add Linux bundle config |

## Conclusion

GQuick has a solid cross-platform foundation thanks to Tauri, but **four critical blockers** prevent a usable Windows/Linux release. The good news: the frontend is entirely platform-agnostic, and the Rust backend already uses conditional compilation (`#[cfg]`) in the right places. With focused effort on app discovery, screenshot paths, shortcuts, and Tesseract bundling, the app can become truly cross-platform.

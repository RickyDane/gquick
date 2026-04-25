# Dependency Audit Report

Date: 2026-04-25  
Project: `gquick`

## Summary

This audit reviewed direct npm and Cargo dependencies, removed unused packages, and validated that the app still builds after cleanup. The dependency set is now smaller and easier to maintain, with unused Tauri plugins and build tooling removed.

## npm Dependencies

| Package | Status | Notes |
| --- | --- | --- |
| `@tauri-apps/api` | Kept | Core Tauri JavaScript API. |
| `@tauri-apps/plugin-clipboard-manager` | Kept | Clipboard integration used by the app. |
| `@tauri-apps/plugin-opener` | Kept | Opens external links/files through Tauri. |
| `clsx` | Kept | Utility for conditional class names. |
| `lucide-react` | Kept | Icon set used by React UI. |
| `react` | Kept | Core UI framework. |
| `react-dom` | Kept | React DOM renderer. |
| `react-markdown` | Kept | Markdown rendering support. |
| `remark-gfm` | Kept | GitHub-flavored Markdown support. |
| `tailwind-merge` | Kept | Tailwind class merge utility. |

## npm Dev Dependencies

| Package | Status | Notes |
| --- | --- | --- |
| `@tailwindcss/vite` | Kept | Tailwind CSS Vite integration. |
| `@tauri-apps/cli` | Kept | Tauri build and dev tooling. |
| `@types/react` | Kept | React TypeScript types. |
| `@types/react-dom` | Kept | React DOM TypeScript types. |
| `@vitejs/plugin-react` | Kept | React support for Vite. |
| `tailwindcss` | Kept | CSS framework. |
| `typescript` | Kept | Type checking and build step. |
| `vite` | Kept | Frontend dev server and bundler. |

## Cargo Dependencies

| Package | Status | Notes |
| --- | --- | --- |
| `tauri-build` | Kept | Tauri build dependency. |
| `tauri` | Kept | Core desktop runtime. Uses `macos-private-api`, `tray-icon`, and `protocol-asset`. |
| `tauri-plugin-opener` | Kept | Native opener integration. |
| `tauri-plugin-clipboard-manager` | Kept | Native clipboard integration. |
| `tauri-plugin-global-shortcut` | Kept | Global shortcut support remains in use. |
| `tauri-plugin-dialog` | Kept | Native dialog support remains in use. |
| `xcap` | Kept | Screenshot/capture support. |
| `image` | Kept | Image processing support. |
| `serde` | Kept | Serialization/deserialization. |
| `serde_json` | Kept | JSON serialization. |
| `walkdir` | Kept | Directory traversal. |
| `chrono` | Kept | Date/time handling. |
| `dirs` | Kept | Platform directory lookup. |
| `base64` | Kept | Base64 encoding/decoding. |
| `rusqlite` | Kept | SQLite access with bundled SQLite. |
| `rayon` | Kept | Parallel processing. |
| `reqwest` | Kept | HTTP client using `rustls-tls`. |
| `libc` | Kept | Low-level platform bindings. |
| `tesseract` | Kept | macOS OCR support. |

## Removed Packages

| Ecosystem | Package or code | Reason |
| --- | --- | --- |
| npm dependency | `@tauri-apps/plugin-dialog` | No longer needed as a direct frontend dependency. |
| npm dependency | `@tauri-apps/plugin-fs` | No longer needed as a direct frontend dependency. |
| npm dependency | `@tauri-apps/plugin-global-shortcut` | No longer needed as a direct frontend dependency. |
| npm dependency | `@tauri-apps/plugin-shell` | No longer needed as a direct frontend dependency. |
| npm dependency | `@tauri-apps/plugin-sql` | No longer needed as a direct frontend dependency. |
| npm dev dependency | `autoprefixer` | Not needed with current Tailwind/Vite setup. |
| npm dev dependency | `postcss` | Not needed as a direct dev dependency. |
| Cargo dependency | `tauri-plugin-shell` | Unused native shell plugin. |
| Cargo dependency | `tauri-plugin-fs` | Unused native filesystem plugin. |
| Cargo dependency | `tauri-plugin-sql` | Unused native SQL plugin. |
| Cargo dependency | `fuzzy-matcher` | Unused fuzzy matching crate. |
| Rust initialization | Shell plugin init call | Removed with unused shell plugin. |
| Rust initialization | FS plugin init call | Removed with unused FS plugin. |
| Rust initialization | SQL plugin init call | Removed with unused SQL plugin. |

## Kept Heavy Packages

| Package | Why kept | Binary-size note |
| --- | --- | --- |
| `tesseract` | Required for macOS OCR. | Expected to add native OCR weight; keep isolated to macOS target. |
| `rusqlite` with `bundled` | Required for local SQLite behavior. | Bundled SQLite increases binary size but improves runtime portability. |
| `reqwest` | Required for HTTP requests. | Uses `rustls-tls` and disables default features to avoid extra TLS stack weight. |
| `image` | Required for image processing. | Can be size-sensitive depending on enabled transitive codecs. |
| `xcap` | Required for screen capture. | Native capture support is core app functionality. |
| `rayon` | Required for parallel workloads. | Adds threading support; acceptable for performance-sensitive processing. |
| `lucide-react` | Required for UI icons. | Frontend bundle should rely on tree-shaking to avoid unused icons. |
| `react-markdown` and `remark-gfm` | Required for Markdown display. | Adds parser/rendering cost; acceptable because Markdown rendering is user-facing. |

## Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | Passed | Frontend TypeScript and Vite build succeeded. |
| `cargo check` | Passed | Rust project checks after dependency cleanup. |
| `node --check scripts/macos-bundle-ocr.mjs` | Passed | macOS OCR bundling script syntax is valid. |

## Review Fix

The review found a macOS OCR bundle script issue where the script assumed a fixed binary name. The script now derives the Cargo package name and falls back to `tauri-app`, which makes bundling safer when package or binary names differ.

## Maintainer Notes

- Re-run this audit when adding Tauri plugins, OCR functionality, or new native crates.
- Prefer target-specific dependencies for platform-only features.
- Keep direct npm dependencies limited to packages imported by frontend code.
- Check binary-size impact before adding native crates with bundled libraries or large transitive dependencies.

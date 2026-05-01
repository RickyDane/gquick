# Release Notes: Recent Files Cache

## Summary
Recent files and folders now appear instantly when searching, eliminating the 500ms wait for filesystem scans. Previously opened files are cached and shown immediately while the full filesystem search runs in the background.

## What's New
- **Instant Recent File Search**: A new `recentFilesPlugin` returns recently opened files and folders immediately as you type (~0ms response), with no debounce delay.
- **Unified Recent Section**: File and folder entries now appear naturally alongside apps and other items in the unified "Recent" section, rather than in a separate dedicated area.
- **Smart Deduplication**: If a file appears in both the recent cache and the filesystem scan, it only appears once — with the instant recent result taking priority.
- **Cleaner Search States**: The "Searching files…" indicator now only appears after you stop typing for 500ms, removing the distracting flash on every keystroke.

## Bug Fixes
- Fixed "Searching files…" indicator flashing on every keystroke, even for immediate results.
- Fixed duplicate entries where the same file could appear twice (once from recents, once from filesystem scan).

## Migration Notes
No migration required. The feature uses existing localStorage usage history automatically. Recent files will populate as you continue using the app.

## Breaking Changes
None.

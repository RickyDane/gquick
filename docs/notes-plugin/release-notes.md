# Release Notes: GQuick Notes Plugin

## Summary
Introducing **GQuick Notes** — a lightweight, always-accessible note-taking feature built right into your launcher. Capture ideas instantly, find them fast, and let your notes power smarter AI conversations.

## What's New
- **Quick Capture**: Save a note in seconds by typing `note: your text` in the search bar. No clicks, no friction.
- **Instant Search**: Find notes with `search notes: query` or `notes: query` directly from the launcher input.
- **Full Notes Manager**: A dedicated view to browse, edit, delete, and copy all your notes — accessible via `⌘N` (macOS) or `Ctrl+N` (Windows/Linux).
- **AI Context Injection**: Notes are automatically fed into the AI chat as context when your queries relate to them, making assistant responses more personal and relevant.
- **Persistent Storage**: All notes are stored locally in a SQLite database via `rusqlite` — fast, reliable, and bundled with the app.
- **Actions Overlay Integration**: Open Notes anytime from the `⌘K` actions menu.

## Bug Fixes
*None in this release.*

## Migration Notes
No migration required. The Notes plugin is available immediately after updating. Your existing data and settings remain untouched.

## Breaking Changes
None.

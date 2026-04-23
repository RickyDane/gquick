feat(notes): add GQuick Notes plugin with quick capture, search, and AI context

Implement the GQuick Notes plugin — a first-class note-taking experience
integrated directly into the launcher.

New capabilities:
- Quick capture via `note: <text>` search prefix for instant save
- Search notes via `search notes:` and `notes:` prefixes
- Dedicated NotesView component for full CRUD (list, edit, delete, copy)
- Global keyboard shortcut ⌘N/Ctrl+N to open notes manager
- Registration in ⌘K actions overlay for discoverability
- SQLite persistence via rusqlite (bundled, zero external setup)
- Automatic note context injection into AI chat for note-related queries

Files added/modified:
- src/plugins/notes.tsx (new)
- src/components/NotesView.tsx (new)
- src/plugins/index.ts
- src/App.tsx
- src-tauri/src/lib.rs
- src-tauri/Cargo.toml

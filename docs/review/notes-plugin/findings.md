# Code Review Findings: GQuick Notes Plugin

## [F-001] SQL LIKE Wildcards Injected Into User Search Queries

**Severity:** High
**Location:** `src-tauri/src/lib.rs:102`

### Description
The `search_notes` command builds a LIKE pattern directly from user input without escaping SQL wildcard characters:

```rust
let search_pattern = format!("%{}%", query);
```

If a user searches for `50%` or `test_1`, the `%` and `_` characters are interpreted as SQL wildcards, returning unintended matches.

### Evidence
```rust
#[tauri::command]
fn search_notes(state: tauri::State<'_, DbState>, query: String) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let search_pattern = format!("%{}%", query);  // <-- wildcards not escaped
    let mut stmt = conn.prepare(
        "SELECT ... FROM notes WHERE title LIKE ?1 OR content LIKE ?1 ..."
    )?;
    ...
}
```

### Impact
Users get unexpected search results. A search for `100%` matches any note containing `100` followed by any characters. This is a logic bug that degrades search accuracy.

### Recommendation
Escape `%` and `_` in the query before building the pattern:
```rust
let escaped = query.replace('%', "\\%").replace('_', "\\_");
let search_pattern = format!("%{}%", escaped);
```
And add `ESCAPE '\'` to the SQL query, or use `rusqlite`'s `escape_like` utility if available.

---

## [F-002] `notesContext` Not Reset on Chat Clear

**Severity:** High
**Location:** `src/App.tsx:252-264`

### Description
When the user clears the chat with `Ctrl+R` / `⌘+R`, the `notesContext` state is not reset. The amber "Notes used as context" banner persists with stale data even for subsequent unrelated queries.

### Evidence
```tsx
if ((e.metaKey || e.ctrlKey) && e.key === "r" && view === "chat") {
  e.preventDefault();
  setMessages([...]);
  setAttachedImages([]);
  setChatInput("");
  // setNotesContext(null) is MISSING
}
```

Also, the clear-chat button in the header has the same omission.

### Impact
Users see misleading context banners for conversations where notes were not actually used. This erodes trust in the context injection feature.

### Recommendation
Add `setNotesContext(null)` in both places where chat is cleared (keyboard shortcut and header button).

---

## [F-003] Missing Database Index for Note Search

**Severity:** Medium
**Location:** `src-tauri/src/lib.rs:1447-1456`

### Description
The `notes` table is created without an index on `title` or `content`. The `search_notes` command performs `LIKE '%query%'` on both columns. Without an index, SQLite must do a full table scan for every search.

### Evidence
```rust
conn.execute(
    "CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )",
    [],
)?;
```
No `CREATE INDEX` statement follows.

### Impact
Search performance degrades linearly with the number of notes. With hundreds or thousands of notes, searches become noticeably slow.

### Recommendation
Add an index after table creation:
```rust
conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title)",
    [],
)?;
conn.execute(
    "CREATE INDEX IF NOT EXISTS idx_notes_content ON notes(content)",
    [],
)?;
```
Note: SQLite can use indexes for `LIKE 'prefix%'` but not `LIKE '%suffix%'`; consider adding a full-text search (FTS5) virtual table if note volume will be high.

---

## [F-004] NotesView Auto-Refresh After Quick Save Does Not Work

**Severity:** Medium
**Location:** `src/components/NotesView.tsx:74-83`

### Description
`NotesView` listens for the `storage` event to detect when a quick note was saved from the search bar:

```tsx
useEffect(() => {
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "note-last-saved") {
      setLastSaved(e.newValue);
      fetchNotes();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}, [fetchNotes]);
```

The `storage` event **only fires across different documents/tabs**. In a Tauri app with a single webview, this event will never fire when `localStorage.setItem("note-last-saved", ...)` is called from the same window.

### Impact
The Notes view does not auto-refresh after a quick save from the search bar. The user must manually refresh or reopen the view to see newly created notes.

### Recommendation
Use a custom `window` event (e.g., `gquick-note-saved`) instead of `localStorage` for same-window communication, or emit a Tauri event from the Rust backend after `create_note` succeeds.

---

## [F-005] `lastSaved` Badge Persists Indefinitely

**Severity:** Medium
**Location:** `src/components/NotesView.tsx:53-55`, `166-170`

### Description
The "Saved" badge in the NotesView header is shown whenever `lastSaved` is truthy:

```tsx
const [lastSaved, setLastSaved] = useState<string | null>(
  localStorage.getItem("note-last-saved")
);
```

Once any note is saved (ever), the badge appears and never disappears until the component unmounts. There is no timeout or dismissal logic.

### Impact
The badge becomes meaningless noise after the first save. It no longer communicates useful state.

### Recommendation
Either:
1. Clear the badge after a timeout (e.g., 3 seconds) using `setTimeout` + cleanup.
2. Track whether the last save happened in the current session and clear it on mount.
3. Remove the badge entirely and rely on the list updating to show success.

---

## [F-006] Overly Broad Note-Related Query Detection

**Severity:** Medium
**Location:** `src/App.tsx:428-432`

### Description
The `isNoteRelatedQuery` function triggers notes context injection for many common English words:

```tsx
const noteKeywords = ["note", "remember", "memo", "wrote", "saved", "my note", "remind me"];
```

Queries like "Please **remember** to **save** the file" or "I **wrote** a test" will trigger an unnecessary `search_notes` call and prepend potentially irrelevant context to the AI prompt.

### Impact
- Wasted database queries on every chat message containing common words.
- AI responses may be polluted with irrelevant note context.
- Increased token usage and API costs.

### Recommendation
Use stricter patterns, e.g.:
```tsx
const noteKeywords = ["my note", "my notes", "my memo", "did i write", "what did i note"];
const lower = query.toLowerCase();
return noteKeywords.some(kw => lower.includes(kw)) ||
       /\b(note|notes|memo):\s*/.test(lower);
```

---

## [F-007] Redundant SQL Dependencies (`tauri-plugin-sql` + `rusqlite`)

**Severity:** Low
**Location:** `src-tauri/Cargo.toml:28`, `src-tauri/src/lib.rs:1442-1459`

### Description
Both `tauri-plugin-sql` (with SQLite feature) and `rusqlite` (with bundled SQLite) are dependencies. The plugin is initialized in `run()` but never used; all database access goes through `rusqlite` directly.

### Impact
Increased binary size and compile time. Potential for future confusion about which API to use.

### Recommendation
Pick one approach:
- If keeping `rusqlite` (current approach): Remove `tauri-plugin-sql` from `Cargo.toml` and the `.plugin(tauri_plugin_sql::Builder::default().build())` call.
- If migrating to `tauri-plugin-sql`: Remove `rusqlite` and use the plugin's JavaScript/Rust APIs.

---

## [F-008] Fragile `notesContext` Parsing Logic

**Severity:** Low
**Location:** `src/App.tsx:477-480`

### Description
The context string built in `fetchNotesContext` is later parsed with a regex to extract titles and content:

```tsx
setNotesContext(notesContextStr ? notesContextStr.split("\n").slice(0, -2).map(line => {
  const match = line.match(/^\[(.+?)\]: (.+)$/);
  return match ? { title: match[1], content: match[2] } : { title: "Note", content: line };
}) : null);
```

Problems:
1. `.slice(0, -2)` assumes the last two lines are always the footer (`\n\nUser's question: ...`). If `fetchNotesContext` changes, this breaks.
2. If a note title contains `]`, the regex `^\[(.+?)\]: (.+)$` will capture incorrectly.
3. If a note's content contains newlines, the `join("\n")` in `fetchNotesContext` will produce multiple lines per note, but the parser treats every line as a separate note.

### Evidence
In `fetchNotesContext`:
```tsx
const context = notes.map(n => `[${n.title}]: ${n.content}`).join("\n");
return `The user has these relevant notes that may help answer their question:\n${context}\n\nUser's question: ${query}`;
```
If `n.content` contains `"\n"`, the result has newlines inside a "note line".

### Impact
The context banner may show garbled or truncated note previews.

### Recommendation
Pass structured data instead of a string. Return `Note[]` from `fetchNotesContext` and build the context string separately from the display data:
```tsx
const [notesContextData, setNotesContextData] = useState<Note[] | null>(null);
// ...
setNotesContextData(notes);
```

---

## [F-009] `setTimeout` Leak in `handleCopy`

**Severity:** Low
**Location:** `src/components/NotesView.tsx:119-127`

### Description
A timeout is set when copying but never cleaned up:

```tsx
const handleCopy = async (note: Note) => {
  try {
    await navigator.clipboard.writeText(note.content);
    setCopiedId(note.id);
    setTimeout(() => setCopiedId(null), 2000);
  } catch {
    // ignore
  }
};
```

If the component unmounts before the timeout fires, `setCopiedId` is called on an unmounted component. React 19 silently ignores this, but it is still a minor leak.

### Recommendation
Use a ref to track and clear the timeout:
```tsx
const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// ...
copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
// in cleanup or before setting a new one:
if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
```

---

## [F-010] Clipboard Failures Silently Ignored

**Severity:** Low
**Location:** `src/plugins/notes.tsx:111-118`, `src/components/NotesView.tsx:119-127`

### Description
When copying note content to the clipboard, errors are swallowed with an empty `catch` block:

```tsx
try {
  await navigator.clipboard.writeText(note.content);
  await getCurrentWindow().hide();
} catch {
  // ignore
}
```

If the clipboard API is unavailable (e.g., in a non-secure context or permission denied), the window still hides and the user loses access to the content.

### Impact
User experience degradation on systems where clipboard access fails. The user has no feedback about what went wrong.

### Recommendation
At minimum, don't hide the window if the copy fails:
```tsx
try {
  await navigator.clipboard.writeText(note.content);
  await getCurrentWindow().hide();
} catch {
  // Optionally: show a toast or keep window open
}
```

---

## [F-011] No User-Facing Error States

**Severity:** Low
**Location:** `src/components/NotesView.tsx` (multiple locations)

### Description
All async failures in `NotesView` are logged to the console only:
- `fetchNotes` fails → shows empty list or loading spinner forever
- `handleSave` fails → console error, no UI feedback
- `handleDelete` fails → console error, note appears deleted in UI until refresh

### Impact
Users have no way to know if an operation failed. The UI may appear to work while the backend silently errors.

### Recommendation
Add a simple error state (e.g., a toast notification or inline error message) for at least `handleSave` and `handleDelete` failures.

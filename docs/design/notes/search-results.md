# Mockup: Search Notes Results

## Overview

When the user types `search notes:` followed by a query in the main search bar, GQuick searches through saved notes and displays matching results in the standard search results list. This allows quick retrieval of notes without opening the dedicated management view.

## Trigger

Prefix match on `search notes:` or `search note:` (case-insensitive, trim whitespace).

---

## Layout Diagram

### State: `search notes: grocery`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Search]  search notes: grocery                                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [StickyNote]  Grocery List                        2d ago       │   │
│  │                ...milk, eggs, **grocery** list...               │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  [StickyNote]  Weekly Budget                       1w ago       │   │
│  │                ...spent too much on **grocery**...              │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  [StickyNote]  Recipe Ideas                        3d ago       │   │
│  │                ...check the **grocery** aisle for...            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Open   ⌘ C Copy   ⌘ K Actions                               GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### State: No matching notes

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Search]  search notes: xyzabc                                         │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [SearchX]  No notes found                                      │   │
│  │             No saved notes match "xyzabc"                       │   │
│  │             Try a different search or create a note             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Open    ⌘ K Actions                                         GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Search Behavior

### Query Parsing

```typescript
const query = rawQuery.toLowerCase().replace(/^search notes?:\s*/, "").trim();
```

### Search Logic

1. **Title match**: Search in `note.title` (first line of content if no explicit title)
2. **Content match**: Search in `note.content`
3. **Case-insensitive**: Both query and content compared in lowercase
4. **Ranking**:
   - Title match: score = 100
   - Content match: score = 80
   - Multiple occurrences in content: score += 10 per extra occurrence (max 120)

### Result Limit

Show up to **20 results** to keep the list manageable. If more exist, show a final item:

```
Title: "X more notes..."
Subtitle: "Open Notes view to see all results"
Icon: StickyNote (text-zinc-600)
Action: Switch to notes management view with search pre-filled
```

---

## Component Specification

### Search Result Item (Note Match)

Standard `SearchResultItem` layout with enhanced preview:

```
Container:
  - className: "group flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-75"
  - Active: "bg-white/10 ring-1 ring-white/10 shadow-lg"
  - Inactive: "hover:bg-white/5"

Icon Container:
  - className: "flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 mt-0.5"
  - Active: "bg-zinc-800 border-white/20 text-yellow-400"
  - Inactive: "bg-zinc-900 border-white/5 text-yellow-400"
  - Icon: StickyNote (h-5 w-5)

Content Area (flex flex-col flex-1 min-w-0):
  Title Row (flex items-center gap-2):
    Title:
      - className: "text-[14px] font-medium text-zinc-100 truncate"
    Date:
      - className: "text-[11px] text-zinc-600 shrink-0"
      - Content: "· 2d ago" or "· Jan 15"

  Match Preview:
    - className: "text-[11px] text-zinc-500 truncate mt-0.5"
    - Content: Snippet containing the matched term with context (~60 chars before/after)
    - Highlight: matched term wrapped in `<mark class="bg-yellow-500/20 text-yellow-200 rounded px-0.5">term</mark>`

Right Side (active only):
  - className: "flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
  - ChevronRight (h-4 w-4 text-zinc-600)
```

### Preview Snippet Generation

```typescript
function generateSnippet(content: string, query: string, maxLength = 100): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);

  if (index === -1) return content.slice(0, maxLength) + "...";

  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + query.length + 40);
  let snippet = content.slice(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
```

---

## Highlight Styling

```
Match highlight:
  - className: "bg-yellow-500/20 text-yellow-200 rounded px-0.5"
  - Note: yellow tint to match notes brand color
```

---

## Actions Per Result

### Primary Action (Enter / Click)

**Copy note content to clipboard** and show brief toast confirmation.

```typescript
onSelect: async () => {
  await navigator.clipboard.writeText(note.content);
  // Show "Copied to clipboard" toast (inline in search UI)
  await getCurrentWindow().hide();
}
```

### Secondary Actions (Context Menu / Modifier Keys)

| Modifier | Action |
|----------|--------|
| `⌘+Enter` (or `Ctrl+Enter`) | Open note in management view for editing |
| `⌘+C` (when result active) | Copy to clipboard (same as Enter) |
| `⌘+Delete` | Delete note with confirmation |

---

## Empty State

When `search notes:` returns no results:

```
Icon: SearchX (h-5 w-5 text-zinc-500)
Title: "No notes found"
Subtitle: `No saved notes match "${query}"`
Action: None (Enter does nothing)
```

---

## Keyboard Behavior

| Key | Behavior |
|-----|----------|
| `↑ / ↓` | Navigate through note results |
| `Enter` | Copy note content to clipboard, hide window |
| `⌘+Enter` | Open note in management view |
| `Escape` | Clear search, return to idle state |
| `Backspace` to remove `search notes:` | Exit search-notes mode, restore normal search |

---

## Integration with Plugin System

The `search notes:` command is **not** a traditional plugin (it doesn't use `getItems`). Instead, it's detected at the `App.tsx` level before plugin dispatch:

```typescript
// In App.tsx query handler
if (query.toLowerCase().startsWith("search note")) {
  const searchTerm = query.replace(/^search notes?:\s*/i, "");
  const notes = searchNotes(searchTerm); // client-side search
  setItems(notes.map(note => ({
    id: note.id,
    pluginId: "notes",
    title: note.title,
    subtitle: generateSnippet(note.content, searchTerm),
    icon: StickyNote,
    score: calculateScore(note, searchTerm),
    onSelect: () => { /* copy to clipboard */ }
  })));
  return;
}
```

This ensures note search is instant and doesn't compete with other plugins.

---

## Performance

- **Local search only**: All notes are in `localStorage`; search is synchronous.
- **No debounce**: Results update instantly as user types.
- **Max notes**: Soft limit of 500 notes. Beyond that, truncate or paginate in management view.

---

## Accessibility

- **Live region**: Announce "X notes found" when results update.
- **Match highlight**: Visual highlight only; screen reader should announce "Match in [title]".
- **Keyboard**: Full arrow-key navigation with Enter to copy.

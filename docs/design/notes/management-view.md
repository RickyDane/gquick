# Mockup: Notes Management View

## Overview

The Notes Management View is a dedicated full-panel view for browsing, editing, and deleting saved notes. It is accessed from the Actions menu (⌘K / Ctrl+K) via a "Notes" plugin entry, or by selecting the Notes action from the actions list.

This view replaces the search results area when `view === "notes"`.

---

## Layout Diagram

### Main View — Notes List

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  Notes                                            [+]     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [Search icon]  Search notes...                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [StickyNote]  Grocery List                        2d ago  [...] │   │
│  │                - Milk, eggs, bread...                            │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  [StickyNote]  Meeting Notes                       5h ago  [...] │   │
│  │                Action items from standup...                      │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  [StickyNote]  Project Ideas                       1w ago  [...] │   │
│  │                * AI-powered search                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   ↵ Open/Edit   ⌫ Delete   ⌘ K Actions            GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### Empty State

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  Notes                                            [+]     │
│                                                                         │
│                          ┌───────────┐                                 │
│                          │ StickyNote│   (h-12 w-12, text-zinc-600)   │
│                          └───────────┘                                 │
│                                                                         │
│                        No notes yet                                     │
│               Type "note: your text" in search to create one            │
│                                                                         │
│                    [    Create First Note    ]                          │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Create Note   ⌘ K Actions                                   GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### Inline Edit Mode (Expanded Note)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  Notes                                    [Save] [Cancel] │
│                                                                         │
│  Title: ┌───────────────────────────────────────────────────────────┐  │
│         │ Grocery List                                              │  │
│         └───────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ - Milk                                                          │   │
│  │ - Eggs                                                          │   │
│  │ - Bread                                                         │   │
│  │ - Coffee beans                                                  │   │
│  │                                                                 │   │
│  │ *Remember to check expiration dates*                            │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Save   ⌘ Enter Save   Escape Cancel   ⌘ K Actions           GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### Delete Confirmation (Inline)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  Notes                                            [+]     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [StickyNote]  Grocery List                        2d ago       │   │
│  │                Delete this note?                                │   │
│  │                [  Cancel  ]  [  Delete  ]                       │   │
│  │                                                                 │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  [StickyNote]  Meeting Notes                       5h ago  [...] │   │
│  │                Action items from standup...                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate   ↵ Open/Edit   ⌫ Delete   ⌘ K Actions            GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## View Entry Point

Add to `appActions` in `App.tsx`:

```typescript
{ id: "notes", label: "Notes", icon: StickyNote, shortcut: `${modKey} N`, onClick: () => setView("notes") }
```

Update `view` type: `"search" | "chat" | "settings" | "actions" | "notes"`

Header icon: `StickyNote` with `text-yellow-400` when `view === "notes"`.

---

## Component Specifications

### 1. Notes List Container

```
Container:
  - className: "flex flex-col h-[420px]"

Search Bar (inside view):
  - className: "mx-4 mt-3 mb-2"
  - Input wrapper: "flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/50 border border-white/10 focus-within:border-white/20 transition-colors"
  - Search icon: Search (h-4 w-4 text-zinc-500)
  - Input: "flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-500 outline-none"
  - Placeholder: "Search notes..."
  - Clear button (visible when text present): X (h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300)

Scrollable List:
  - className: "flex-1 overflow-y-auto px-2 pb-2"
  - Note cards stacked with gap-1.5
```

### 2. Note Card (Default State)

```
Container:
  - className: "group flex flex-col gap-1.5 p-3 rounded-xl cursor-pointer transition-all duration-75 border border-transparent hover:border-white/5 hover:bg-white/5"
  - Active state: "bg-white/10 border-white/10 ring-1 ring-white/10 shadow-lg"

Header Row (flex items-center gap-3):
  Icon Container:
    - className: "flex h-9 w-9 items-center justify-center rounded-lg border bg-zinc-900 border-white/5 text-yellow-400 shrink-0"
    - Icon: StickyNote (h-5 w-5)

  Title & Meta (flex-1 min-w-0):
    Title:
      - className: "text-[14px] font-medium text-zinc-100 truncate"
      - Content: First line of note, max 60 chars, or "Untitled Note" if empty
    Meta row (flex items-center gap-2):
      - Clock icon: h-3 w-3 text-zinc-600
      - Date: "2d ago", "5h ago", "Jan 15" (text-[11px] text-zinc-500)

  Actions (opacity-0 group-hover:opacity-100 transition-opacity):
    - More actions shown on hover/focus
    - Three icon buttons in a row with gap-1:
      - Edit: Edit2 (h-3.5 w-3.5) — text-zinc-500 hover:text-zinc-200
      - Copy: Copy (h-3.5 w-3.5) — text-zinc-500 hover:text-zinc-200
      - Delete: Trash2 (h-3.5 w-3.5) — text-zinc-500 hover:text-red-400
    - Button wrapper: "p-1.5 hover:bg-white/5 rounded-lg transition-colors"

Preview Row:
  - className: "text-[12px] text-zinc-500 truncate pl-12"
  - Content: Second line of note (if exists), or first 80 chars of single-line note
  - Markdown is stripped for preview (show plain text only)
```

### 3. Note Card (Expanded / Edit Mode)

When a note is selected for editing, it expands in-place (no modal) to show a textarea:

```
Container (expanded):
  - className: "flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10"
  - Height: auto (grows to fit content)

Title Input:
  - className: "w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-100 outline-none focus:border-yellow-500/30 transition-colors"
  - Placeholder: "Note title..."
  - Default value: Existing title (first line)

Content Textarea:
  - className: "w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-yellow-500/30 transition-colors resize-none"
  - Rows: auto (min 3, max 10)
  - Placeholder: "Write your note in Markdown..."
  - Font: font-mono text-[13px] (to hint at Markdown support)

Action Row (flex justify-end gap-2 mt-1):
  Cancel button:
    - className: "px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
    - Label: "Cancel"
  Save button:
    - className: "px-3 py-1.5 text-xs font-medium bg-yellow-600/80 hover:bg-yellow-500 text-white rounded-lg transition-colors"
    - Label: "Save"
    - Icon (optional): Save (h-3 w-3 mr-1)
```

### 4. Create New Note Button (Header)

In the top-right of the input header bar:

```
Button:
  - className: "p-1.5 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-yellow-400 transition-colors"
  - Icon: Plus (h-4 w-4)
  - aria-label: "Create new note"
  - onClick: Opens a blank expanded note card at the top of the list
```

### 5. Empty State

```
Container:
  - className: "flex flex-col items-center justify-center h-full text-center px-8"

Icon:
  - StickyNote (h-12 w-12 text-zinc-600 mb-4)

Title:
  - className: "text-sm font-medium text-zinc-400 mb-1"
  - Content: "No notes yet"

Subtitle:
  - className: "text-[11px] text-zinc-500 mb-4"
  - Content: 'Type "note: your text" in search to create one'

Create Button:
  - className: "px-4 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-xl transition-colors"
  - Label: "Create First Note"
```

### 6. Delete Confirmation Overlay

Inline within the note card, replacing the preview area:

```
Overlay row (inside card, below header):
  - className: "flex items-center gap-2 pl-12 mt-1"

Text:
  - className: "text-[12px] text-zinc-400"
  - Content: "Delete this note?"

Buttons:
  Cancel:
    - className: "px-2 py-0.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded transition-colors"
    - Label: "Cancel"
  Delete:
    - className: "px-2 py-0.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
    - Label: "Delete"
```

---

## Keyboard Navigation

| Key | Behavior |
|-----|----------|
| `↑ / ↓` | Navigate between note cards |
| `Enter` | Open selected note in edit mode |
| `Escape` | If editing, cancel edit. If viewing list, return to search view |
| `⌘+N` (or `Ctrl+N`) | Create new blank note |
| `⌘+Enter` | Save note when in edit mode |
| `Delete` or `Backspace` | Prompt delete on selected note (not in edit mode) |
| `⌘+C` (when note selected) | Copy note content to clipboard |
| `Tab` | In edit mode, focus title → content → buttons |

---

## Search Within Notes

The search bar filters notes by:
1. Title (first line)
2. Content (full body)
3. Date range (future enhancement: `before:`, `after:`)

Search is client-side only (localStorage), instantaneous. Results update on every keystroke with no debounce needed.

Highlight matching text in preview with `<mark class="bg-yellow-500/20 text-yellow-200 rounded px-0.5">term</mark>`.

---

## Date Formatting

| Age | Format |
|-----|--------|
| < 1 hour | "X min ago" |
| < 24 hours | "Xh ago" |
| < 7 days | "Xd ago" |
| < 30 days | "Xw ago" |
| >= 30 days | "Jan 15" or "Jan 15, 2024" |

---

## Data Structure

```typescript
interface Note {
  id: string;           // nanoid or timestamp
  title: string;        // First line or explicit title
  content: string;      // Full markdown content
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}

// Storage key
const NOTES_STORAGE_KEY = "gquick-notes";
```

---

## Responsive Behavior

The view is contained within the fixed 680px window. No breakpoints needed. The note list uses the full available width with comfortable padding.

---

## Accessibility

- **Role**: `region` with `aria-label="Notes list"`
- **Note cards**: `role="listitem"`, each card is focusable
- **Edit mode**: Textarea has `aria-label="Note content"`, title input has `aria-label="Note title"`
- **Delete confirmation**: Uses `role="alert"` to announce to screen readers
- **Live region**: "X notes found" announced when searching

---

## Animation Specs

| Interaction | Animation |
|-------------|-----------|
| Enter notes view | Fade in opacity 0→1 over 150ms |
| Note card hover | `transition-all duration-75`, bg fade |
| Edit mode expand | Height auto-transition via grid-template-rows or immediate (no animation preferred for textarea) |
| Note saved | Brief green flash on card border |
| Note deleted | Card opacity 1→0 over 150ms, then remove from DOM |
| New note created | New card appears at top with subtle slide-in |

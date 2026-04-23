# Mockup: Search Bar Quick Capture

## Overview

When the user types `note: ` (case-insensitive) into the main GQuick search bar, the interface switches from "search mode" to "note capture mode." The search results list is replaced by a live note preview that the user can submit with Enter to save instantly.

## Trigger

Prefix match on `note:` or `note: ` in the search query (case-insensitive, trim whitespace).

---

## Layout Diagram

### State A: User types `note:`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  note:                                                    │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [StickyNote icon]  Create a new note                           │   │
│  │                     Type your note content after "note: "       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Open    ⌘ K Actions                                         GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### State B: User types `note: Remember to call John tomorrow`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [StickyNote]  note: Remember to call John tomorrow                     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [StickyNote icon]  Remember to call John tomorrow              │   │
│  │                     Press Enter to save as a quick note         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Save Note   ⌘ K Actions                                     GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### State C: After hitting Enter — Note Saved

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Search]                                                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  [CheckCircle icon]  Note saved                                 │   │
│  │                      "Remember to call John tomorrow"           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Open    ⌘ K Actions                                         GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

The search bar clears after 800ms and returns to idle search state. The window may optionally auto-hide.

---

## Component Specification

### Note Capture Result Item

This replaces the standard `SearchResultItem` layout when `note:` prefix is detected.

```
Container:
  - className: "group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-75 bg-white/10 ring-1 ring-white/10 shadow-lg"
  - Only one item shown (no list scrolling needed)

Icon Container:
  - className: "flex h-9 w-9 items-center justify-center rounded-lg border bg-zinc-800 border-white/20 text-yellow-400"
  - Icon: StickyNote from lucide-react
  - Size: h-5 w-5

Text Content:
  - className: "flex flex-col flex-1 min-w-0"
  - Title:
    - className: "text-[14px] font-medium text-zinc-100 truncate"
    - Content: The text after "note: " (trimmed), or "Create a new note" if empty
  - Subtitle:
    - className: "text-[11px] text-zinc-500 truncate"
    - Content: "Press Enter to save" (if text present) or "Type your note content after 'note: '"

Right Side:
  - className: "flex items-center transition-opacity duration-200 opacity-100"
  - Icon: CornerDownLeft (h-4 w-4 text-zinc-400)
  - Label: "Save" (text-[11px] text-zinc-400 ml-1)
```

### Empty Content State

When the user types `note:` but nothing after it:

```
Title:    "Create a new note"
Subtitle: "Type your note content after 'note: '"
Icon:     StickyNote (text-yellow-400/60)
```

The item is still selectable but does nothing on Enter (or shows a subtle shake animation indicating content is needed).

---

## Styling Details

| Property | Value | Notes |
|----------|-------|-------|
| Background (active) | `bg-white/10` | Same as selected search result |
| Ring | `ring-1 ring-white/10` | Focus border |
| Icon color | `text-yellow-400` | Notes brand color (distinct from blue AI, purple smart search) |
| Icon bg (active) | `bg-zinc-800` | Same as active search results |
| Title | `text-[14px] font-medium text-zinc-100` | Standard result title |
| Subtitle | `text-[11px] text-zinc-500` | Standard result subtitle |

---

## Interaction Flow

```
User opens GQuick
        │
        ▼
User types "note: " (with or without content)
        │
        ▼
┌─────────────────────────────┐
│ Detect "note:" prefix       │
│ Set noteCaptureMode = true  │
│ Suppress other plugins      │
└─────────────────────────────┘
        │
        ▼
Show single capture preview item
        │
        ▼
User continues typing ──► Live update title with typed content
        │
        ▼
User presses Enter
        │
        ▼
┌─────────────────────────────┐
│ Trim "note:" prefix         │
│ Generate note ID (timestamp)│
│ Save to localStorage:       │
│   gquick-notes (JSON array) │
│ Each note: {                │
│   id: string,               │
│   content: string,          │
│   createdAt: ISO string,    │
│   updatedAt: ISO string     │
│ }                           │
└─────────────────────────────┘
        │
        ▼
Show "Note saved" confirmation
        │
        ▼
Clear search bar after 800ms
Return to idle search state
```

---

## Keyboard Behavior

| Key | Behavior |
|-----|----------|
| `Enter` | Save note (if content exists after prefix) |
| `Escape` | Cancel capture, clear input, return to search |
| `ArrowUp/Down` | No-op (only one item) |
| `Backspace` to remove `note:` | Exit capture mode, restore normal search |

---

## Confirmation State

After saving, briefly show a confirmation item before clearing:

```
Container: Same dimensions as capture item
Icon: CheckCircle (h-5 w-5 text-green-400)
Icon bg: bg-zinc-800 border-white/20
Title: "Note saved" (text-zinc-100)
Subtitle: Truncated note content preview (text-zinc-500)
Duration: 800ms
Transition: opacity fade-out over last 300ms
```

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty content after `note:` | Show placeholder item, Enter does nothing or shakes |
| Only whitespace after `note:` | Treat as empty, strip whitespace before saving |
| Very long note (>500 chars) | Truncate title in preview, show `...`, full content saved |
| `note:` mid-word (e.g., "keynote:") | Only trigger when `note:` is at start of query |
| Multiple `note:` prefixes | Use first occurrence, rest is content |
| Window hidden during typing | Content lost (same as regular search) |

---

## Accessibility

- **Screen reader**: When `note:` is detected, announce "Note capture mode. Type your note and press Enter to save."
- **Focus**: Input remains focused; the capture item is decorative and does not steal focus.
- **ARIA**: No special ARIA needed beyond existing input labeling.

---

## Notes on Markdown

The quick capture mode accepts raw text. Markdown formatting can be included but is **not rendered** in the preview — it is saved as-is and rendered only in the management view and AI chat context. The preview shows raw markdown characters (e.g., `**bold**` appears literally).

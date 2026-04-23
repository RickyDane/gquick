# Design Specs: GQuick Notes Plugin

## Overview

This document defines the shared design tokens, component styles, and animation specifications for the GQuick Notes plugin. All values are derived from the existing GQuick design system to ensure visual consistency.

---

## Color Palette

### Notes Brand Color

| Token | Value | Usage |
|-------|-------|-------|
| `notes-primary` | `text-yellow-400` | Note icons, active states, highlights |
| `notes-primary-dim` | `text-yellow-500/60` | Subtle icons, inactive indicators |
| `notes-bg` | `bg-yellow-500/5` | Context banners, subtle backgrounds |
| `notes-border` | `border-yellow-500/10` | Context banner borders |
| `notes-hover` | `hover:bg-yellow-500/10` | Context banner hover state |
| `notes-highlight` | `bg-yellow-500/20 text-yellow-200` | Search match highlighting |
| `notes-accent` | `bg-yellow-600/80` | Save buttons, primary actions |
| `notes-accent-hover` | `hover:bg-yellow-500` | Save button hover |

### Base Palette (Existing GQuick)

| Token | Value | Usage |
|-------|-------|-------|
| `bg-window` | `bg-zinc-900/95` | Main window background |
| `bg-panel` | `bg-white/5` | Card backgrounds, sections |
| `bg-input` | `bg-zinc-800` | Form inputs, textareas |
| `bg-hover` | `hover:bg-white/5` | List item hover |
| `bg-active` | `bg-white/10` | Selected/active item |
| `border-subtle` | `border-white/5` | Dividers, subtle borders |
| `border-default` | `border-white/10` | Card borders, input borders |
| `border-active` | `border-white/20` | Active icon container border |
| `text-primary` | `text-zinc-100` | Headings, primary text |
| `text-secondary` | `text-zinc-200` | Body text in chat bubbles |
| `text-muted` | `text-zinc-400` | Secondary text, icons |
| `text-faint` | `text-zinc-500` | Subtitles, timestamps |
| `text-fainter` | `text-zinc-600` | Extra-muted text |
| `accent-blue` | `text-blue-400` | AI chat, active actions |
| `accent-blue-bg` | `bg-blue-600` | Primary buttons |

---

## Typography

| Element | Size | Weight | Color | Line Height |
|---------|------|--------|-------|-------------|
| Window title / Input | `text-lg` | 400 | `text-zinc-100` | 1.25 |
| Result title | `text-[14px]` | 500 | `text-zinc-100` | 1.4 |
| Result subtitle | `text-[11px]` | 400 | `text-zinc-500` | 1.4 |
| Section label | `text-[11px]` | 700 | `text-zinc-500` | 1 |
| Note preview | `text-[12px]` | 400 | `text-zinc-500` | 1.5 |
| Note content (edit) | `text-sm` / `text-[13px]` | 400 | `text-zinc-200` | 1.6 |
| Chat message | `text-sm` | 400 | `text-zinc-200` | 1.5 |
| Timestamp | `text-[11px]` | 400 | `text-zinc-600` | 1 |
| Button label | `text-xs` | 500 | varies | 1 |
| Empty state title | `text-sm` | 500 | `text-zinc-400` | 1.5 |
| Empty state subtitle | `text-[11px]` | 400 | `text-zinc-500` | 1.5 |
| Context indicator | `text-[11px]` | 400 | `text-yellow-500/70` | 1.4 |

### Font Stack

Use the existing Tailwind default (system font stack). For note editing, optionally use `font-mono` to hint at Markdown support.

```
font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

---

## Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | `4px` | Tight internal gaps |
| `sm` | `8px` | Icon gaps, small padding |
| `md` | `12px` | Card internal padding |
| `lg` | `16px` | Section padding, input padding |
| `xl` | `24px` | Major section margins |
| `2xl` | `32px` | Page-level spacing |

### Component Spacing

| Component | Padding | Gap |
|-----------|---------|-----|
| Search result item | `px-3 py-2.5` | `gap-3` |
| Note card | `p-3` | `gap-1.5` |
| Note card (edit) | `p-3` | `gap-2` |
| Icon container | — | — |
| Header bar | `px-4 py-4` | — |
| Actions menu item | `p-3` | `gap-3` |
| Chat bubble | `px-4 py-2` | — |
| Context banner | `px-3 py-1.5` | `gap-2` |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | `rounded-lg` (`8px`) | Buttons, inputs, icon containers |
| `rounded-md` | `rounded-xl` (`12px`) | Cards, list items, sections |
| `rounded-lg` | `rounded-2xl` (`16px`) | Window, chat bubbles |
| `rounded-full` | `rounded-full` | Avatars, remove buttons |

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-window` | `shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]` | Main window |
| `shadow-active` | `shadow-lg` | Active/selected list item |

---

## Icons (Lucide React)

### Required Icons

```typescript
import {
  StickyNote,   // Note icon (primary brand)
  Plus,         // Create new note
  Trash2,       // Delete note
  Edit2,        // Edit note
  Copy,         // Copy note to clipboard
  Search,       // Search notes
  X,            // Clear search, close, cancel
  Save,         // Save edited note
  Clock,        // Timestamp
  CheckCircle,  // Note saved confirmation
  SearchX,      // No search results
  ChevronDown,  // Expand context indicator
  ChevronUp,    // Collapse context indicator
  CornerDownLeft, // Enter to save hint
} from "lucide-react";
```

### Icon Sizing

| Context | Size | Notes |
|---------|------|-------|
| Header / Input | `h-5 w-5` | Main view icons |
| List item icon | `h-5 w-5` | Inside `h-9 w-9` container |
| Button icon | `h-4 w-4` | Action buttons in header |
| Small action | `h-3.5 w-3.5` | Hover actions on note cards |
| Tiny indicator | `h-3 w-3` | Context banners, timestamps |

### Icon Colors

| Context | Color |
|---------|-------|
| Note (default) | `text-yellow-400` |
| Note (dim) | `text-yellow-400/60` |
| Note (inactive container) | `text-zinc-400` |
| Delete action | `hover:text-red-400` |
| Edit/Copy action | `hover:text-zinc-200` |
| Confirmation | `text-green-400` |
| Empty state | `text-zinc-600` |

---

## Component Specifications

### 1. Icon Container

```css
Standard (inactive):
  - Size: h-9 w-9
  - Display: flex items-center justify-center
  - Background: bg-zinc-900
  - Border: border border-white/5
  - Border-radius: rounded-lg
  - Icon color: text-zinc-400 (context-dependent)

Active:
  - Background: bg-zinc-800
  - Border: border-white/20
  - Icon color: text-yellow-400 (notes) / text-white (generic)
```

### 2. List Item Row

```css
Container:
  - Display: flex items-center (or items-start) gap-3
  - Padding: px-3 py-2.5
  - Border-radius: rounded-xl
  - Cursor: cursor-pointer
  - Transition: transition-all duration-75

Inactive:
  - Hover: hover:bg-white/5

Active:
  - Background: bg-white/10
  - Ring: ring-1 ring-white/10
  - Shadow: shadow-lg
```

### 3. Card / Panel

```css
Container:
  - Background: bg-white/5
  - Border: border border-white/10
  - Border-radius: rounded-xl
  - Padding: p-4 (default), p-3 (compact)
```

### 4. Input / Textarea

```css
Input:
  - Background: bg-zinc-800
  - Border: border border-white/10
  - Border-radius: rounded-xl (or rounded-lg for compact)
  - Padding: px-3 py-2
  - Text: text-sm text-zinc-200
  - Placeholder: placeholder-zinc-500
  - Focus: outline-none focus:border-blue-500/50 (or focus:border-yellow-500/30 for notes)
  - Transition: transition-all

Textarea:
  - Same as input
  - Resize: resize-none
  - Font: font-mono text-[13px] (optional, for Markdown)
```

### 5. Button

```css
Primary (Save):
  - Background: bg-yellow-600/80
  - Hover: hover:bg-yellow-500
  - Text: text-white text-xs font-medium
  - Padding: px-3 py-1.5
  - Border-radius: rounded-lg
  - Transition: transition-colors

Secondary (Cancel):
  - Background: transparent
  - Hover: hover:bg-white/5
  - Text: text-zinc-400 hover:text-zinc-200 text-xs font-medium
  - Padding: px-3 py-1.5
  - Border-radius: rounded-lg

Icon Button:
  - Padding: p-1.5
  - Background: transparent
  - Hover: hover:bg-white/5
  - Border-radius: rounded-lg
  - Icon: h-4 w-4
```

---

## Animation Specifications

### Principles

- Keep animations minimal and fast (≤ 200ms)
- Use `transform` and `opacity` for GPU-accelerated performance
- Respect `prefers-reduced-motion`

### Defined Animations

| Interaction | Duration | Easing | Properties |
|-------------|----------|--------|------------|
| List item hover | 75ms | ease | background-color |
| Active item ring | 75ms | ease | box-shadow, ring |
| View transition | 150ms | ease-out | opacity |
| Context indicator appear | 200ms | ease-out | opacity, transform (translateY -2px) |
| Note card delete | 150ms | ease-in | opacity 1→0 |
| Chevron rotate | 200ms | ease | transform rotate |
| Button hover | 150ms | ease | background-color, color |
| Input focus | 150ms | ease | border-color |
| Toast / confirmation | 800ms total | — | 500ms visible + 300ms fade-out |

### CSS Utility Classes

```css
/* If using Tailwind animate plugin or custom */
.animate-fade-in {
  animation: fadeIn 150ms ease-out;
}

.animate-fade-out {
  animation: fadeOut 150ms ease-in forwards;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Z-Index Stack

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Window | — | Fixed position container |
| Content | 0 | Normal flow |
| Sticky header | 10 | Search input bar |
| Active item | 0 (elevated via shadow) | No z-index needed |
| Tooltip | 50 | Hover tooltips |
| Overlay / Modal | 100 | Future modal dialogs |

---

## Responsive Considerations

GQuick uses a fixed `w-[680px]` window. No responsive breakpoints are needed. However, components should:

- Use `min-w-0` and `truncate` to prevent text overflow
- Use `flex-1` for flexible content areas
- Keep image/media max-widths within `max-w-[85%]` of bubble or `280px` for standalone

---

## Accessibility Checklist

### Keyboard

- [ ] All interactive elements are keyboard-accessible
- [ ] `Tab` order follows visual flow
- [ ] `Enter` activates buttons and links
- [ ] `Escape` cancels/closes
- [ ] Arrow keys navigate lists

### Focus

- [ ] Focus indicators are visible (`focus-visible:ring-2 focus-visible:ring-blue-500/50`)
- [ ] Focus does not get trapped unexpectedly

### Screen Readers

- [ ] Icons have `aria-label` or are `aria-hidden` with text alternative
- [ ] Dynamic content uses `aria-live` regions
- [ ] Buttons have descriptive labels

### Contrast

- [ ] Text on backgrounds meets WCAG AA (4.5:1 for normal text)
- [ ] `text-zinc-100` on `bg-zinc-900/95` — ~15:1 ✅
- [ ] `text-zinc-400` on `bg-zinc-900/95` — ~7:1 ✅
- [ ] `text-zinc-500` on `bg-zinc-900/95` — ~5:1 ✅
- [ ] `text-yellow-400` on `bg-zinc-900/95` — ~10:1 ✅

---

## File Structure (Implementation Reference)

```
src/
├── plugins/
│   ├── notes.tsx           # Plugin metadata + getItems for search integration
│   └── types.ts            # (existing) Add Note to types if needed
├── components/
│   └── NotesView.tsx       # Dedicated notes management view component
├── utils/
│   └── notes.ts            # Notes storage, search, CRUD utilities
└── App.tsx                 # Add "notes" view state + note: detection
```

---

## Implementation Priority

1. **P0**: `note:` quick capture (search bar prefix)
2. **P0**: Notes storage utility (`localStorage` CRUD)
3. **P1**: Notes management view (dedicated UI)
4. **P1**: `search notes:` search integration
5. **P2**: AI chat context injection with indicator
6. **P2**: Keyboard shortcuts (`⌘N`, `⌘Enter` save)

---

*This specification is ready for implementation by the Software Engineer subagent.*

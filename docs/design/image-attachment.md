# Design Specification: Image Attachment for GQuick Chat

## Overview

This specification adds image attachment support to the GQuick AI chat interface. The design maintains the existing dark, translucent aesthetic (`bg-zinc-900/95`, `bg-white/5`, `border-white/10`) and integrates seamlessly with the current 680px-wide floating window layout.

## Icon Recommendations (Lucide React)

| Purpose | Icon | Rationale |
|---------|------|-----------|
| Attach image button | `ImagePlus` | Clearly communicates "add image" vs generic clip |
| Remove attachment | `X` | Simple, consistent with existing UI patterns |
| Image placeholder / error | `Image` | Fallback when image fails to load |
| Pasting indicator | `Loader2` | Already used in codebase for loading states |

```typescript
import { ImagePlus, X, Image, Loader2 } from "lucide-react";
```

## 1. Visual Layout: Chat Input Area with Attachment Button

### Positioning
The attachment button sits **immediately to the left** of the existing send button in the top input row. This keeps input-related actions grouped together and follows natural left-to-right flow: type → attach → send.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [MessageSquare] [Model Badge]  Ask GQuick anything...          [📎] [➤] │
│                                                                         │
│  ──── Attachment Preview Strip (conditional, see §2) ─────────────────  │
│                                                                         │
│  ┌──────────┐                                                           │
│  │ G        │  Hello! How can I help?                                    │
│  └──────────┘                                                           │
│                                                               ┌────────┐│
│                                         Here's my screenshot  │ User   ││
│                                         [IMG]                 └────────┘│
│                                                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Button Styling

```
- Size: h-8 w-8 (32px), same height as send button for alignment
- Background: transparent (hover: bg-white/5)
- Border: none
- Icon: ImagePlus, h-4 w-4
- Icon color: text-zinc-400 (hover: text-zinc-200)
- Border-radius: rounded-lg
- Cursor: pointer
- Transition: transition-colors duration-150
- Disabled: opacity-50, cursor-not-allowed (same as send button)
```

### Interaction
- **Click**: Opens native file picker (`<input type="file" accept="image/*" multiple hidden />`)
- **Hover**: Icon lightens to `text-zinc-200`, subtle `bg-white/5` background appears
- **Disabled state**: When `isLoading` is true, both attach and send buttons are disabled

## 2. Image Thumbnail Preview (Before Sending)

### Position
A **horizontal scrollable strip** appears directly below the input header (`border-b border-white/5`), between the input bar and the messages area. This placement keeps attachments visually connected to the pending message.

### Container Specifications

```
- Background: bg-zinc-950/30 (subtly darker than messages area)
- Border-bottom: border-white/5 (separates from messages)
- Padding: px-4 py-2
- Layout: flex flex-row gap-2 overflow-x-auto
- Scrollbar: hidden (scrollbar-hide or overflow-x-auto with thin scrollbar)
- Max-height: 72px (accommodates 48px thumbnails + padding)
- Animation: animate-in slide-in-from-top-2 duration-200 when appearing
```

### Thumbnail Specifications

```
- Size: h-12 w-12 (48px) — large enough to identify content, small enough to not dominate
- Border-radius: rounded-lg
- Border: border border-white/10
- Object-fit: object-cover
- Background: bg-zinc-800 (placeholder while loading)
```

### Remove Button (Per Thumbnail)

```
- Position: absolute, top-[-6px], right-[-6px] (overlapping top-right corner)
- Size: h-4 w-4 (16px)
- Background: bg-zinc-900
- Border: border border-white/20
- Border-radius: rounded-full
- Icon: X, h-2.5 w-2.5
- Icon color: text-zinc-400 (hover: text-zinc-100)
- Hover: bg-zinc-800, border-white/40
- Click: Removes image from attachment array immediately
```

### Overflow Behavior
When more images are attached than fit in the strip:
- Horizontal scroll with `overflow-x-auto`
- No visible scrollbar (macOS-style hidden scrollbar)
- Subtle gradient fade on right edge when scrollable: `bg-gradient-to-l from-zinc-950/30 to-transparent` on an overlay div

### Empty State
When all attachments are removed, the strip container collapses with `animate-out slide-out-to-top-2 duration-150` (or immediate removal if animation library unavailable).

## 3. Image Display in Sent Messages

### User Messages with Images

User messages currently use:
```
bg-blue-600/10, text-blue-100, border-blue-500/20, max-w-[85%]
```

**Updated structure for image messages:**
```
<div class="rounded-2xl px-4 py-2 text-sm max-w-[85%] border bg-blue-600/10 text-blue-100 border-blue-500/20">
  {textContent && <p>{textContent}</p>}
  {images.length > 0 && (
    <div class="grid gap-2 mt-2">
      {images.map(img => <img ... />)}
    </div>
  )}
</div>
```

#### Image Grid Layout in User Messages

| Image Count | Layout |
|-------------|--------|
| 1 | Full width of bubble, max-w-[280px] |
| 2 | `grid-cols-2`, equal split |
| 3+ | `grid-cols-2` with last item spanning if odd (or 3-col for 3+) |

#### Image Styling in Messages

```
- Max-width: 280px (single) / 140px each (multi)
- Border-radius: rounded-lg
- Border: border border-blue-500/20 (subtle blue tint matching bubble)
- Object-fit: object-cover
- Aspect-ratio: auto (natural) or constrained to max-h-[200px]
- Hover: cursor-zoom-in (future: click to expand)
```

### Assistant Messages with Images

The assistant bubble uses:
```
bg-white/5, text-zinc-200, border-white/5, max-w-[85%]
```

When the AI responds with image content (e.g., generated images, markdown images), they render with:
```
- Same grid layout as user messages
- Border: border border-white/10 (neutral, matching bubble)
- Max-width: 320px (assistant gets slightly more space)
```

For inline markdown images (`![alt](url)`), the `MarkdownMessage` component should render them with:
```
- Max-width: 100% of bubble width
- Border-radius: rounded-lg
- Margin: my-2
- Border: border border-white/10
```

### Message Structure Update

The `Message` interface should support optional attachments:
```typescript
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs or blob URLs
}
```

## 4. Paste Interaction Flow

### Trigger
- **Keyboard**: `Ctrl+V` (Windows/Linux) or `Cmd+V` (macOS) anywhere in the chat view
- **Target**: The entire chat view container captures paste events when focused

### Flow Diagram

```
User presses Ctrl/Cmd+V
        │
        ▼
┌─────────────────────────────┐
│ Check clipboard for images  │
│ (e.clipboardData.files)     │
└─────────────────────────────┘
        │
    ┌───┴───┐
    ▼       ▼
  Images   Text only
    │       │
    ▼       ▼
Validate   Insert at
(type,     cursor position
 size)     (existing behavior)
    │
    ▼
Show toast/
indicator:
"Image pasted"
    │
    ▼
Add to attachment
preview strip
    │
    ▼
User clicks Send
    │
    ▼
Images + text sent
together as one message
```

### Validation Rules

| Rule | Behavior |
|------|----------|
| File type | Accept: `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Reject others silently |
| File size | Max 5MB per image. Reject with brief inline error (red dot on thumbnail) |
| Max attachments | 5 images per message. Additional pastes ignored with brief toast |
| Duplicate detection | Compare file name + size; skip duplicates silently |

### Paste Indicator
When an image is successfully read from clipboard:
- Brief flash of the attachment button: `text-blue-400` for 200ms
- If attachment strip is not visible, it animates in
- No blocking modal or heavy UI — keep it lightweight

## 5. Responsive Considerations

### Container Constraints
The GQuick window is fixed at `w-[680px]`. Image sizing must respect this:

```
Window width: 680px
- Padding: 32px (16px each side in messages)
- Avatar + gap: ~44px
- Available bubble width: ~600px
- max-w-[85%] on bubble: ~510px
```

### Image Size Limits

| Context | Max Width | Max Height | Notes |
|---------|-----------|------------|-------|
| Thumbnail preview | 48px | 48px | Fixed square, object-cover |
| Single image in message | 280px | 200px | User message |
| Single image in message | 320px | 240px | Assistant message |
| Grid image (2-col) | 130px each | 130px | Square crop |
| Grid image (3-col) | 100px each | 100px | For dense layouts |

### Scroll Behavior

**Messages container:**
```
- flex-1 overflow-y-auto (existing)
- When images are attached, scroll-to-bottom on send (existing behavior with chatEndRef)
```

**Attachment strip:**
```
- overflow-x-auto
- Scroll snapping: snap-x snap-mandatory (optional polish)
- Thumbnail: snap-start
```

**Long images (tall screenshots):**
- Limit max-height to 200px in messages
- `overflow: hidden` with `object-cover` to crop
- Future enhancement: click to expand in overlay

### Window Resize
Since the window is fixed-width (680px), no responsive breakpoints needed. However, if the window width ever changes:
- Images scale proportionally within their containers
- Grid collapses from 3-col → 2-col → 1-col based on available width

## 6. Accessibility

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `Tab` | Focus attach button → focus input → focus send button |
| `Shift+Tab` | Reverse navigation |
| `Enter` / `Space` | Activate attach button (opens file picker) |
| `Delete` / `Backspace` | When thumbnail is focused, remove it |
| `Arrow Left/Right` | Navigate between thumbnails when strip is focused |

### Screen Reader Support

```
- Attach button: aria-label="Attach image" role="button"
- Thumbnail: aria-label="Image [filename], press Delete to remove" role="img"
- Remove button: aria-label="Remove image" role="button"
- Attachment strip: aria-label="Attached images" role="region" aria-live="polite"
- File input: sr-only, labeled "Image file input"
```

### Focus States
```
- Attach button: focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900
- Thumbnail: focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:rounded-lg
- Remove button: focus-visible:ring-2 focus-visible:ring-red-500/50
```

## 7. Animation & Micro-interactions

| Interaction | Animation |
|-------------|-----------|
| Attachment strip appears | `animate-in slide-in-from-top-2 fade-in duration-200` |
| Thumbnail added to strip | `animate-in zoom-in-95 fade-in duration-150` |
| Thumbnail removed | `animate-out zoom-out-95 fade-out duration-150` |
| Image send (transition to message) | Cross-fade from thumbnail to message image over 200ms |
| Paste success | Attachment button icon flashes `text-blue-400` for 200ms |
| Hover on thumbnail | Scale to 1.05, ring-2 ring-white/20 |
| Hover on remove button | Scale to 1.1, background lightens |

> **Note**: If `framer-motion` or similar is not in the project, use Tailwind's `transition-all` with custom keyframes or simple opacity/transform transitions.

## 8. Error States

| Error | Visual Treatment |
|-------|-----------------|
| Invalid file type | Thumbnail shows broken image icon (`Image` from Lucide) with red border `border-red-500/50` |
| File too large | Thumbnail with warning overlay, tooltip on hover: "Max 5MB" |
| Too many images | 6th+ image paste ignored; brief `text-zinc-400` toast: "Max 5 images" |
| Image load fail | Fallback to `Image` icon with `text-zinc-500` |

## 9. Implementation Summary

### DOM Structure (Chat View)

```jsx
<div className="flex flex-col h-[300px]">
  {/* Messages area — flex-1 to fill remaining space */}
  <div className="flex-1 overflow-y-auto p-4 space-y-6">
    {messages.map(msg => (
      <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}>
        {/* Avatar */}
        <div className="...">{msg.role === "assistant" ? "G" : <User />}</div>
        {/* Bubble with optional images */}
        <div className="...">
          {msg.content && <p>{msg.content}</p>}
          {msg.images?.length > 0 && (
            <div className={cn("grid gap-2 mt-2", msg.images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {msg.images.map(img => (
                <img src={img} className="rounded-lg border border-white/10 object-cover max-h-[200px]" />
              ))}
            </div>
          )}
        </div>
      </div>
    ))}
    <div ref={chatEndRef} />
  </div>
</div>
```

### Input Header Modification

The existing header row gains the attach button:

```jsx
{view === "chat" ? (
  <>
    <button // Attach
      onClick={() => fileInputRef.current?.click()}
      disabled={isLoading}
      className="p-1.5 hover:bg-white/5 disabled:opacity-50 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
      aria-label="Attach image"
    >
      <ImagePlus className="h-4 w-4" />
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      className="sr-only"
      onChange={handleFileSelect}
    />
    <button // Send (existing)
      onClick={handleSendMessage}
      disabled={isLoading}
      className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-white transition-colors"
    >
      <Send className="h-4 w-4" />
    </button>
  </>
) : (...)
```

## 10. Design Principles Applied

1. **Clarity**: The `ImagePlus` icon universally signals image attachment. Thumbnails give immediate visual confirmation of what's being sent.
2. **Efficiency**: Paste support (Ctrl/Cmd+V) allows zero-click attachment from screenshots. Remove buttons are one-click and always visible on hover.
3. **Feedback**: Thumbnails appear instantly. The attachment strip's appearance/disappearance clearly signals state changes.
4. **Consistency**: All colors, borders, and radii match existing design tokens (`bg-white/5`, `border-white/10`, `rounded-lg`, `rounded-2xl`).
5. **Accessibility**: Full keyboard navigation, ARIA labels, and focus-visible states ensure the feature works for all users.

---

*This specification is ready for implementation by the Software Engineer subagent.*

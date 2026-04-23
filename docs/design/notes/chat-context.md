# Mockup: AI Chat Context Injection

## Overview

When a user asks the AI something that seems note-related, GQuick automatically injects relevant notes as context into the chat prompt. The user sees a subtle, non-intrusive indicator that notes were included, with the option to inspect exactly which notes were used.

This is a **passive, transparent** feature — it should never surprise the user or feel like hidden behavior.

---

## Detection Logic

When a chat message is sent, GQuick performs a lightweight client-side check:

```typescript
function isNoteRelatedQuery(query: string): boolean {
  const noteKeywords = [
    "note", "notes", "remember", "reminder",
    "wrote down", "saved", "my note", "my notes",
    "did i write", "what did i note", "find my note"
  ];
  const lower = query.toLowerCase();
  return noteKeywords.some(kw => lower.includes(kw));
}
```

If `isNoteRelatedQuery` returns true:
1. Search notes for relevant content (simple keyword overlap or semantic similarity)
2. Inject top 3-5 matching notes into the system prompt or user message context
3. Show the context indicator in the UI

---

## Layout Diagram

### Chat View — With Notes Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [MessageSquare]  Ask GQuick anything...                        [Send]  │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  G        Hello! I'm GQuick. I'm ready to help you with         │   │
│  │           anything.                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ──── Context Indicator ─────────────────────────────────────────────  │
│                                                                         │
│  ┌──────────┐                                                           │
│  │ User     │  What did I note about the project deadline?              │
│  └──────────┘                                                           │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  📎 Context: 2 notes used                                       │   │
│  │      [StickyNote] Project Deadline — "Move launch to March..."  │   │
│  │      [StickyNote] Standup Notes — "Discussed timeline with..."  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  G        Based on your notes, you mentioned that the launch    │   │
│  │           date was moved to March 15th. You also noted in       │   │
│  │           standup that the team discussed the timeline...       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  ↵ Send   ⌘ R Clear   ⌘ K Actions                              GQuick │
└─────────────────────────────────────────────────────────────────────────┘
```

### Expanded Context Indicator

```
Before expand (collapsed):
┌──────────────────────────────────────────────────────────────────────┐
│  📎 Context: 2 notes used  [ChevronDown]                              │
└──────────────────────────────────────────────────────────────────────┘

After expand:
┌──────────────────────────────────────────────────────────────────────┐
│  📎 Context: 2 notes used  [ChevronUp]                                │
│  ───────────────────────────────────────────────────────────────────  │
│  [StickyNote] Project Deadline                                        │
│  "Move launch to March 15th. Need to inform marketing team."          │
│                                                                       │
│  [StickyNote] Standup Notes                                           │
│  "Discussed timeline with Sarah. She's confident about the Q1..."     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Specification

### Context Indicator (Collapsed)

Appears **between the user message and the AI response**, as a thin banner:

```
Container:
  - className: "mx-4 my-2 px-3 py-1.5 rounded-lg bg-yellow-500/5 border border-yellow-500/10 flex items-center gap-2 cursor-pointer hover:bg-yellow-500/10 transition-colors"
  - Role: button (click to expand)
  - aria-label: "2 notes used as context. Click to expand."

Icon:
  - Paperclip or StickyNote (h-3 w-3 text-yellow-500/60)
  - Alternative: Sparkles (h-3 w-3) if AI-ranked

Text:
  - className: "text-[11px] text-yellow-500/70"
  - Content: "Context: X note(s) used"

Chevron:
  - ChevronDown (h-3 w-3 text-yellow-500/40)
  - Rotates to ChevronUp when expanded
```

### Context Indicator (Expanded)

```
Container:
  - className: "mx-4 my-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10 overflow-hidden"

Header (same as collapsed, now non-interactive or toggles collapse):
  - className: "px-3 py-1.5 flex items-center gap-2 border-b border-yellow-500/10"

Note List (px-3 py-2 space-y-2):
  Each note item:
    - className: "flex items-start gap-2"
    Icon: StickyNote (h-3 w-3 text-yellow-500/50 shrink-0 mt-0.5)
    Content:
      - className: "text-[11px] text-zinc-400 leading-relaxed"
      - Title line: "Note Title" (text-zinc-300 font-medium)
      - Preview: First 100 chars of content, truncated with "..."
```

### Where to Place the Indicator

**Option A (Recommended): Between messages**

```
User message
↓
[Context indicator]
↓
AI response (streaming in)
```

This makes it clear the notes were used for the *upcoming* response.

**Option B: Inside AI response bubble**

A small footer inside the assistant bubble. Less intrusive but harder to notice.

> **Decision**: Use Option A. It provides the best transparency without cluttering the AI's actual response content.

---

## Prompt Injection Strategy

The notes are injected into the system message context, not shown as user-visible text:

```typescript
const relevantNotes = findRelevantNotes(userQuery); // top 3-5

const systemContent = `You are GQuick, a helpful AI assistant. ...

The user has saved notes. Here are relevant notes for this query:
${relevantNotes.map((n, i) => `
[Note ${i + 1}] ${n.title}:
${n.content}`).join("\n")}

Use these notes to answer the user's question. If the notes don't contain relevant information, say so.`;
```

This keeps the UI clean while giving the AI full context.

---

## User Control & Transparency

### Opt-out (Future Enhancement)

Add a Settings toggle:

```
Section: AI Integration
Toggle: "Include notes in AI context"
Default: ON
```

### Manual Override

User can type `ignore notes` or `without notes` to skip injection for a single message.

### Explicit Request

User can type `use notes about [topic]` to force note inclusion even if detection misses it.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| No relevant notes found | No indicator shown; AI responds normally |
| Notes exist but query isn't note-related | No injection, no indicator |
| Empty notes database | Skip detection entirely |
| Very long notes | Truncate to 500 chars each in prompt to stay within token limits |
| Multiple consecutive note-related queries | Re-evaluate relevance each time; may use same or different notes |
| User deletes a note that was used | Future queries won't include it; past context remains in chat history |

---

## Styling Summary

| Element | Class |
|---------|-------|
| Container | `bg-yellow-500/5 border border-yellow-500/10 rounded-lg` |
| Hover | `hover:bg-yellow-500/10` |
| Text | `text-[11px] text-yellow-500/70` |
| Note title in expanded | `text-[11px] text-zinc-300 font-medium` |
| Note preview in expanded | `text-[11px] text-zinc-400` |
| Icon | `text-yellow-500/60` |

The yellow tint is intentionally subtle — it should feel like a gentle hint, not a loud banner.

---

## Animation

| Interaction | Animation |
|-------------|-----------|
| Indicator appears | `animate-in slide-in-from-top-1 fade-in duration-200` |
| Expand/collapse | Height transition 200ms ease-out, or instant toggle |
| Chevron rotation | `transform rotate-180 transition-transform duration-200` |

---

## Accessibility

- **Screen reader**: When context is injected, announce "X relevant notes included in context." The expand button provides full note previews.
- **Focus**: The context banner is focusable with `tabindex="0"`. Pressing Enter toggles expand/collapse.
- **Color**: Yellow on dark is visible but not the only indicator — the icon and text provide redundant cues.

# Code Review Findings: Search Suggestions Feature

## [MAJ-001] Unstable callbacks cause unnecessary re-renders

**Severity:** Major
**Location:** `src/App.tsx:1183–1190`

### Description
`handleSelectQuery` and `handleOpenView` are plain inline functions. On every `App` re-render (keystrokes, chat streaming, state changes), new function references are created and passed to `SearchSuggestions`. This forces `SearchSuggestions` to re-render even when `viewMode` and the logical handlers haven't changed.

### Evidence
```tsx
const handleSelectQuery = (q: string) => { setQuery(q); inputRef.current?.focus(); };
const handleOpenView = (v: "chat" | "notes" | "docker" | "settings" | "actions") => { setView(v); };
```

### Impact
- `SearchSuggestions` re-renders on every parent render cycle (e.g., every character typed in the search input, every chat token streamed).
- Wastes CPU cycles and can cause jank in a performance-sensitive launcher UI.

### Recommendation
Wrap both handlers in `useCallback` with stable dependency arrays:
```tsx
const handleSelectQuery = useCallback((q: string) => {
  setQuery(q);
  inputRef.current?.focus();
}, []);

const handleOpenView = useCallback((v: SuggestionView) => {
  setView(v);
}, []);
```
Also consider wrapping `SearchSuggestions` in `React.memo` so it only re-renders when `viewMode` actually changes.

---

## [MAJ-002] Plugin with missing keyword sets query to single space

**Severity:** Major
**Location:** `src/components/SearchSuggestions.tsx:57,61`

### Description
When a plugin has no keywords (`plugin.metadata.keywords[0]` is undefined), the fallback `|| ""` produces an empty string, and `onSelectQuery` is invoked with `" "`. A single-space query is truthy, so it triggers the full search pipeline.

### Evidence
```tsx
const keyword = plugin.metadata.keywords[0] || "";
// ...
onClick={() => onSelectQuery(keyword + " ")}
```

### Impact
- Clicking a plugin with no keywords executes a search for `" "`, likely showing "No results found for ' '". This is a broken user experience.
- Wastes a search cycle and may flash an empty-results state.

### Recommendation
Guard the click or skip the trailing space when the keyword is empty:
```tsx
const keyword = plugin.metadata.keywords[0];
// ...
onClick={() => onSelectQuery(keyword ? keyword + " " : "")}
```
Alternatively, disable the button or filter out plugins with no keywords if they shouldn't be clickable.

---

## [WARN-001] Unconditional container alters empty-search layout

**Severity:** Warning
**Location:** `src/App.tsx:1683`

### Description
The content container (`<div className="min-h-[40px] flex-1 overflow-hidden">`) is now unconditional. Previously it was absent when `view === "search" && !query`, so the footer sat directly below the search bar. Now `flex-1` pushes the footer to the bottom of the window even when the SearchSuggestions list is short.

### Evidence
```tsx
<div className={cn("min-h-[40px] flex-1 overflow-hidden", view === "docker" && "min-h-0")}>
  {/* Always renders something, including SearchSuggestions in empty-search state */}
</div>
```

### Impact
- Visual layout change: empty-search state now occupies full launcher height instead of being compact.
- May look odd if the user expects a minimal empty state.

### Recommendation
Verify this is the intended design. If a compact empty state is desired, consider conditionally removing `flex-1` or wrapping `SearchSuggestions` in a non-flex container when in empty-search mode.

---

## [WARN-002] Missing `type="button"` on interactive buttons

**Severity:** Warning
**Location:** `src/components/SearchSuggestions.tsx:33,59`

### Description
The `<button>` elements for quick actions and plugins do not specify `type="button"`. If `SearchSuggestions` is ever rendered inside a `<form>`, these buttons will submit the form.

### Evidence
```tsx
<button onClick={() => onOpenView(action.view)} ...>
<button onClick={() => onSelectQuery(keyword + " ")} ...>
```

### Recommendation
Add `type="button"` to all interactive buttons as a defensive practice.

---

## [WARN-003] No empty state for plugins section

**Severity:** Warning
**Location:** `src/components/SearchSuggestions.tsx:50–81`

### Description
If the `plugins` array is empty, the "Plugins" heading still renders with zero items underneath. There is no indication that no plugins are installed or that the list is empty.

### Evidence
```tsx
<h3 ...>Plugins</h3>
<div ...>
  {plugins.map((plugin) => (
    // renders nothing when plugins.length === 0
  ))}
</div>
```

### Recommendation
Either conditionally hide the entire Plugins section when `plugins.length === 0`, or render a small "No plugins available" placeholder.

---

## [NIT-001] Extract shared suggestion-view union type

**Severity:** Nit
**Location:** `src/components/SearchSuggestions.tsx:8`, `src/App.tsx:1188`

### Description
The literal union `"chat" | "notes" | "docker" | "settings" | "actions"` is defined inline in both `SearchSuggestionsProps` and `App.tsx`. This is prone to drift if views are added or renamed.

### Recommendation
Extract a shared type in `src/plugins/types.ts` or a new utility file:
```ts
export type SuggestionView = "chat" | "notes" | "docker" | "settings" | "actions";
```

---

## [NIT-002] Missing focus-visible styles

**Severity:** Nit
**Location:** `src/components/SearchSuggestions.tsx:36,62`

### Description
Buttons only define `hover:bg-white/10`. Keyboard users navigating with Tab receive no visible focus indication (unless the browser default outline is visible, which is often suppressed globally in Tailwind apps).

### Recommendation
Add explicit focus-visible styles:
```tsx
className={cn(
  "flex items-center gap-3 rounded-xl text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
  // ...
)}
```

---

## [NIT-003] Redundant ternary branch

**Severity:** Nit
**Location:** `src/App.tsx:1969`

### Description
The branch `view === "search" && !query` is the exact logical negation of the preceding `query` branch when `view === "search"`. The `null` fallback is unreachable given the TypeScript type narrowing.

### Evidence
```tsx
) : query ? (
  <div ...>...</div>
) : view === "search" && !query ? (
  <SearchSuggestions ... />
) : null}
```

### Recommendation
Simplify to a two-branch ternary:
```tsx
) : query ? (
  <div ...>...</div>
) : (
  <SearchSuggestions ... />
)}
```

---

## [NIT-004] Magic numbers in styling

**Severity:** Nit
**Location:** `src/components/SearchSuggestions.tsx:23`

### Description
`max-h-[500px]` is an arbitrary Tailwind value. While consistent with the existing search-results container (`App.tsx:1827`), it creates a maintenance burden if the design system changes.

### Recommendation
Consider adding `suggestionsMaxHeight` to the Tailwind config or using a standard Tailwind spacing scale if possible.

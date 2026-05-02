# Code Review Findings: Generic Expanded Window Feature

**Reviewer:** Code Reviewer Agent
**Date:** 2026-05-02
**Files Reviewed:** `src/App.tsx`, `src/index.css`, `src/components/SearchSuggestions.tsx`

---

## [F-001] Back-button navigation hardcodes `view === "docker"` instead of using generic check

**Severity:** Major
**Location:** `src/App.tsx:2114-2116`

### Description
The back-button / settings-toggle logic at the bottom of the component explicitly lists `view === "docker"` alongside other views. Any new view added to `EXPANDED_WINDOW_VIEWS` will **not** be recognized as a "back-able" view, breaking navigation for future expanded views.

### Evidence
```tsx
// Line 2114
onClick={() => setView(view === "settings" || view === "actions" || view === "notes" || view === "docker" ? "search" : "settings")}

// Line 2116
<span>{view === "chat" ? "Search" : view === "settings" || view === "actions" || view === "notes" || view === "docker" ? "Back" : "GQuick"}</span>
```

### Impact
If someone adds e.g. `"logs"` to `EXPANDED_WINDOW_VIEWS`, the back button will show "GQuick" instead of "Back" and clicking it will open settings instead of returning to search. This defeats the purpose of the generic config map.

### Recommendation
Replace the hardcoded list with a helper. For example:

```tsx
const NON_SEARCH_VIEWS = new Set(["settings", "actions", "notes", "docker", "chat"]);
// or better, derive from EXPANDED_WINDOW_VIEWS + known non-search views:
const isNonSearchView = (v: string) => v !== "search";

// Line 2114
onClick={() => setView(isNonSearchView(view) ? "search" : "settings")}

// Line 2116
<span>{view === "chat" ? "Search" : isNonSearchView(view) ? "Back" : "GQuick"}</span>
```

Or even simpler: since `chat` is the only view that shows "Search" instead of "Back", and everything else that isn't "search" should show "Back":

```tsx
onClick={() => setView(view === "search" ? "settings" : "search")}
<span>{view === "search" ? "GQuick" : view === "chat" ? "Search" : "Back"}</span>
```

---

## [F-002] Window resize only triggers on mode change, not on size change within same mode

**Severity:** Minor
**Location:** `src/App.tsx:459-480`

### Description
The resize effect compares `appliedWindowModeRef.current` (which is `"expanded"` or `"launcher"`) against the computed `mode`. If both the old and new view are expanded (e.g. switching from `docker` to `chat`), the early return on line 462 fires and **no resize occurs**, even if the two views have different configured sizes.

### Evidence
```tsx
const expandedSize = getExpandedWindowSize(view);
const mode = expandedSize ? "expanded" : "launcher";
if (appliedWindowModeRef.current === mode) return; // ← skips resize
```

### Impact
Currently both `docker` and `chat` have identical sizes (`1200×860`), so this is harmless today. But if someone configures different sizes (e.g. `chat: { width: 900, height: 700 }`), switching from docker → chat would leave the window at 1200×860.

### Recommendation
Compare the full size, not just the mode string:

```tsx
const expandedSize = getExpandedWindowSize(view);
const size = expandedSize ?? LAUNCHER_WINDOW_SIZE;
const mode = expandedSize ? "expanded" : "launcher";

const prevSize = appliedWindowSizeRef.current;
if (prevSize && prevSize.width === size.width && prevSize.height === size.height) return;
appliedWindowSizeRef.current = size;
appliedWindowModeRef.current = mode;
```

This is a latent bug — low risk now but worth fixing proactively since the whole point of the config map is to support per-view sizes.

---

## [F-003] View type union is manually maintained and decoupled from `EXPANDED_WINDOW_VIEWS`

**Severity:** Minor
**Location:** `src/App.tsx:239`

### Description
The `view` state type is a hardcoded string union:
```tsx
useState<"search" | "chat" | "settings" | "actions" | "notes" | "docker">("search")
```
Adding a new view to `EXPANDED_WINDOW_VIEWS` requires also updating this union, the `handleOpenView` callback type (line 1242), and the `SearchSuggestions` `onOpenView` type (line 10 of `SearchSuggestions.tsx`). These are three separate locations that must stay in sync.

### Impact
Low immediate risk, but creates a maintenance trap. A developer might add a view to the config map and wonder why TypeScript doesn't complain when they try to `setView("newview")`.

### Recommendation
Extract the view type into a shared type alias:
```tsx
type ViewName = "search" | "chat" | "settings" | "actions" | "notes" | "docker";
```
Use it in all three locations. This doesn't eliminate the manual update, but centralizes the source of truth.

---

## [F-004] `handleOpenView` callback type is missing `"search"` (pre-existing)

**Severity:** Minor
**Location:** `src/App.tsx:1242`

### Description
```tsx
const handleOpenView = useCallback((v: "chat" | "notes" | "docker" | "settings" | "actions") => {
```
The `"search"` view is excluded from the union. This is pre-existing and unrelated to the expanded-window refactor, but worth noting since it's in the same area.

### Impact
No functional impact since `handleOpenView` is only called from `SearchSuggestions` which never opens "search". But it's an inconsistency in the type system.

### Recommendation
Either add `"search"` to the union or leave as-is with a comment explaining the intentional exclusion.

---

## Positive Findings

### ✅ Config map approach is clean and extensible
`EXPANDED_WINDOW_VIEWS` as a `Record<string, { width: number; height: number }>` with `isExpandedView()` and `getExpandedWindowSize()` helpers is a solid pattern. Adding a new expanded view is a one-line config change.

### ✅ CSS class toggle is correct with proper cleanup
The `useEffect` at lines 482-486 correctly toggles `gquick-expanded-root` and cleans up on unmount/view change. The CSS in `index.css:29-32` is minimal and correct.

### ✅ Launcher resize correctly guards against expanded mode
`scheduleLauncherResize` (line 503) and the cleanup effect (lines 518-526) both correctly check `appliedWindowModeRef.current` to avoid resizing the launcher window when in expanded mode.

### ✅ Chat view flex behavior is correct
Line 1879: `isExpandedView(view) ? "flex-1" : "h-[300px]"` correctly makes chat fill available space in expanded mode while keeping the fixed 300px height in launcher mode.

### ✅ `appliedWindowModeRef` type is correct
Changed from `"docker" | "launcher"` to `"launcher" | "expanded" | null` — properly generic.

### ✅ No remaining hardcoded docker checks in window/CSS logic
All window resize, CSS class, and container styling logic uses `isExpandedView()` generically. The remaining `docker` references are domain-specific (DockerView component, docker plugin, docker state) which is correct — those are Docker-specific features, not window behavior.

# Auto-focus Fix — Detailed Findings

## [AF-001] Redundant request ID increment

**Severity:** Minor  
**Location:** `src/App.tsx` lines 1386, 928

### Description
`onChange` increments `searchRequestIdRef.current` before calling `setQuery(...)`. The search effect then increments it again via `++searchRequestIdRef.current`.

### Impact
Slightly confusing lifecycle. Current request IDs are always odd numbers (1, 3, 5…) because of the double bump. Not functionally broken — `isCurrentRequest()` still works — but unnecessary.

### Recommendation
Let the search effect own the increment. Remove the manual bump from `onChange`.

---

## [AF-002] Scroll-to-top effect may be overly eager

**Severity:** Minor  
**Location:** `src/App.tsx` lines 255–259

### Description
```tsx
useEffect(() => {
  if (view === "search" && query && items.length > 0) {
    searchListRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
}, [items, view, query]);
```
This fires whenever `items` changes, including incremental updates from multiple plugins.

### Impact
If two plugins return results 100 ms apart, the list snaps to top twice. Acceptable for current UX, but could feel jumpy with streaming plugins.

### Recommendation
Consider tracking the current request ID in a ref and only scrolling when the request ID changes, or gate on `items.length` transitioning from `0` to `>0`.

---

## [AF-003] Positive: Listener race-condition fix

**Severity:** N/A (positive)  
**Location:** `src/App.tsx` lines 413–446, 472–497, 664–704

### Description
Previous code assigned `unlisten = await listen(...)` directly. If the component unmounted before the async `listen` resolved, the cleanup function would call `undefined`.

New code uses a `disposed` flag:
```tsx
let disposed = false;
const cleanup = await listen(...);
if (disposed) cleanup();
else unlisten = cleanup;
```

### Impact
Eliminates a real memory-leak / stale-callback hazard.

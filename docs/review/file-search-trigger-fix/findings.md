# Code Review Findings: File Search Trigger Fix

**Reviewer:** Code Reviewer Agent
**Date:** 2026-04-25
**Scope:** `src-tauri/src/lib.rs`, `src/App.tsx`, `src/plugins/fileSearch.tsx`
**Focus:** File search triggering, stale query prevention, generation cancellation, frontend guards

---

## [F-001] `applyPluginResult` contains dead-code query check

**Severity:** Minor
**Location:** `src/App.tsx:1131-1135`

### Description
`applyPluginResult` checks `result.query !== requestQuery`, but `fetchPluginItems` (line 1123-1128) always constructs the result object with `query: requestQuery`. This condition can never be true in the current codebase.

```tsx
const fetchPluginItems = async (plugin: (typeof queryPlugins)[number]): Promise<SearchPluginResult> => ({
  requestId,
  query: requestQuery, // always requestQuery
  pluginId: plugin.metadata.id,
  items: await plugin.getItems(requestQuery),
});
```

The stale-query guard is already handled by `isCurrentRequest()`, which checks `latestSearchQueryRef.current === requestQuery`.

### Impact
Harmless — adds a no-op branch. Slightly confusing for future maintainers who might think this guard is load-bearing.

### Recommendation
Remove `result.query !== requestQuery` from `applyPluginResult` or add a code comment explaining that `fetchPluginItems` guarantees equality. Keep `isCurrentRequest()` as the single source of truth for request staleness.

---

## [F-002] Non-smart file search lacks intra-plugin cancellation between index and runtime fallback

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:253-261`

### Description
In non-smart mode, `getItems` awaits `launcher_search_file_index` and then, if empty, awaits `launcher_search_files`. There is no request-ID check between the two backend calls:

```tsx
const cachedFiles = await invoke<FileInfo[]>("launcher_search_file_index", { query });
// No cancellation check here
const files = cachedFiles.length > 0
  ? cachedFiles
  : await invoke<FileInfo[]>("launcher_search_files", { query });
```

If the user types rapidly, an obsolete request could proceed from the index lookup into the (expensive) runtime traversal. The backend generation mechanism will cancel the runtime traversal, and the frontend `applyPluginResult` will drop the result, so the user sees no stale data. But the backend still performs the index lookup and starts the traversal before noticing the generation mismatch.

### Impact
Slight wasted CPU for abandoned index lookups. Backend generation check catches runtime traversal quickly. Not user-visible.

### Recommendation
Optional: add a lightweight request-ID check after the index lookup, similar to smart-mode checks (`if (requestId !== smartSearchRequestId) return []`). This is low priority because the backend guard and frontend `applyPluginResult` already prevent stale results from reaching the UI.

---

## [F-003] `scoreIndexedFileResult` may under-score folder matches for non-file queries

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:40-53`

### Description
```tsx
function scoreIndexedFileResult(file: FileInfo, query: string, isFileQuery: boolean): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedName = normalizeSearchText(file.name);
  if (normalizedName === normalizedQuery) return 115;
  if (normalizedName.startsWith(normalizedQuery) || isFileQuery) return 105;
  return 85;
}
```

For a folder named `Ausgangsrechnungen` and query `ausgangsrechnungen`, `isFileQuery` is false (query does not contain "file"/"folder"/"open"). If `normalizedName.startsWith(normalizedQuery)` is true, it still gets 105. But if it's a substring match elsewhere, it gets 85. Other plugins (e.g., Google) may outrank it, which matches the reported symptom where only Google results appeared.

### Impact
Pre-existing scoring behavior. Not introduced by this fix. The fix restores file search results to appear at all; scoring determines relative rank.

### Recommendation
Consider boosting folder exact matches to match or exceed Google plugin scores, but this is a UX tuning issue outside the scope of this bug fix.

---

## [F-004] `merge_files_into_index_for_launcher_generation` has unnecessary double-check for empty input

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:2122-2134`

### Description
```rust
fn merge_files_into_index_for_launcher_generation(...) -> bool {
    if files.is_empty() {
        return LAUNCHER_FILE_SEARCH_GENERATION.load(Ordering::Relaxed) == generation;
    }
    let mut index = index_arc.lock().unwrap();
    if LAUNCHER_FILE_SEARCH_GENERATION.load(Ordering::Relaxed) != generation {
        return false;
    }
    ...
}
```

The early return for `files.is_empty()` checks generation, but the caller (`launcher_search_files_blocking`) already checks generation immediately after receiving runtime results and before calling this function. The empty-files case is effectively a no-op; returning `true` vs `false` doesn't change behavior because the caller ignores the boolean when `files` is empty.

### Impact
None — logic is correct, just slightly redundant.

### Recommendation
Simplify by removing the empty-files special case and letting the function return `true` unconditionally when `files.is_empty()`, or remove the generation check inside it and rely solely on the caller's checks.

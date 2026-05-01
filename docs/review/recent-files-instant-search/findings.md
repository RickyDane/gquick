# Code Review Findings: Recent Files Instant Search

## [RF-001] Directory Detection Bug — Files Without Extensions Show Folder Icon

**Severity:** Major
**Location:** `src/plugins/recentFiles.tsx:35`

### Description
The `isDir` check uses `!entry.id.includes(".")` to determine if a path is a directory. This incorrectly classifies files without extensions (e.g., `Makefile`, `README`, `LICENSE`, `Dockerfile`, `Vagrantfile`) as directories.

### Evidence
```typescript
const isDir = entry.id.endsWith("/") || !entry.id.includes(".");
```

For `entry.id = "/Users/dev/project/Makefile"`:
- `endsWith("/")` → `false`
- `includes(".")` → `false`
- Result: `isDir = true` → Shows **Folder** icon instead of **File** icon

### Impact
Misleading UI. Users will see a folder icon for plain files that happen to have no extension. This is especially common for build/config files.

### Recommendation
Use the stored directory flag from the original file search result if available, or check if the path actually exists as a directory via the Tauri backend. Alternatively, store `is_dir` in the `UsageEntry` when recording usage.

---

## [RF-002] Misleading Constant Name — Debounce Applies to ALL File Searches

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:28,185`

### Description
The constant `SMART_SEARCH_DEBOUNCE_MS = 500` is used as the debounce for **all** file searches, not just smart searches. `getSearchDebounceMs` returns 500ms regardless of whether the query triggers smart search mode.

### Evidence
```typescript
const SMART_SEARCH_DEBOUNCE_MS = 500;
// ...
getSearchDebounceMs: () => SMART_SEARCH_DEBOUNCE_MS,
```

This means typing `doc` waits 500ms before searching the filesystem, even though it's a simple indexed filename search that could be immediate.

### Impact
Slight confusion for maintainers. All file searches (simple and smart) are delayed equally.

### Recommendation
Either rename the constant to `FILE_SEARCH_DEBOUNCE_MS`, or make `getSearchDebounceMs` query-aware and return 0 for simple searches and 500 for smart searches.

---

## [RF-003] Redundant Query Length Check

**Severity:** Minor
**Location:** `src/plugins/recentFiles.tsx:24,27`

### Description
`shouldSearch` already enforces `query.trim().length >= 2`. The inner `getItems` check `if (!query || query.length < 2)` is redundant because `shouldSearch` prevents the plugin from being called with short queries.

### Evidence
```typescript
shouldSearch: (query: string) => query.trim().length >= 2,
getItems: async (query: string): Promise<SearchResultItem[]> => {
    if (!query || query.length < 2) return [];  // Redundant
```

### Impact
None functionally, but adds unnecessary defensive code.

### Recommendation
Remove the inner check or keep only one source of truth. The `shouldSearch` guard is the better place for this logic.

---

## [RF-004] Query Normalization Called Repeatedly in Loop

**Severity:** Minor
**Location:** `src/plugins/recentFiles.tsx:10-14`

### Description
`normalizeSearchText(query)` is called on every iteration of the `for...of` loop over recent files, even though `query` never changes within the loop.

### Evidence
```typescript
function matchesRecentFileQuery(entry: { id: string; title: string }, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);  // Re-computed for every entry
  const normalizedTitle = normalizeSearchText(entry.title);
  const normalizedPath = normalizeSearchText(entry.id);
  return normalizedTitle.includes(normalizedQuery) || normalizedPath.includes(normalizedQuery);
}
```

### Impact
Negligible with only 5 recent files, but an unnecessary micro-optimization opportunity.

### Recommendation
Hoist `normalizedQuery` outside the loop in `getItems` and pass it in, or accept a pre-normalized query parameter.

---

## [RF-005] Loss of Type Safety in AI Ranking

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:83`

### Description
`callAiRankFiles` uses `any` for the description object, bypassing TypeScript's type checking.

### Evidence
```typescript
const desc: any = {
    index: i,
    name: f.name,
    // ...
};
```

### Impact
No runtime bugs currently, but makes refactoring risky and defeats TypeScript's purpose.

### Recommendation
Define an interface for the AI description object:
```typescript
interface AiFileDescription {
  index: number;
  name: string;
  path: string;
  is_dir: boolean;
  size: string;
  modified: string;
  content?: string;
  preview?: string;
}
```

---

## [RF-006] Potential Stale Request Race in File Search Plugin

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:247,281,284,300`

### Description
`fileSearchPlugin` increments its own `smartSearchRequestId` counter on every `getItems` call and checks it after each `await`. However, App.tsx now wraps `getItems` in a 500ms `setTimeout` and has its own `searchRequestIdRef` cancellation logic. The plugin's internal request ID check is now partially redundant with the outer orchestration.

### Evidence
```typescript
const requestId = ++smartSearchRequestId;
// ...
if (requestId !== smartSearchRequestId) return [];
```

While this doesn't cause a bug per se, it's double-protection. The outer `isCurrentRequest()` in App.tsx handles cancellation when query changes. The inner check only catches cases where `getItems` is called multiple times simultaneously within the same outer request (which shouldn't happen due to the debounce).

### Impact
Slight code complexity. Not a functional issue.

### Recommendation
Consider removing the plugin-level request ID and relying solely on App.tsx's cancellation, or document why both are needed.

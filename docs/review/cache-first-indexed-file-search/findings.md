# Code Review Findings: Cache-First Indexed File Search

## [CFIFS-001] Smart search bypasses cache-first path and still blocks on runtime walk

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:2137-2159`

### Description
`smart_search_files_blocking` starts with a full `runtime_search_files` pass before reading cached matches. This preserves the slow jwalk path for smart queries and does not provide instant indexed results.

### Evidence
```rust
let runtime_matches = runtime_search_files(&query, SMART_FILE_SEARCH_CANDIDATE_LIMIT);
...
let cached_matches = cached_file_matches(&index_arc, &query, SMART_FILE_SEARCH_CANDIDATE_LIMIT);
```

### Impact
Queries like `find ...`, `recent ...`, or `... about ...` can still hang before showing results. This also increases the chance that AI ranking waits on filesystem traversal instead of immediately ranking indexed candidates.

### Recommendation
Use cached candidates first for smart search too. If cached candidates exist, return/rank them immediately and run runtime merge in the background. Only fall back to synchronous runtime search on cache miss.

## [CFIFS-002] Zero debounce can trigger multiple filesystem and AI searches while typing

**Severity:** Major  
**Location:** `src/plugins/fileSearch.tsx:162-163`, `src/plugins/fileSearch.tsx:256-273`, `src/App.tsx:1121-1130`

### Description
The file-search plugin now has `searchDebounceMs: 0` for both normal and smart searches. The frontend does not abort an already running `plugin.getItems(query)`; it only drops results after the promise resolves. Smart mode can still call `smart_search_files` and then `callAiRankFiles` for stale intermediate queries.

### Evidence
```ts
searchDebounceMs: 0,
...
const smartFiles = await invoke<SmartFileInfo[]>("smart_search_files", { query });
const rankedIndices = await callAiRankFiles(query, smartFiles);
```

### Impact
Fast typing can create many concurrent backend walks/background merges and, in smart mode, unnecessary AI requests that may cost money and send file content for intermediate queries the user did not intend to submit.

### Recommendation
Keep normal indexed filename search immediate, but retain a debounce for smart/AI searches or split file search into separate normal and smart plugins. Add cancellation/abort checks before AI ranking and after backend returns.

## [CFIFS-003] Cached results are returned without existence validation or stale removal

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:1832-1847`, `src-tauri/src/lib.rs:2058-2067`, `src-tauri/src/lib.rs:2093-2101`

### Description
Cache hits are returned immediately without checking whether paths still exist. Background runtime merge only adds new paths and deduplicates; it never removes stale entries or replaces changed metadata.

### Evidence
```rust
.filter_map(|file| file_matches_query(file, query).map(|score| (file.clone(), score)))
...
if !cached_matches.is_empty() {
    merge_runtime_matches_into_index_in_background(...);
    return Ok(cached_matches.into_iter().map(|(file, _)| file).collect());
}
```

### Impact
Deleted or renamed files can keep appearing and can outrank fresh runtime results until a full refresh replaces the index. Selecting the stale item can fail, making search appear broken despite instant response.

### Recommendation
Validate existence for returned cached top-N results, prune missing entries opportunistically, and update existing paths during runtime merge. Consider emitting refreshed results when background search completes.

## [CFIFS-004] File results now outrank apps and generic actions for broad queries

**Severity:** Minor  
**Location:** `src/plugins/fileSearch.tsx:227-242`, `src/plugins/webSearch.tsx:35-42`, `src/plugins/appLauncher.tsx:30-45`

### Description
Non-smart file results get score `140` for every query, while apps top out at `100` and Google search is `100` only for explicit web/search terms. Raising file results above Google also raises them above app-launcher matches for unrelated generic queries.

### Evidence
```ts
score: isFileQuery ? 160 : 140,
```

### Impact
Typing an app name may show matching files above the app launcher result. This is likely broader than the intended “indexed file beats Google fallback” behavior.

### Recommendation
Use high scores only for explicit file/folder/open queries or exact basename matches. For generic queries, score file results between app exact matches and the Google fallback, or add per-result backend score to the frontend.

## [CFIFS-005] Test coverage covers exact cache hit only

**Severity:** Minor  
**Location:** `src-tauri/src/lib.rs:371-389`

### Description
The added test validates that an indexed exact folder is returned, but it does not cover cancellation, stale cached entries, smart-search cache-first behavior, frontend score ordering, or background merge side effects.

### Impact
Regressions in the risky areas of this fix can pass current tests.

### Recommendation
Add tests for stale path pruning/validation, launcher generation cancellation with cache hits, smart-search cache-first behavior, and frontend sorting expectations against Google/app results.

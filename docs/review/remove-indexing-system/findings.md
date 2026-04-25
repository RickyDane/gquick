# Code Review Findings: Remove Indexing System

## [IDX-001] Misleading function name: `should_index_entry_name`

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:698`

### Description
The function `should_index_entry_name` checks whether a file/folder name should be included in search results (it rejects hidden entries starting with `.`). After the indexing system was removed, the word "index" in the name is misleading — the function is now used exclusively by the direct jwalk runtime search to filter hidden entries.

### Evidence
```rust
fn should_index_entry_name(name: &str) -> bool {
    !name.starts_with('.')
}
```

### Recommendation
Rename to `should_include_entry_in_search` or `is_visible_entry_name` to reflect its current purpose.

---

## [IDX-002] Outdated comment referencing "stale indexes"

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:1619`

### Description
In `smart_search_files_blocking`, a comment states: "Get metadata without following symlinks. Symlink candidates can only come from stale indexes." Since the indexing system has been completely removed, there are no "stale indexes" anymore. This comment will confuse future maintainers.

### Evidence
```rust
// Get metadata without following symlinks. Symlink candidates can only come from stale indexes.
let metadata = match std::fs::symlink_metadata(path) {
```

### Recommendation
Update comment to: "Get metadata without following symlinks. Direct search with follow_links(false) should not yield symlinks, but double-check here for safety."

---

## [IDX-003] Misleading frontend function name: `scoreIndexedFileResult`

**Severity:** Minor
**Location:** `src/plugins/fileSearch.tsx:40`

### Description
The helper `scoreIndexedFileResult` scores file results in the launcher UI. With the indexing system gone, the "Indexed" prefix is misleading — results come from direct jwalk traversal, not from an index.

### Evidence
```typescript
function scoreIndexedFileResult(file: FileInfo, query: string, isFileQuery: boolean): number {
```

### Recommendation
Rename to `scoreFileResult` or `scoreFileSearchResult`.

---

## [IDX-004] Duplicate blocking search implementations

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:1586–1597`

### Description
`search_files_blocking` and `launcher_search_files_blocking` contain identical logic. They both call `runtime_search_files` with the same limit and map over the results.

### Evidence
```rust
fn search_files_blocking(_app: tauri::AppHandle, query: String) -> Result<Vec<FileInfo>, String> {
    let runtime_matches = runtime_search_files(&query, FILE_SEARCH_RESULT_LIMIT);
    Ok(runtime_matches.into_iter().map(|(file, _)| file).collect())
}

fn launcher_search_files_blocking(
    _app: tauri::AppHandle,
    query: String,
) -> Result<Vec<FileInfo>, String> {
    let runtime_matches = runtime_search_files(&query, FILE_SEARCH_RESULT_LIMIT);
    Ok(runtime_matches.into_iter().map(|(file, _)| file).collect())
}
```

### Recommendation
Extract a shared helper or have one function delegate to the other to reduce duplication.

---

## [IDX-005] Unused `_app` parameters in blocking search functions

**Severity:** Minor
**Location:** `src-tauri/src/lib.rs:1586, 1591, 1607`

### Description
`search_files_blocking`, `launcher_search_files_blocking`, and `smart_search_files_blocking` all accept an `AppHandle` parameter that is never used (prefixed with `_`).

### Evidence
```rust
fn search_files_blocking(_app: tauri::AppHandle, query: String) -> Result<Vec<FileInfo>, String> {
```

### Recommendation
Remove the unused parameter from the function signature and update call sites, or keep it if future expansion is planned. Not a blocker.

# Code Review Findings: Prefix Unbounded Collection Fix

**Review Date:** 2026-04-25
**Scope:** `src-tauri/src/lib.rs` — FileIndex `name_index`, `cached_file_matches`, stale pruning, merge helpers
**Tests:** 26 pass

---

## [CRD-001] Unbounded Exact-Match Candidate Cloning Under Lock

**Severity:** Major
**Location:** `cached_file_matches` (lines 2221–2234)

### Description
The exact-match fast path retrieves **all** indices for a normalized name from `name_index` and clones every corresponding `FileInfo` while holding the `Mutex`. There is no cap on the number of candidates. If a user has many files with the same name (e.g., `index.ts`, `README.md`, `Cargo.toml` in a large monorepo or deep `node_modules`), the function may clone hundreds or thousands of `FileInfo` values (each cloning two `String`s) while blocking other threads.

### Evidence
```rust
let exact_candidates: Vec<FileInfo> = {
    let index = index_arc.lock().unwrap();
    index
        .name_index
        .get(&normalized_query)
        .map(|indices| {
            indices
                .iter()
                .filter_map(|&i| index.files.get(i).cloned())  // clones ALL
                .filter(|file| is_index_visible_file(file))
                .collect()
        })
        .unwrap_or_default()
};
```

### Impact
- Lock contention for concurrent queries
- Memory spike proportional to number of identically-named files
- Unbounded `fs::symlink_metadata` calls in the validation loop even after `limit` results are found

### Recommendation
Collect only indices (or at most `limit` worth) while holding the lock, then clone `FileInfo` values after dropping the lock. Alternatively, cap exact candidates to `limit` or `limit * N` and short-circuit the validation loop once `limit` live matches are found.

---

## [CRD-002] Fallback Linear Scan Allocates All Matches Before Bounding

**Severity:** Major
**Location:** `cached_file_matches` (lines 2296–2308)

### Description
When both exact and prefix fast paths return empty, the fallback performs a linear scan over the entire index (up to `FILE_INDEX_MAX_ENTRIES = 100_000`), clones every matching file, collects them into a `Vec`, sorts the entire collection, and only then applies `validation_budget`.

### Evidence
```rust
let mut fallback_matches: Vec<(FileInfo, i32)> = {
    let index = index_arc.lock().unwrap();
    index
        .files
        .iter()
        .filter(|file| is_index_visible_file(file))
        .filter_map(|file| file_matches_query(file, query).map(|score| (file.clone(), score)))
        .collect()  // unbounded clone + allocation
};

fallback_matches.sort_by(|a, b| b.1.cmp(&a.1));

let validation_budget = limit.saturating_mul(50).max(limit);
for (file, score) in fallback_matches.into_iter().take(validation_budget) {
```

### Impact
- For broad queries (e.g., single-character queries that slip through `extract_meaningful_keywords`, or common substrings like `"e"`), this may clone and sort tens of thousands of `FileInfo` objects
- Memory pressure and latency spike on the fallback path

### Recommendation
Use a bounded min-heap (e.g., `std::collections::BinaryHeap` with reverse ordering, or `Vec` with `select_nth_unstable`) to keep only the top `validation_budget` candidates without collecting all matches first. Alternatively, collect into a `Vec` but avoid cloning until the score is known to be in the top N.

---

## [CRD-003] Prefix Fast Path Holds Lock During Candidate Collection

**Severity:** Minor
**Location:** `cached_file_matches` (lines 2255–2276)

### Description
The prefix fast path iterates the entire `name_index` HashMap while holding the mutex, cloning up to `limit * 20` `FileInfo` values. This is bounded and acceptable for typical limits, but still serializes concurrent queries for the duration of the scan.

### Evidence
```rust
let prefix_candidates: Vec<FileInfo> = if normalized_query.len() < 2 {
    Vec::new()
} else {
    let index = index_arc.lock().unwrap();  // lock held during scan
    let cap = limit.saturating_mul(20);
    let mut candidates = Vec::new();
    'outer: for (key, indices) in &index.name_index {
        if key.starts_with(&normalized_query) {
            for &i in indices {
                if let Some(file) = index.files.get(i) {
                    if is_index_visible_file(file) {
                        candidates.push(file.clone());  // clone under lock
                        if candidates.len() >= cap {
                            break 'outer;
                        }
                    }
                }
            }
        }
    }
    candidates
};
```

### Impact
- Reduced concurrency under load
- Mitigated by the `limit * 20` cap (1000 candidates for default limit of 50)

### Recommendation
Collect only `(name_key, index)` tuples (or just `usize` indices) under the lock, then clone `FileInfo` values after releasing the lock. This avoids allocating strings while holding the mutex.

---

## [CRD-004] `prune_stale_paths` Rebuilds Entire Index on Any Stale Entry

**Severity:** Minor
**Location:** `prune_stale_paths` (lines 2198–2209)

### Description
Whenever any stale path is detected, the entire `name_index` is rebuilt from scratch via `build_name_index`. For the max 100,000 entries this is O(n) and acceptable, but it happens synchronously inside the query path.

### Evidence
```rust
fn prune_stale_paths(index_arc: &Arc<Mutex<FileIndex>>, stale_paths: &HashSet<String>) {
    if stale_paths.is_empty() { return; }
    let mut index = index_arc.lock().unwrap();
    let before = index.files.len();
    index.files.retain(|file| !stale_paths.contains(&normalize_search_text(&file.path)));
    if index.files.len() != before {
        index.name_index = build_name_index(&index.files);  // full rebuild
    }
}
```

### Impact
- Additional latency on queries that happen to hit stale entries
- Full rebuild even if only one file out of 100,000 is stale

### Recommendation
Consider moving stale pruning to a background task or batching multiple stale detections before rebuilding. Alternatively, perform incremental `name_index` updates by removing only the affected keys/indices. Note that `retain` shifts indices, so incremental updates are non-trivial but possible with a `Vec` re-indexing pass.

---

## [CRD-005] Single-Character Queries Hit Expensive Fallback

**Severity:** Minor
**Location:** `cached_file_matches` (line 2255), `file_matches_query` (line 1914)

### Description
Prefix matching is explicitly skipped for queries shorter than 2 characters (`normalized_query.len() < 2`). Single-character queries bypass the fast paths and go straight to the fallback linear scan. While `extract_meaningful_keywords` filters out single-character tokens, `file_matches_query` has a fallback containment branch that will match any file whose name or path contains the character.

### Evidence
```rust
// Prefix skipped
let prefix_candidates: Vec<FileInfo> = if normalized_query.len() < 2 {
    Vec::new()
} else { ... }

// Fallback runs for "a", "b", etc.
if name_lower.contains(&query_lower) {  // matches almost everything
    300
} else if path_lower.contains(&query_lower) {
    100
}
```

### Impact
- Typing a single character in the launcher triggers a full linear scan over up to 100,000 files
- High CPU and memory allocation for the worst-case query pattern

### Recommendation
Either:
1. Return early with empty results for single-character queries (reasonable UX — users rarely expect meaningful results from one letter)
2. Or add a fast path that checks only exact-match names for single chars (still likely thousands of matches, but bounded by `name_index` lookup if the character itself is a common name)

---

## [CRD-006] `is_index_visible_file` Redundantly Re-parses Path Components

**Severity:** Minor
**Location:** `cached_file_matches` exact/prefix/fallback loops

### Description
`is_index_visible_file` calls `path_contains_hidden_component`, which iterates over every path component using `Path::components()`. This is executed for every candidate in all three search paths. Since the index is already built from filtered walks, this check is largely defensive and adds repeated path parsing overhead.

### Evidence
```rust
fn is_index_visible_file(file: &FileInfo) -> bool {
    should_index_entry_name(&file.name) && !path_contains_hidden_component(Path::new(&file.path))
}
```

### Impact
- Repeated path parsing for candidates that are already known to be visible from the indexing phase
- Small but measurable overhead when processing thousands of candidates

### Recommendation
If the invariant holds that the index only contains visible files, skip `is_index_visible_file` in the hot path and rely on `cached_file_entry_is_current` for the safety check. Alternatively, cache the visibility result in `FileInfo` (add a `visible: bool` field) to avoid re-parsing.

---

## [CRD-007] `list_file_index_entries` Ignores `name_index`

**Severity:** Minor
**Location:** `list_file_index_entries` (lines 2422–2459)

### Description
The `list_file_index_entries` command performs a linear scan over all files for every request, applying substring filters. It does not use the `name_index` HashMap. While this is likely an admin/debug endpoint, it is inconsistent with the optimization work done for the search paths.

### Evidence
```rust
let entries = index
    .files
    .iter()
    .filter(|file| is_index_visible_file(file))
    .filter(|file| {
        normalized_query.is_empty()
            || normalize_search_text(&file.name).contains(&normalized_query)
            || normalize_search_text(&file.path).contains(&normalized_query)
    })
    .skip(offset)
    .take(limit)
    .map(|file| FileIndexEntry { ... })
    .collect();
```

### Impact
- Performance degradation if this endpoint is used for anything beyond debug/admin

### Recommendation
If this endpoint needs to scale, consider using `name_index` for exact/prefix lookups or document that it is intentionally unoptimized.

---

## Positive Findings

1. **Prefix boundedness is correctly implemented** — `limit * 20` cap prevents unbounded collection
2. **Short-query protection** — skipping prefix for `< 2` chars avoids wasteful scans for minimal queries
3. **Pre-sized HashMap** — `build_name_index` uses `HashMap::with_capacity(files.len())` reducing reallocation
4. **Stale prune helper extraction** — `prune_stale_paths` is clean, single-responsibility, and correctly rebuilds the index
5. **Incremental `name_index` updates on merge** — `merge_files_into_index` and `merge_files_into_index_for_launcher_generation` correctly append to `name_index` without full rebuilds
6. **Generation-aware launcher merge** — `merge_files_into_index_for_launcher_generation` correctly aborts if the generation has advanced, preventing stale results from polluting the cache
7. **Test coverage** — 26 tests cover exact match, prefix match, stale pruning, runtime search, generation checks, and edge cases like Unicode normalization

---

## Appendix: Lock Contention Hot Path

The most contended sequence in the current implementation:

```
Thread A: exact match → lock → clone N FileInfo → unlock
Thread B: exact match → waits for A's lock
Thread A: validate N FileInfo with fs::symlink_metadata (no lock)
Thread A: if stale found → lock → retain + rebuild name_index → unlock
```

Mitigation priority:
1. Reduce cloning under lock (CRD-001)
2. Reduce fallback allocations (CRD-002)
3. Consider RwLock if read-heavy workload justifies it (not flagged as issue, but worth monitoring)

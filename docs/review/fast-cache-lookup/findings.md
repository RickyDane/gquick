# Code Review Findings: Fast Cache Lookup for Indexed File Search

## [FC-001] Prefix fast path candidate collection is unbounded

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:2250-2266`

### Description
The prefix-match fast path iterates over every key in `name_index` and clones **all** matching files before applying `limit`. For very short queries (e.g., one or two characters like `"a"` or `"do"`), this can collect tens of thousands of `FileInfo` clones while holding the mutex, followed by an equal number of `symlink_metadata` syscalls.

### Evidence
```rust
let prefix_candidates: Vec<FileInfo> = {
    let index = index_arc.lock().unwrap();
    let mut candidates = Vec::new();
    for (key, indices) in &index.name_index {
        if key.starts_with(&normalized_query) {
            for &i in indices {
                if let Some(file) = index.files.get(i) {
                    if is_index_visible_file(file) {
                        candidates.push(file.clone()); // unbounded
                    }
                }
            }
        }
    }
    candidates
};
```

### Impact
- Lock held while cloning thousands of items → blocks concurrent merges/searches.
- Many subsequent `cached_file_entry_is_current` syscalls → still faster than old linear scan, but can cause multi-hundred-millisecond stalls on 100k indexes with short queries.

### Recommendation
Cap prefix candidate collection to a reasonable multiple of `limit` (e.g., `limit * 20`), or skip the prefix fast path entirely for queries shorter than 2 characters and fall back directly to the bounded linear scan.

---

## [FC-002] `build_name_index` does not pre-allocate HashMap capacity

**Severity:** Minor  
**Location:** `src-tauri/src/lib.rs:1094-1101`

### Description
`build_name_index` starts with `HashMap::new()` and grows dynamically. For a 100k-entry index this triggers several rehash rounds during full rebuilds (stale prune, background refresh).

### Evidence
```rust
fn build_name_index(files: &[FileInfo]) -> HashMap<String, Vec<usize>> {
    let mut map: HashMap<String, Vec<usize>> = HashMap::new();
    // ...
}
```

### Impact
Small but measurable overhead during index rebuilds.

### Recommendation
Pre-size the map:
```rust
let mut map: HashMap<String, Vec<usize>> = HashMap::with_capacity(files.len());
```

---

## [FC-003] Stale-pruning logic is duplicated three times

**Severity:** Minor  
**Location:** `src-tauri/src/lib.rs:2236-2248`, `2280-2292`, `2319-2328`

### Description
The same stale-path detection, `retain`, and `build_name_index` rebuild pattern appears identically after the exact fast path, prefix fast path, and fallback linear scan.

### Impact
Maintenance burden; risk of future drift if one path is changed but the others are not.

### Recommendation
Extract a helper such as `prune_stale_and_rebuild(index_arc, &stale_paths)`.

---

## [FC-004] `launcher_search_file_index_matches` is a redundant pass-through

**Severity:** Minor  
**Location:** `src-tauri/src/lib.rs:2600-2606`

### Description
```rust
fn launcher_search_file_index_matches(...) -> Vec<(FileInfo, i32)> {
    cached_file_matches(...)
}
```
This wrapper adds no behavior and complicates the call graph.

### Recommendation
Inline the call or delete the wrapper and call `cached_file_matches` directly from `launcher_search_file_index_blocking`.

---

## [FC-005] No test for concurrent merge during cached search

**Severity:** Minor  
**Location:** tests module

### Description
All 26 existing tests are single-threaded. There is no coverage for races between `merge_files_into_index` / stale-prune rebuilds and concurrent `cached_file_matches` calls.

### Impact
Low — the `Arc<Mutex<FileIndex>>` serialization makes data races impossible, but logic races (e.g., merge + prune interleaving) are not exercised.

### Recommendation
Add a stress test that spawns one thread continuously merging synthetic files while another repeatedly calls `cached_file_matches`, then assert no panics and eventual consistency.

---

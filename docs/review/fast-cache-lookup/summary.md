# Code Review Summary: Fast Cache Lookup for Indexed File Search

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-04-25  
**Status:** Approved (with minor fixes)

## Overall Assessment
The change correctly replaces the O(N) linear scan with an O(1) exact-match HashMap lookup and an O(U) prefix-match HashMap scan (U = unique names), falling back to linear scan only when necessary. Index maintenance during merges, background rebuilds, and stale pruning is consistent. Memory overhead is modest (duplicate normalized-name strings). All 26 unit tests pass.

## Critical Issues (0)
None.

## Major Issues (1)
- **FC-001:** Prefix fast path candidate collection is unbounded. Short queries can clone thousands of `FileInfo` objects and issue an equal number of `symlink_metadata` syscalls, causing noticeable stalls. Cap collection or gate prefix fast path on minimum query length.

## Minor Issues (4)
- **FC-002:** `build_name_index` should pre-allocate `HashMap` capacity.
- **FC-003:** Stale-pruning logic is triplicated; should be extracted to a helper.
- **FC-004:** `launcher_search_file_index_matches` is a no-op wrapper.
- **FC-005:** Missing concurrent stress test for merge + search interleaving.

## Positive Findings
- **Correctness:** `name_index` is rebuilt atomically under the same mutex after every `retain` operation; indices cannot drift out of sync with `files`.
- **Fallback safety:** If exact or prefix fast paths return only stale entries, execution correctly flows to the next stage rather than returning an empty result set.
- **Background refresh:** The 5-minute background rebuild correctly reconstructs `name_index` from scratch, ensuring long-term consistency.
- **Unicode safety:** NFC normalization + lowercase is applied consistently to both index keys and queries, preserving cross-platform matching behavior.
- **Performance target:** For exact and prefix queries on a 100k-entry index, latency drops from 15–30 s to sub-millisecond, meeting the near-instant requirement.

## Recommendation
Approve for merge after addressing FC-001 (bound prefix candidate collection). FC-002 through FC-005 can be addressed in a follow-up cleanup PR.

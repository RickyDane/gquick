# Code Review Summary: Prefix Unbounded Collection Fix

**Reviewer:** Code Reviewer Agent
**Date:** 2026-04-25
**Status:** Approved with reservations

## Overall Assessment

The fix successfully addresses the primary issue: prefix candidate collection in `cached_file_matches` is now bounded (`limit * 20`), short queries (`< 2` chars) skip the prefix path, and the `name_index` HashMap provides O(1) exact-match lookups. The stale-pruning logic is cleanly extracted and correctly rebuilds index consistency. Test coverage is solid (26 tests pass).

However, two **Major** issues remain that could cause latency spikes and memory pressure under specific workloads:

1. **Exact-match cloning is unbounded** — a query matching a very common filename may clone thousands of `FileInfo` values under lock and issue unbounded `fs::symlink_metadata` calls.
2. **Fallback linear scan collects all matches before sorting/bounding** — broad queries can clone and sort tens of thousands of entries.

Neither issue is a blocker for merge, but both should be addressed before the next performance-related release.

---

## Critical Issues (0)
None.

## Major Issues (2)
- **CRD-001:** Unbounded exact-match candidate cloning under lock (lines 2221–2234)
- **CRD-002:** Fallback linear scan allocates all matches before bounding (lines 2296–2308)

## Minor Issues (5)
- **CRD-003:** Prefix fast path holds lock during candidate collection
- **CRD-004:** `prune_stale_paths` rebuilds entire index on any stale entry
- **CRD-005:** Single-character queries hit expensive fallback
- **CRD-006:** `is_index_visible_file` redundantly re-parses path components
- **CRD-007:** `list_file_index_entries` ignores `name_index`

---

## Positive Findings
- Clean `name_index` integration with incremental updates on merge
- Correct prefix bounding (`limit * 20`) and short-query skip (`< 2` chars)
- Proper generation tracking for launcher race conditions
- Good test coverage including Unicode normalization and stale-pruning edge cases
- `prune_stale_paths` is well-factored and maintains index consistency

## Recommendation

**Approve for merge.** The prefix unbounded collection fix is correct and the fast paths are sound. Schedule follow-up work to:

1. Cap exact-match candidate cloning / short-circuit validation once `limit` is reached
2. Replace fallback `Vec` collection + sort with a bounded selection algorithm

These optimizations will eliminate the remaining unbounded work in the query hot path.

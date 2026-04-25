# Code Review Summary: Cache-First Indexed File Search

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-04-25  
**Status:** Needs Changes

## Overall Assessment
Normal filename search now returns indexed matches immediately, including exact basename hits, and launcher cancellation is mostly preserved. No critical security blocker found. However, smart search still blocks on runtime traversal, zero debounce can fan out expensive/AI work, and stale cached paths are not validated.

## Critical Issues (0)
None.

## Major Issues (3)
- CFIFS-001: Smart search bypasses cache-first path and still blocks on runtime walk.
- CFIFS-002: Zero debounce can trigger multiple filesystem and AI searches while typing.
- CFIFS-003: Cached results are returned without existence validation or stale removal.

## Minor Issues (2)
- CFIFS-004: File results now outrank apps and generic actions for broad queries.
- CFIFS-005: Test coverage covers exact cache hit only.

## Positive Findings
- Cache-first path fixes the reported indexed `Ausgangsrechnungen` latency for normal file search.
- Background runtime merge preserves immediate return on cache hit.
- Exact basename scoring is high enough to rank intended folders above fallback web search.
- Launcher generation checks remain present around runtime search paths.

## Recommendation
Needs changes before approval. Fix smart-search cache-first behavior, add stale-result validation/pruning, and reduce/guard zero-debounce load for smart/AI searches. Normal indexed file search path looks directionally correct.

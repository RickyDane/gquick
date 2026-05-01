# Code Review Summary: Recent Files Instant Search

**Reviewer:** Code Reviewer Agent
**Date:** 2026-05-01
**Status:** Approved with Fixes

## Overall Assessment
The code changes correctly implement the desired behavior: recent files appear instantly (no debounce) while filesystem searches remain debounced at 500ms. The deduplication by `id` in `publishItems` ensures recent file entries take priority over filesystem results for the same path, which is the intended UX. The architecture is sound, but there is one bug and several minor code quality issues.

## Answer to Key Question

**Yes — recent files will appear INSTANTLY.**

Here's the proof from the code flow:

1. `recentFilesPlugin` does **not** define `searchDebounceMs` or `getSearchDebounceMs`
2. In `App.tsx:1146`, `getPluginDebounceMs(recentFilesPlugin)` returns `undefined`
3. `App.tsx:1147` places it in `immediatePlugins` (no debounce)
4. `App.tsx:1190-1193` executes immediate plugins **right away** via `fetchImmediateItems()`
5. `fileSearchPlugin` defines `getSearchDebounceMs: () => 500`
6. `App.tsx:1195-1210` wraps debounced plugins in `setTimeout(..., 500)`

Result: Recent files render in ~0-1ms (synchronous filtering over 5 entries), while filesystem results appear after 500ms.

## Critical Issues (0)
None.

## Major Issues (1)
- **#RF-001**: Files without extensions (Makefile, README, Dockerfile, etc.) incorrectly show the **Folder** icon in recent files results due to flawed directory detection logic.

## Minor Issues (5)
- **#RF-002**: `SMART_SEARCH_DEBOUNCE_MS` constant name is misleading — the 500ms debounce applies to **all** file searches, not just smart searches.
- **#RF-003**: Redundant query length check inside `recentFilesPlugin.getItems` (already guarded by `shouldSearch`).
- **#RF-004**: Query normalization is re-computed for every entry in the 5-item loop.
- **#RF-005**: `any` type used in `callAiRankFiles`, losing TypeScript safety.
- **#RF-006**: Double request cancellation (plugin-level `smartSearchRequestId` + App-level `searchRequestIdRef`) adds unnecessary complexity.

## Positive Findings
- ✅ Clean separation of immediate vs debounced plugins in App.tsx
- ✅ Deduplication logic correctly prioritizes immediate plugin results (recent files win over filesystem duplicates)
- ✅ Score of 200 ensures recent files always rank above filesystem results (max filesystem score: 115)
- ✅ `recordUsage` in `onSelect` records as `"file-search"` for continuity — preserves usage history tracking
- ✅ Good plugin ordering in `index.ts` (`recentFilesPlugin` before `fileSearchPlugin`)
- ✅ Cancellation logic in App.tsx properly prevents stale results from rendering

## Recommendation
**Approve for merge after fixing RF-001** (directory detection bug). The minor issues can be addressed in follow-up refactoring.

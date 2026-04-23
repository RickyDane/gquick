# Code Review Summary: GQuick Notes Plugin

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-04-23  
**Status:** Needs Changes

## Overall Assessment

The Notes plugin is a well-structured feature that integrates cleanly with the existing GQuick architecture. The code follows established patterns, uses parameterized SQL queries correctly, and the frontend components are reasonably organized. Both `cargo check` and `npx tsc --noEmit` pass.

However, there are **two high-severity issues** that should be fixed before merge: a SQL LIKE wildcard logic bug and a stale-state UI bug in chat context. Several medium and low severity issues around performance, fragile parsing, and missing error feedback should also be addressed.

---

## Critical Issues (0)

None.

## High Issues (2)

- **#F-001:** SQL LIKE wildcard characters (`%`, `_`) from user input are not escaped in `search_notes`, causing unexpected search results.
- **#F-002:** The `notesContext` state is not reset when clearing chat with `Ctrl+R`, so the "Notes used as context" banner persists with stale data.

## Medium Issues (4)

- **#F-003:** Missing database index on `notes(title)` and `notes(content)` — full table scans on every search.
- **#F-004:** `NotesView` uses the `window.storage` event to detect quick saves, which does not fire within the same window/document. Auto-refresh after quick save does not work.
- **#F-005:** The "Saved" badge in `NotesView` appears after the first save and never disappears.
- **#F-006:** `isNoteRelatedQuery` triggers on common words like "remember" and "saved", causing unnecessary context injection.

## Low Issues (5)

- **#F-007:** Both `tauri-plugin-sql` and `rusqlite` are included as dependencies; one is redundant.
- **#F-008:** `notesContext` parsing relies on a fragile regex and `.slice(0, -2)` on a manually constructed string.
- **#F-009:** `setTimeout` in `handleCopy` is not cleaned up on unmount.
- **#F-010:** Clipboard write failures are silently ignored and the window still hides.
- **#F-011:** No user-facing error states for failed DB operations in `NotesView`.

---

## Positive Findings

- **Secure SQL:** All Rust commands use `rusqlite::params![]` for parameterized queries — no SQL injection risk.
- **Clean Integration:** The plugin correctly implements `GQuickPlugin`, and all Tauri commands are properly registered in `invoke_handler`.
- **Good Structure:** `NotesView` separates concerns well (list, edit, create, search) and has sensible empty/loading states.
- **Keyboard Shortcuts:** `⌘N` / `Ctrl+N` shortcut is properly scoped and doesn't conflict with actions view.

## Recommendation

**Approve for merge after fixing F-001 and F-002.**  
Address F-003 through F-006 in a follow-up PR for polish. F-007 through F-011 are nice-to-have cleanups.

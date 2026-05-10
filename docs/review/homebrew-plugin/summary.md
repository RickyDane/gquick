# Code Review Summary: Homebrew Plugin

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-05-09  
**Status:** Needs Changes  
**Build Status:** ✅ `npx tsc --noEmit` clean, ✅ `cargo check` clean

---

## Overall Assessment

The Homebrew plugin is a solid, well-structured addition that closely mirrors the existing Docker plugin patterns. The Rust backend correctly uses platform guards (`#[cfg(any(target_os = "macos", target_os = "linux"))]`), timeouts, and the shared `run_blocking` mechanism. The frontend implements proper race-condition guards (`refreshSeq`, `searchSeq`), loading states, and confirmation dialogs for destructive operations.

However, several security, accessibility, and code-quality issues should be addressed before the feature is considered production-ready. None are catastrophic, but the argument-injection risk and misleading cancellation code warrant attention.

---

## Critical Issues (0)

None.

---

## High Issues (0)

None.

---

## Medium Issues (4)

| ID | Title | File |
|---|---|---|
| HB-001 | Argument injection risk — no `--` separator before user-supplied package names | `src-tauri/src/lib.rs` |
| HB-002 | Misleading `AbortController` in search effect (dead code) | `src/components/HomebrewView.tsx` |
| HB-003 | `require_confirmed` uses Docker-branded error helper | `src-tauri/src/lib.rs` |
| HB-004 | No confirmation for install/upgrade in quick-search actions | `src/plugins/homebrew.tsx` |

---

## Low Issues (9)

| ID | Title | File |
|---|---|---|
| HB-005 | Deprecated `navigator.platform` for OS detection | `src/plugins/homebrew.tsx`, `src/components/HomebrewView.tsx` |
| HB-006 | `localStorage` access without error handling | `src/components/HomebrewView.tsx` |
| HB-007 | Dead keyboard resize handler in `DetailPanel` | `src/components/HomebrewView.tsx` |
| HB-008 | Missing `type="button"` on action buttons | `src/plugins/homebrew.tsx`, `src/components/HomebrewView.tsx` |
| HB-009 | Missing ARIA labels on icon-only buttons | `src/components/HomebrewView.tsx` |
| HB-010 | Unused `_isCask` parameter in `selectPackage` | `src/components/HomebrewView.tsx` |
| HB-011 | `installed_on` field never populated | `src-tauri/src/lib.rs` |
| HB-012 | Duplicate magic number for debounce | `src/plugins/homebrew.tsx`, `src/components/HomebrewView.tsx` |
| HB-013 | `BrewSearchResult.installed` always `false` | `src-tauri/src/lib.rs` |

---

## Positive Findings

- **Platform guards are correct.** Both compile-time (`#[cfg]`) and runtime guards prevent Homebrew commands from running on Windows.
- **Race-condition handling is thorough.** `refreshSeq` and `searchSeq` prevent stale state updates.
- **Timeouts are reasonable.** Install/upgrade get 10 minutes, uninstall gets 2 minutes, search gets 30 seconds.
- **Confirmation pattern is followed.** Uninstall and "upgrade all" require backend confirmation via `require_confirmed`.
- **Error handling is graceful.** The launcher plugin catches `brew_list` and `brew_search` failures independently and shows fallback items.
- **Consistent with Docker plugin.** Structure, patterns, and file organization match the reference implementation.
- **Build is clean.** TypeScript and Rust both compile without errors.

---

## Recommendations

1. **Fix HB-001** (argument injection) by adding `"--"` before user-supplied package names in all `brew_*_blocking` functions.
2. **Fix HB-002** by removing the ineffective `AbortController` or adding a clarifying comment.
3. **Address HB-003** by renaming `docker_err` to a generic helper (affects both Docker and Homebrew).
4. **Consider HB-004** — decide whether install/upgrade in the launcher should show a confirmation dialog.
5. **Batch-fix low-severity items** (HB-005 through HB-013) in a single polish pass.

**Verdict:** Merge after addressing medium-severity issues (HB-001 through HB-004). Low-severity items can be deferred to a follow-up cleanup PR.

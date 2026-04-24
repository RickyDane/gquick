# Code Review Summary: Windows Tesseract DLL Bundling

**Reviewer:** Code Reviewer Agent
**Date:** 2026-04-24
**Status:** Needs Changes

## Overall Assessment
The fix correctly addresses the core problem: Tesseract DLLs are now discovered, copied to the target directory for `tauri dev`, and staged for the Tauri bundler via a generated `tauri.windows.conf.json`. The Windows-only gating is proper and macOS/Linux behavior is preserved.

However, there are **reliability and robustness issues** in the build script that should be addressed before merge to prevent confusing developer experiences and potential bundler failures.

## Critical Issues (0)
None.

## Major Issues (2)
- **WIN-001:** Missing `cargo:rerun-if-env-changed` for `TESSDATA_PREFIX`, `PATH`, and `VCPKG_ROOT`. Build script will not re-run when these variables change, requiring manual `cargo clean`.
- **WIN-002:** Stale `tauri.windows.conf.json` and `tesseract-dlls/` are not cleaned up when Tesseract is uninstalled or not found. Can cause Tauri bundler to reference missing files or bundle outdated DLLs.

## Warning Issues (4)
- **WIN-003:** Inconsistent error handling — target copy warns on failure, staging copy is fatal (`?`). Surprising behavior for developers.
- **WIN-004:** Fragile `OUT_DIR` ancestor traversal (`nth(3)`) to locate the target directory. May break with custom `CARGO_TARGET_DIR` or workspace layouts.
- **WIN-005:** `cargo clean` does not purge generated files in `src-tauri/` (`tauri.windows.conf.json`, `tesseract-dlls/`). Stale artifacts survive cleans.
- **WIN-006:** `collect_all_dlls()` copies every `.dll` in the detected directory. For vcpkg `bin/`, this can bloat the bundle with unrelated libraries.

## Suggestion Issues (3)
- **WIN-007:** `has_tesseract_and_leptonica` uses overly permissive `starts_with("tesseract")` matching.
- **WIN-008:** vcpkg detection misses `arm64-windows` triplet.
- **WIN-009:** `TESSDATA_PREFIX` parent heuristic may fail for custom directory layouts.

## Positive Findings
- ✅ Proper `#[cfg(target_os = "windows")]` gating throughout.
- ✅ Comprehensive detection logic (TESSDATA_PREFIX, PATH, common paths, vcpkg).
- ✅ Graceful degradation — build does not fail if Tesseract is missing (though see WIN-002).
- ✅ `collect_all_dlls` correctly captures transitive dependencies, not just tesseract/leptonica.
- ✅ Generated config format is correct for Tauri v2 platform-specific configs.
- ✅ `.gitignore` properly excludes generated artifacts.
- ✅ `serde_json` correctly added to `[build-dependencies]`.
- ✅ macOS `tesseract_data_path()` gate removed, enabling tessdata lookup on all platforms.

## Recommendation
**Approve for merge after addressing WIN-001 and WIN-002.** These two issues affect build reliability and can cause hard-to-debug failures. WIN-003 and WIN-004 are also worth fixing while the build script is being touched. WIN-005 through WIN-009 can be addressed in follow-up work if needed.

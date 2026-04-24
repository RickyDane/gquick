# Code Review Findings: Windows Tesseract DLL Bundling

## [WIN-001] Missing `cargo:rerun-if-env-changed` directives

**Severity:** Major
**Location:** `src-tauri/build.rs:28-93`

### Description
The build script detects Tesseract via environment variables (`TESSDATA_PREFIX`, `PATH`, `VCPKG_ROOT`) but never emits `cargo:rerun-if-env-changed` for them. If a developer installs Tesseract after an initial build (or changes these variables), Cargo will not rerun `build.rs` because no tracked file changed.

### Evidence
```rust
// Lines 98, 108, 129 read env vars but do not emit rebuild triggers:
if let Ok(tessdata) = env::var("TESSDATA_PREFIX") { ... }
if let Ok(path_var) = env::var("PATH") { ... }
if let Ok(vcpkg_root) = env::var("VCPKG_ROOT") { ... }
```

### Impact
Developers may see confusing "Tesseract not found" warnings persist even after installation, requiring `cargo clean` or touching `build.rs` to force a rebuild.

### Recommendation
Add at the top of `setup_tesseract_dlls()` (before any early returns):
```rust
println!("cargo:rerun-if-env-changed=TESSDATA_PREFIX");
println!("cargo:rerun-if-env-changed=PATH");
println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
```

---

## [WIN-002] Stale generated files when Tesseract is removed or not found

**Severity:** Major
**Location:** `src-tauri/build.rs:7-16`, `build.rs:57-91`

### Description
When `setup_tesseract_dlls()` fails (e.g., Tesseract was uninstalled), the build script prints warnings and continues. However, it does **not** clean up previously-generated `tauri.windows.conf.json` or `tesseract-dlls/`. These stale artifacts can cause the Tauri bundler to fail (missing resources) or silently bundle outdated DLLs.

### Evidence
```rust
// main() catches Err and continues — no cleanup occurs:
if let Err(e) = windows::setup_tesseract_dlls() {
    println!("cargo:warning=Could not setup Tesseract DLLs: {}", e);
    // ... warnings printed, then falls through to tauri_build::build()
}
```

### Impact
- Bundler may reference DLLs that no longer exist in `tesseract-dlls/`, causing a build failure.
- Or, old DLLs may remain in `tesseract-dlls/` and get bundled even though Tesseract is no longer installed.

### Recommendation
On failure (or when `dll_dir` is `None`), delete `tauri.windows.conf.json` and clear `tesseract-dlls/`:
```rust
fn clean_staged_artifacts() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?);
    let _ = fs::remove_file(manifest_dir.join("tauri.windows.conf.json"));
    let _ = fs::remove_dir_all(manifest_dir.join("tesseract-dlls"));
    Ok(())
}
```
Call this in the `Err` branch of `main()` before proceeding to `tauri_build::build()`.

---

## [WIN-003] Inconsistent error handling between target copy and staging copy

**Severity:** Warning
**Location:** `src-tauri/build.rs:46-53`, `build.rs:62-65`

### Description
Copying DLLs to the target directory (`cargo run` / `tauri dev`) warns on failure and continues. Copying DLLs to the staging directory (`tesseract-dlls/`) uses `?` and fails the entire build. This inconsistency is surprising: a locked DLL during dev is non-fatal, but the same locked DLL during staging is fatal.

### Evidence
```rust
// Target copy: non-fatal
match fs::copy(&src, &dst) {
    Ok(_) => ..., 
    Err(e) => println!("cargo:warning=Failed to copy {}: {}", dll, e),
}

// Staging copy: fatal
fs::copy(&src, &dst)?;
```

### Impact
A running `tauri dev` instance may lock a DLL in `target/debug/`, but the staging copy could still fail for unrelated reasons (permissions, AV scan), causing an unnecessary build failure.

### Recommendation
Decide on a consistent policy. If the bundler must have every DLL, keep staging fatal but also make target copy fatal (or at least return an error so the caller can decide). If resilience is preferred, handle staging errors similarly to target errors and skip missing DLLs in the generated config.

---

## [WIN-004] Fragile `OUT_DIR` ancestor traversal to find target directory

**Severity:** Warning
**Location:** `src-tauri/build.rs:40-43`

### Description
The script assumes `OUT_DIR` is exactly 3 levels below the target profile directory (e.g., `target/debug/build/<pkg>-hash/out`). Cargo does not guarantee this depth in all configurations (custom `target-dir`, future Cargo versions, workspace layouts).

### Evidence
```rust
let target_dir = out_dir
    .ancestors()
    .nth(3)
    .ok_or("Cannot determine target directory from OUT_DIR")?;
```

### Impact
If the project moves to a workspace or the user sets `CARGO_TARGET_DIR` to a deeply nested path, the math may be wrong and DLLs will be copied to an unexpected location, causing runtime failures.

### Recommendation
Use `CARGO_TARGET_DIR` if available, falling back to profile detection:
```rust
let target_dir = env::var("CARGO_TARGET_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|_| {
        // infer from CARGO_MANIFEST_DIR + "target"
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("target")
    })
    .join(env::var("PROFILE").unwrap_or_else(|_| "debug".into()));
```

---

## [WIN-005] `cargo clean` does not remove generated `src-tauri/` artifacts

**Severity:** Warning
**Location:** `.gitignore`, `build.rs` output files

### Description
`cargo clean` only purges `target/`. The generated `tauri.windows.conf.json` and `tesseract-dlls/` live in `src-tauri/` and survive `cargo clean`. This can mask issues during debugging because stale configs/DLLs remain after a "clean" build.

### Impact
Developers may spend time debugging phantom behavior from leftover generated files.

### Recommendation
Document this behavior in a `README.md` section about Windows builds, or add a small cleanup script/task. The `.gitignore` correctly prevents these from being committed.

---

## [WIN-006] vcpkg `bin/` may copy excessive unrelated DLLs

**Severity:** Warning
**Location:** `src-tauri/build.rs:165-175`

### Description
`collect_all_dlls()` copies **every** `.dll` in the detected directory. For vcpkg's `installed/x64-windows/bin/`, this directory often contains dozens of unrelated DLLs (openssl, curl, zlib, etc.), causing significant bundle bloat.

### Evidence
```rust
fn collect_all_dlls(dir: &Path) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut dlls = Vec::new();
    for entry in fs::read_dir(dir)? {
        ...
        if name.to_lowercase().ends_with(".dll") {
            dlls.push(name);
        }
    }
    Ok(dlls)
}
```

### Impact
Windows installer size may grow by 10-50 MB depending on what else is in the vcpkg bin directory.

### Recommendation
Filter to a known-safe allowlist or use a dependency-walker approach. At minimum, exclude obvious unrelated patterns (`openssl*.dll`, `libcrypto*.dll`, etc.). If the intent is truly "grab transitive deps", consider using a tool like `dumpbin /dependents` or `ldd` equivalent to find the actual dependency closure of `tesseract55.dll`.

---

## [WIN-007] `has_tesseract_and_leptonica` uses overly permissive prefix matching

**Severity:** Suggestion
**Location:** `src-tauri/build.rs:144-163`

### Description
The check uses `starts_with("tesseract")` and `starts_with("leptonica")` with `ends_with(".dll")`. This could match unintended files like `tesseract-config-editor.dll` or `leptonica-tools.dll` if they were ever present.

### Evidence
```rust
if name.starts_with("tesseract") && name.ends_with(".dll") {
    has_tesseract = true;
}
```

### Impact
Low. In practice, official distributions use names like `tesseract55.dll` and `leptonica-1.84.0.dll`, so this is unlikely to cause a false positive.

### Recommendation
Tighten the pattern slightly to exclude obvious non-library names, e.g.:
```rust
if name.starts_with("tesseract") && name.ends_with(".dll") && !name.contains("-tool") && !name.contains("-config") {
    ...
}
```

---

## [WIN-008] Missing handling for vcpkg `arm64-windows` triplet

**Severity:** Suggestion
**Location:** `src-tauri/build.rs:130`

### Description
The vcpkg triplet list only includes `x64-windows` and `x86-windows`. Windows on ARM64 builds (`arm64-windows`) are not checked.

### Impact
Developers building for Windows ARM64 with vcpkg will not have DLLs auto-detected.

### Recommendation
Add `"arm64-windows"` to the triplet array, or consider reading the active cargo target triple and mapping it to vcpkg triplets dynamically.

---

## [WIN-009] `TESSDATA_PREFIX` parent assumption may be wrong for custom layouts

**Severity:** Suggestion
**Location:** `src-tauri/build.rs:98-105`

### Description
The code assumes that if `TESSDATA_PREFIX` points to `.../tessdata`, the DLLs live in the parent directory. Some custom installations keep `tessdata` elsewhere (e.g., a shared data directory) while binaries live in a completely different prefix.

### Impact
Auto-detection may fail for non-standard installations, forcing users to rely on PATH.

### Recommendation
Document this heuristic in the warning message or README. The fallback to PATH is reasonable, so this is minor.

---

## [WIN-010] Positive: macOS/Linux behavior correctly preserved

**Severity:** Positive
**Location:** `src-tauri/build.rs:1-20`, `src-tauri/src/lib.rs:413-420`

### Description
- The entire Windows module is conditionally compiled with `#[cfg(target_os = "windows")]`, ensuring zero build-time overhead on macOS/Linux.
- `lib.rs` removed the `#[cfg(target_os = "macos")]` gate from `tesseract_data_path()`, making the tessdata lookup work on all platforms (needed if tessdata is bundled on Windows too).

### Recommendation
No change needed. Good cross-platform hygiene.

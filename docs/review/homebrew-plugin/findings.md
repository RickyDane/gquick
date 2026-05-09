# Homebrew Plugin — Detailed Code Review Findings

**Reviewer:** Code Reviewer Agent  
**Date:** 2026-05-09  
**Scope:** `src-tauri/src/lib.rs` (brew commands), `src/plugins/homebrew.tsx`, `src/components/HomebrewView.tsx`, `src/App.tsx`, `src/plugins/index.ts`  
**Reference Pattern:** Docker plugin (`src/plugins/docker.tsx`)

---

## [HB-001] Argument injection risk in `brew install` / `uninstall` / `upgrade` / `info`

**Severity:** Medium  
**Location:** `src-tauri/src/lib.rs` — `brew_install_blocking` (line 4415), `brew_uninstall_blocking` (line 4441), `brew_upgrade_blocking` (line 4472), `brew_info_blocking` (line 4237)

### Description
User-supplied `name` values are appended directly to the `brew` argument list without a `--` separator. A crafted value starting with `-` (e.g. `--force`, `--version`) will be interpreted by Homebrew as a flag rather than a positional package name. While `Command::args()` prevents shell injection, it does not prevent argument injection.

### Evidence
```rust
// brew_install_blocking (line 4415-4421)
let mut args = vec!["install".into()];
if cask {
    args.push("--cask".into());
}
args.push(name);   // <-- no "--" separator
brew_command_output(&args, Duration::from_secs(600))
```

### Impact
A malicious or accidental package name beginning with `-` could alter Homebrew command behavior, bypass checks, or cause unexpected side effects.

### Recommendation
Insert `"--".into()` before the user-supplied `name` in all commands that accept dynamic package names:
```rust
args.push("--".into());
args.push(name);
```

---

## [HB-002] Misleading `AbortController` in search effect

**Severity:** Medium  
**Location:** `src/components/HomebrewView.tsx` — `useEffect` for search (lines 163-183)

### Description
An `AbortController` is instantiated and its signal checked in the catch block, but `invoke()` does not accept an abort signal and the controller never actually cancels the in-flight Tauri command. The sequence-number guard (`searchSeq`) correctly prevents stale state updates, making the `AbortController` dead code that misleads future maintainers.

### Evidence
```tsx
const controller = new AbortController()
// ...
try {
  const results = await invoke<BrewSearchResult[]>("brew_search", { query: searchQuery })
  // invoke does not support AbortSignal
} catch (err) {
  if (controller.signal.aborted || seq !== searchSeq.current) return
  // controller is never triggered before the catch in practice
}
```

### Impact
Code that appears to support cancellation does not, leading to confusion and potential bugs if copied elsewhere.

### Recommendation
Remove the `AbortController` and rely solely on the `searchSeq` guard (which is already correct), or add a comment explaining that Tauri `invoke` does not yet support request cancellation.

---

## [HB-003] `require_confirmed` uses Docker-branded error helper

**Severity:** Medium  
**Location:** `src-tauri/src/lib.rs` — `require_confirmed` (line 2119)

### Description
The shared confirmation helper was originally written for Docker and still calls `docker_err`. Homebrew commands that fail confirmation return error codes prefixed with Docker naming, which is confusing in logs and UI.

### Evidence
```rust
fn require_confirmed(confirmed: Option<bool>, operation: &str) -> Result<(), String> {
    if confirmed.unwrap_or(false) {
        Ok(())
    } else {
        Err(docker_err(
            "CONFIRMATION_REQUIRED",
            format!("{} requires explicit backend confirmation.", operation),
        ))
    }
}
```

### Impact
Inconsistent error branding; harder to debug Homebrew-specific issues.

### Recommendation
Rename `docker_err` to a generic `command_err` (or `app_err`) and update all call sites (Docker + Homebrew).

---

## [HB-004] No confirmation for install/upgrade in quick-search actions

**Severity:** Medium  
**Location:** `src/plugins/homebrew.tsx` — action handlers (lines 91, 154)

### Description
In the launcher quick-search results, **Install** and **Upgrade** actions invoke `brew_install` / `brew_upgrade` immediately without user confirmation. The Docker plugin follows the same pattern for non-destructive ops, but Homebrew installs can take minutes, consume disk space, and install system-wide binaries. The full-page `HomebrewView` also upgrades without confirmation.

### Evidence
```tsx
// line 91 — upgrade from installed list
onRun: () => {
  void invoke("brew_upgrade", { name: p.name, cask: p.is_cask })
},

// line 154 — install from search results
onRun: () => {
  void invoke("brew_install", { name: r.name, cask: r.is_cask })
},
```

### Impact
Accidental one-click installation or upgrade of packages (including large casks) with no way to undo.

### Recommendation
Consider requiring a `window.confirm()` for **Install** and **Upgrade** actions in the launcher, or at least add a visual delay / undo pattern. Match the level of friction to the operation's cost.

---

## [HB-005] Deprecated `navigator.platform` for OS detection

**Severity:** Low  
**Location:** `src/plugins/homebrew.tsx` (line 28), `src/components/HomebrewView.tsx` (line 256)

### Description
`navigator.platform` is deprecated and unreliable (e.g. it may return `"MacIntel"` on Apple Silicon under Rosetta, or be spoofed). The Rust backend already gates commands by `#[cfg]`, so the frontend check is only for UX short-circuiting, but it may give false positives/negatives.

### Evidence
```tsx
const isUnsupportedPlatform = navigator.platform.toUpperCase().includes("WIN")
```

### Impact
Windows users on browsers that report a non-Windows platform might see a broken Homebrew UI; non-Windows users on spoofed platforms might see an unnecessary "not available" message.

### Recommendation
Query the OS from Tauri (`@tauri-apps/api/os`) once at app startup and store it in a shared context, or remove the frontend guard entirely and let the backend’s platform-guarded errors drive the UX.

---

## [HB-006] `localStorage` access without error handling

**Severity:** Low  
**Location:** `src/components/HomebrewView.tsx` — `initialDetailPanelWidth` (line 81-86), `useEffect` for width persistence (line 147-149)

### Description
Reading and writing `localStorage` can throw in private-browsing modes (Safari) or when storage quota is exceeded. The code assumes these calls always succeed.

### Evidence
```tsx
function initialDetailPanelWidth(): number {
  const savedWidth = Number(localStorage.getItem(detailPanelWidthKey))
  // ...
}

useEffect(() => {
  localStorage.setItem(detailPanelWidthKey, String(detailPanelWidth))
}, [detailPanelWidth])
```

### Impact
A `QuotaExceededError` or `SecurityError` could crash the React render loop or effect cleanup.

### Recommendation
Wrap `localStorage` calls in `try/catch` and fall back to the default width.

---

## [HB-007] Dead keyboard resize handler in `DetailPanel`

**Severity:** Low  
**Location:** `src/components/HomebrewView.tsx` — `DetailPanel` resize handler (lines 559-564)

### Description
The keyboard handler for the resizer swallows `ArrowLeft`, `ArrowRight`, and `End` keys (calls `event.preventDefault()`) but performs no action for them, leaving keyboard users without resize capability and trapping expected navigation behavior.

### Evidence
```tsx
const resizeByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
  event.preventDefault()
  if (event.key === "Home") onClose()
  // Simplified: no width keyboard resize for brevity
}
```

### Impact
Keyboard users lose expected arrow-key behavior on the resizer element with no alternative provided.

### Recommendation
Either implement width adjustment for arrow keys or remove them from the allowed-keys list so default browser behavior resumes.

---

## [HB-008] Missing `type="button"` on action buttons

**Severity:** Low  
**Location:** `src/plugins/homebrew.tsx` — `ActionRow` (lines 206-216), `src/components/HomebrewView.tsx` — `PackageRows` (lines 512-527) and `DetailPanel` buttons

### Description
Buttons rendered inside `ActionRow` and `PackageRows` lack `type="button"`. While they are not currently inside `<form>` elements, this is brittle; if they are ever wrapped in a form, they will submit it.

### Evidence
```tsx
<button
  key={action.id}
  onClick={(e) => { /* ... */ }}
  className="..."
>
  {action.label}
</button>
```

### Recommendation
Add `type="button"` to all non-submit buttons.

---

## [HB-009] Missing ARIA labels on icon-only buttons

**Severity:** Low  
**Location:** `src/components/HomebrewView.tsx` — `DetailPanel` close button (line 589)

### Description
The close button in `DetailPanel` contains only an `<X>` icon with no accessible label. Screen-reader users will hear "button" with no context.

### Evidence
```tsx
<button onClick={onClose} className="...">
  <X className="h-3 w-3" />
</button>
```

### Recommendation
Add `aria-label="Close detail panel"` (or similar) to the close button and review other icon-only buttons in the component.

---

## [HB-010] Unused `_isCask` parameter in `selectPackage`

**Severity:** Low  
**Location:** `src/components/HomebrewView.tsx` — `selectPackage` (line 220)

### Description
The `selectPackage` callback accepts `_isCask` but ignores it. This suggests an earlier design included cask-aware selection logic that was removed or never implemented.

### Evidence
```tsx
const selectPackage = useCallback(async (name: string, _isCask: boolean) => {
  try {
    const info = await invoke<BrewInfo>("brew_info", { name })
    // ...
  }
}, [])
```

### Impact
Misleading API; future callers may assume the parameter is used.

### Recommendation
Remove the unused parameter or pass it to the `brew_info` invoke if it is needed for disambiguation.

---

## [HB-011] `installed_on` field never populated

**Severity:** Low  
**Location:** `src-tauri/src/lib.rs` — `brew_list_blocking` (lines 4118, 4154)

### Description
The `BrewPackage` struct includes `installed_on: Option<String>`, but both formula and cask parsing branches set it to `None`. The field appears to be scaffolding for a future feature.

### Evidence
```rust
packages.push(BrewPackage {
    name: name.clone(),
    version,
    installed_on: None,   // always None
    tap,
    // ...
});
```

### Impact
Slight memory and serialization overhead; confusion for consumers expecting data.

### Recommendation
Either populate the field from `installed[].date` (formula) / `installed` (cask) JSON fields, or remove it from the struct until needed.

---

## [HB-012] Duplicate magic number for debounce

**Severity:** Low  
**Location:** `src/plugins/homebrew.tsx` (line 62), `src/components/HomebrewView.tsx` (line 170)

### Description
The debounce delay of `300` ms is hardcoded in both the plugin metadata and the view component. If the plugin metadata changes, the view will drift out of sync.

### Evidence
```tsx
// homebrew.tsx
searchDebounceMs: 300,

// HomebrewView.tsx
const timer = window.setTimeout(async () => { /* ... */ }, 300)
```

### Recommendation
Export the debounce value from the plugin (or a shared constants file) and consume it in the view.

---

## [HB-013] `BrewSearchResult.installed` always `false`

**Severity:** Low  
**Location:** `src-tauri/src/lib.rs` — `brew_search_blocking` (lines 4196-4218)

### Description
`brew search --json` does not return installation status, so the code hardcodes `installed: false` for every search result. This is expected behavior from Homebrew, but the field name implies it may be meaningful to consumers.

### Evidence
```rust
results.push(BrewSearchResult {
    name: name.to_string(),
    description: None,
    version: None,
    tap: "homebrew/core".into(),
    is_cask: false,
    installed: false,   // always false
});
```

### Impact
Frontend consumers might display inaccurate "not installed" labels.

### Recommendation
Either cross-reference with `brew_list` results to set the flag accurately, or remove the field and let the frontend infer installation status when the user navigates to package details.

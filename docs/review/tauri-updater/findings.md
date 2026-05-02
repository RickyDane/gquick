# Code Review Findings: Tauri Updater Implementation

**Reviewer:** Code Reviewer Agent
**Date:** 2026-05-02

---

## [ID-001] Auto-check fires checkForUpdates twice on startup

**Severity:** Major
**Location:** `src/App.tsx:370-383`, `src/components/UpdateModal.tsx:99-103`

### Description
When the auto-check timer fires in App.tsx, it calls `checkForUpdates()` directly. If an update is found, it opens the modal with `autoCheck=true`. The modal's `useEffect` then calls `doCheck()` again, which runs `checkForUpdates()` a second time.

### Evidence
```tsx
// App.tsx:370-383 — first check
useEffect(() => {
  const timer = setTimeout(async () => {
    const { checkForUpdates } = await import("./utils/updater");
    const result = await checkForUpdates();
    if (result.available) {
      setIsUpdateModalOpen(true); // opens modal with autoCheck=true
    }
  }, 3000);
  return () => clearTimeout(timer);
}, []);

// UpdateModal.tsx:99-103 — second check triggered by autoCheck
useEffect(() => {
  if (isOpen && autoCheck) {
    void doCheck(); // redundant network call
  }
}, [isOpen, autoCheck, doCheck]);
```

### Impact
- Unnecessary network request to the update endpoint on every startup
- Brief flash of "Checking..." state in the modal before it shows the update
- Wastes bandwidth, especially on metered connections

### Recommendation
Pass the update info from App.tsx into the modal, or have App.tsx set the modal state directly. Two approaches:

**Option A:** Remove the auto-check from App.tsx and let the modal handle it entirely:
```tsx
// App.tsx — just open the modal, let it check
useEffect(() => {
  const timer = setTimeout(() => {
    setIsUpdateModalOpen(true);
  }, 3000);
  return () => clearTimeout(timer);
}, []);
```

**Option B:** Pass the already-fetched update data to the modal:
```tsx
// App.tsx
const [updateResult, setUpdateResult] = useState(null);
// ... fetch and store result
<UpdateModal isOpen={isUpdateModalOpen} onClose={...} initialUpdate={updateResult} />
```

---

## [ID-002] No cancellation support for in-flight update check/download

**Severity:** Major
**Location:** `src/components/UpdateModal.tsx:51-88`, `src/utils/updater.ts:26-87`

### Description
Neither `checkForUpdates()` nor `downloadAndInstall()` support AbortController or any cancellation mechanism. If the user closes the modal while a check or download is in progress, the async operation continues in the background with no way to cancel it.

### Evidence
```tsx
// UpdateModal.tsx — no cleanup on unmount
const doCheck = useCallback(async () => {
  setStatus("checking");
  const result = await checkForUpdates(); // no abort signal
  // ...sets state even if component unmounted
}, []);

const doDownload = useCallback(async () => {
  if (!update) return;
  setStatus("downloading");
  const result = await downloadAndInstall(update, ...); // no abort signal
  // ...sets state even if component unmounted
}, [update]);
```

### Impact
- State updates on unmounted components (React warning in dev, potential bugs in prod)
- Download continues consuming bandwidth even after user dismisses modal
- No way to retry a stuck download

### Recommendation
1. Add an `AbortController` pattern to the updater utility
2. Track mounted state or use cleanup in useEffect
3. Consider adding a cancel button during download state

```tsx
// updater.ts
export async function checkForUpdates(signal?: AbortSignal): Promise<...> {
  // Pass signal to underlying API if supported
}

// UpdateModal.tsx
const abortRef = useRef<AbortController | null>(null);

useEffect(() => {
  return () => {
    abortRef.current?.abort(); // cancel on unmount
  };
}, []);
```

---

## [ID-003] Hardcoded version string in Settings.tsx

**Severity:** Minor
**Location:** `src/Settings.tsx:667`

### Description
The current version is hardcoded as `"v0.1.0"` in the Settings UI. This will become stale when the version is bumped in `tauri.conf.json` and `Cargo.toml`.

### Evidence
```tsx
<span className="text-xs text-zinc-500">Current version: v0.1.0</span>
```

### Impact
- Version display will be wrong after any version bump
- Users may be confused about their actual version

### Recommendation
Read the version from the Tauri config at runtime:
```tsx
import { getVersion } from "@tauri-apps/api/app";

const [appVersion, setAppVersion] = useState("");
useEffect(() => {
  getVersion().then(setAppVersion).catch(() => {});
}, []);

// Then:
<span>Current version: v{appVersion}</span>
```

---

## [ID-004] UpdateModal renders inside Settings overflow container

**Severity:** Minor
**Location:** `src/Settings.tsx:700-705`

### Description
The `UpdateModal` is rendered as a child of the Settings component, which itself is inside a scrollable container (`overflow-y-auto`). While the modal uses `fixed` positioning so it visually escapes the container, it's still DOM-nested inside it. This can cause z-index stacking issues and accessibility tree confusion.

### Evidence
```tsx
// Settings.tsx:349
<div className="flex flex-col h-125 px-3 text-zinc-200">
  <div className="space-y-3 flex-1 overflow-y-auto py-3 pb-0 mb-2 custom-scrollbar">
    {/* ... settings content ... */}
  </div>
  {/* ... footer ... */}
  {isUpdateModalOpen && (
    <UpdateModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} />
  )}
```

### Impact
- Minor z-index stacking risk if parent containers have `transform`, `filter`, or `will-change` properties
- Screen reader navigation may be confusing (modal inside settings context)

### Recommendation
Use a React portal to render the modal at the document body level:
```tsx
import { createPortal } from "react-dom";

{isUpdateModalOpen && createPortal(
  <UpdateModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} />,
  document.body
)}
```

---

## [ID-005] No trap focus inside UpdateModal

**Severity:** Minor
**Location:** `src/components/UpdateModal.tsx:116-129`

### Description
The modal handles Escape key and sets initial focus, but does not trap tab focus within the modal. Users can Tab out of the modal into the background content.

### Evidence
```tsx
// Only handles Escape, no Tab trapping
useEffect(() => {
  if (!isOpen) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };
  window.addEventListener("keydown", handleKeyDown, true);
  return () => window.removeEventListener("keydown", handleKeyDown, true);
}, [isOpen, onClose]);
```

### Impact
- Keyboard-only users can accidentally interact with background content
- Accessibility violation (WCAG 2.4.3 - Focus Order)

### Recommendation
Add Tab trapping similar to the quit dialog in Settings.tsx (lines 290-333), which already implements this pattern correctly.

---

## [ID-006] Progress bar shows 0% briefly when contentLength is unknown

**Severity:** Minor
**Location:** `src/components/UpdateModal.tsx:133-136`, `src/utils/updater.ts:67`

### Description
When the `Started` event fires with `contentLength` of 0 or undefined, the progress bar shows 0% and the bytes display shows "0 B / 0 B". The `formatBytes` function handles 0 correctly, but the UX is confusing.

### Evidence
```tsx
// updater.ts:67
case "Started":
  contentLength = event.data.contentLength ?? 0; // could be 0
  onProgress(0, contentLength);
  break;

// UpdateModal.tsx:133-136
const percent = progress && progress.total > 0
  ? Math.round((progress.downloaded / progress.total) * 100)
  : 0; // shows 0% when total unknown
```

### Impact
- Confusing UX when server doesn't send Content-Length header
- User may think download is stuck

### Recommendation
Show an indeterminate state when total is unknown:
```tsx
{progress && progress.total > 0 ? (
  // determinate progress bar with percentage
) : (
  // indeterminate animated progress bar
  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
    <div className="h-full bg-blue-500 rounded-full animate-pulse w-1/3" />
  </div>
)}
```

---

## [ID-007] Updater pubkey is a placeholder/base64-encoded "untrusted comment"

**Severity:** Critical
**Location:** `src-tauri/tauri.conf.json:38`

### Description
The updater public key appears to be a minisign key where the comment says "untrusted comment". This is the default minisign format where the actual key is on the second line, but the base64 value here decodes to a comment string, not a full key pair. Need to verify this is a real signing key and not a placeholder.

### Evidence
```json
"pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEU1MkQ3N0I5NzA0RjY4NzYKUldTY0JweGk2MElrck10aHJvS2hWZnVXb2Z2b0RJcHJpSDA0a3pXN292b0RJcHJpSDA0a3o="
```

Decodes to:
```
untrusted comment: minisign public key: E52D77B9704F6876
RWScBpxi6IrkmthroKhVfuWovoDIpriH04kzW7ovoDIpriH04kz
```

### Impact
- If this is a placeholder, the updater will reject all legitimate signed updates
- If the private key is compromised, malicious updates could be delivered
- The "untrusted comment" prefix is normal for minisign but the key itself needs verification

### Recommendation
1. Verify this is the real public key for the signing keypair
2. Ensure the private key is stored securely (CI/CD secrets, not in repo)
3. Test the full update flow with a signed release artifact
4. Consider adding a comment that identifies the key (e.g., "gquick release key 2026")

---

## [ID-008] No timeout on update check network request

**Severity:** Minor
**Location:** `src/utils/updater.ts:33`

### Description
The `check()` call from the Tauri updater plugin has no visible timeout configuration. On slow or unreliable networks, this could hang indefinitely.

### Evidence
```tsx
const update = await check(); // no timeout
```

### Impact
- Modal stuck in "Checking for updates..." state forever on bad network
- Auto-check on startup could block for a long time (though it's in a setTimeout, the promise still runs)

### Recommendation
Wrap with a timeout:
```tsx
export async function checkForUpdates(timeoutMs = 10000): Promise<...> {
  try {
    const update = await Promise.race([
      check(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Update check timed out")), timeoutMs)
      ),
    ]);
    // ...
  }
}
```

---

## [ID-009] Settings.tsx imports unused updater icons

**Severity:** Minor
**Location:** `src/Settings.tsx:2`

### Description
Settings.tsx imports `Download` and `RefreshCw` from lucide-react for the Updates section, but these are already imported in UpdateModal.tsx. The imports in Settings are needed for the section header and button, so this is fine — but `Download` is used for both the icon and the import name, which shadows the concept.

### Evidence
```tsx
import { Key, Eye, EyeOff, Loader2, Command, Save, Power, AlertTriangle, MapPin, X, Download, RefreshCw } from "lucide-react";
```

### Impact
- No functional impact, just a naming observation

### Recommendation
No action needed. The imports are correct and used.

---

## [ID-010] `autoCheck` prop defaults to false but App.tsx always passes `true`

**Severity:** Minor
**Location:** `src/App.tsx:2118`, `src/components/UpdateModal.tsx:35`

### Description
The `autoCheck` prop defaults to `false` in UpdateModal, but App.tsx always passes `autoCheck` (as `true`), while Settings.tsx doesn't pass it (defaults to `false`). This is correct behavior but worth noting the two usage patterns.

### Evidence
```tsx
// App.tsx:2114-2120 — always autoCheck
<UpdateModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} autoCheck />

// Settings.tsx:700-705 — no autoCheck (manual trigger)
<UpdateModal isOpen={isUpdateModalOpen} onClose={() => setIsUpdateModalOpen(false)} />
```

### Impact
- No issue. Behavior is correct: App.tsx auto-checks, Settings.tsx shows idle state for manual check.

### Recommendation
No change needed. Consider adding a brief JSDoc comment on the `autoCheck` prop to document the two modes.

---

## [ID-011] No retry limit on update check in error state

**Severity:** Minor
**Location:** `src/components/UpdateModal.tsx:282-289`

### Description
The error state shows a "Retry" button that calls `doCheck()` again. There's no limit on retries, and no backoff. A user could spam the retry button.

### Evidence
```tsx
<button
  ref={actionButtonRef}
  onClick={doCheck} // no rate limiting
  className="..."
>
  <RefreshCw className="h-3.5 w-3.5" />
  Retry
</button>
```

### Impact
- Minor: could generate excessive network requests if user clicks rapidly
- No real security risk since it's a public endpoint

### Recommendation
Consider adding a brief cooldown or disabling the button during the check:
```tsx
<button onClick={doCheck} disabled={status === "checking"}>
```

---

## [ID-012] Plugin registration order is correct

**Severity:** N/A (Positive)
**Location:** `src-tauri/src/lib.rs:5088-5089`

### Description
The updater plugin is registered after the dialog plugin and before the `setup` callback. This is the correct order per Tauri v2 documentation — plugins should be registered before `setup` runs.

### Evidence
```rust
.plugin(tauri_plugin_dialog::init())
.plugin(tauri_plugin_updater::Builder::new().build())
.setup(|app| { ... })
```

### Impact
- None. Correct implementation.

---

## [ID-013] Updater permissions correctly configured

**Severity:** N/A (Positive)
**Location:** `src-tauri/capabilities/default.json:22`

### Description
The `updater:default` permission is included in the capabilities, which grants the necessary permissions for the updater plugin to function.

### Evidence
```json
"permissions": [
  "core:default",
  // ...
  "updater:default"
]
```

### Impact
- None. Correct configuration.

---

## [ID-014] Dependencies are correctly declared

**Severity:** N/A (Positive)
**Location:** `src-tauri/Cargo.toml:26`, `package.json:19-20`

### Description
Both Rust and JS dependencies for the updater are present:
- `tauri-plugin-updater = "2"` in Cargo.toml
- `@tauri-apps/plugin-updater` and `@tauri-apps/plugin-process` in package.json

### Impact
- None. All dependencies present.


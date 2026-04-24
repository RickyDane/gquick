# Code Review Findings: Docker Management

## [DM-001] Docker command wrapper can deadlock on large output

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:805-838` (`docker_output`)

### Description
`docker_output` spawns Docker with piped stdout/stderr, waits for process exit with `try_wait`, and only reads pipes after exit. Commands that emit more than pipe capacity can block while the parent is still waiting, then GQuick reports a timeout.

### Evidence
```rust
.stdout(std::process::Stdio::piped())
.stderr(std::process::Stdio::piped())
...
if let Some(status_code) = child.try_wait()? { break status_code; }
...
pipe.read_to_string(&mut stdout)?;
```

### Impact
`docker pull`, `docker logs`, `docker compose logs`, `inspect`, or verbose failures may hang until the 120s timeout. UI remains busy and users may think Docker failed even when command was producing output.

### Recommendation
Use `Command::output()` for bounded commands, or read stdout/stderr concurrently while waiting. For logs/pull/compose, prefer streaming output to frontend events and enforce per-command timeouts appropriate to command type.

## [DM-002] Compose read/write commands allow arbitrary local file access

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:1018-1031`, `src/components/DockerView.tsx:224`

### Description
Backend commands accept any path string and read/write it directly. UI asks for confirmation on write, but backend does not restrict paths, extensions, directories, or require a backend-side confirmation token.

### Evidence
```rust
fn compose_read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path_ref)
}

fn compose_write_file(path: String, content: String, overwrite: Option<bool>) -> Result<(), String> {
    std::fs::write(path_ref, content)
}
```

### Impact
Any frontend invocation can read arbitrary text files and overwrite/create arbitrary files reachable by the app user. This increases impact of future XSS/webview compromise and can cause data loss.

### Recommendation
Use Tauri dialog/file-scope permissions where possible. Restrict to compose-like filenames/extensions, reject symlinks if needed, canonicalize paths, and require explicit backend confirmation for overwrite. Consider using Tauri FS plugin scopes instead of raw `std::fs`.

## [DM-003] Long-running Docker operations use a single 120s non-streaming timeout

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:813-825`; `src/components/DockerView.tsx:131-143`

### Description
All Docker operations share a hard 120 second timeout and return output only after completion. This is too short for large image pulls and some compose operations, and too long for quick interactive feedback.

### Impact
Large pulls/runs may be killed despite making progress. Users cannot see pull progress/log streaming, cannot cancel safely, and the UI only shows a generic busy state.

### Recommendation
Set command-specific timeouts: short for list/status, longer/no idle-timeout for pull/compose up. Stream stdout/stderr into the Activity tab and add cancel support.

## [DM-004] Windows volume parsing breaks drive-letter paths

**Severity:** Major  
**Location:** `src/components/DockerView.tsx:164-167`, `src-tauri/src/lib.rs:974-979`

### Description
Volume mappings are parsed with `line.split(":")`. Windows paths such as `C:\Users\me:/data:ro` split into incorrect host/container/mode fields.

### Impact
Bind mounts are unreliable on Windows and may pass malformed paths to Docker. Users can fail to run containers or mount unintended paths.

### Recommendation
Parse from the right side (`container[:mode]`) or require structured fields instead of colon-delimited free text. Document accepted Windows path format and test `C:\...` and WSL paths.

## [DM-005] Destructive operations rely only on frontend confirmations

**Severity:** Major  
**Location:** `src-tauri/src/lib.rs:927-933`, `src-tauri/src/lib.rs:1005-1016`, `src/components/DockerView.tsx:198,230`

### Description
`manage_container(remove/kill)`, `delete_image`, and `prune_docker` execute when invoked. `prune_docker` defaults `force` to true if omitted. Confirmations exist in current React buttons, but the backend does not enforce them.

### Impact
Future UI changes, plugin actions, or compromised frontend code can invoke destructive Docker actions without confirmation. Accidental invocation can delete containers/images/volumes.

### Recommendation
Make backend require an explicit confirmation string/nonce for destructive actions, and avoid defaulting `force` to true. Keep UI confirmations, but treat backend as final safety boundary.

## [DM-006] Chat shortcut behavior changed while adding Docker shortcut

**Severity:** Minor  
**Location:** `src/App.tsx:39-47`, `src/App.tsx:297-302`, `src/App.tsx:463-465`

### Description
Chat shortcut changed from `Cmd/Ctrl + C` to `Cmd/Ctrl + Left Shift + C`. This was outside Docker scope and may surprise existing users.

### Impact
Existing chat shortcut users lose muscle memory. On some platforms, key location handling can make this hard to discover.

### Recommendation
Confirm intended shortcut migration. If not intentional, restore previous chat shortcut and keep Docker on `Cmd/Ctrl + Left Shift + D` only.

## [DM-007] Docker Hub search lacks cancellation and stale-result guard

**Severity:** Minor  
**Location:** `src/components/DockerView.tsx:113-126`, `src/utils/dockerHub.ts:30-69`

### Description
Search requests are debounced and cached, but in-flight fetches are not aborted and responses are not checked against the latest query.

### Impact
Slow responses for older queries can overwrite newer Hub results. Network requests can continue after tab/query changes.

### Recommendation
Use `AbortController` and track request query/version before committing results. Consider timeout handling for Docker Hub fetches.

## Positive Findings

- Docker CLI execution uses `Command::new("docker").args(...)`, not shell interpolation, so host shell injection risk is low.
- Tauri command registration includes new Docker commands and Rust/TypeScript build checks passed.
- Container action allowlist and prune/compose action allowlists reduce accidental arbitrary Docker subcommands.
- UI includes confirmations for visible destructive flows and Docker daemon/CLI status detection.

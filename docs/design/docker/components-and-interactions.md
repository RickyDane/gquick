# Component Specs: Expanded Docker Functionality

## Docker Hub Search
- Query box placeholder: “Search Docker Hub images…”.
- Result row content:
  - title: `namespace/name` or official image name.
  - subtitle: description, stars, pulls, official/verified badges, last updated.
  - tags preview: `latest`, `alpine`, `bookworm` if available after selection.
- Primary action: Pull.
- Action menu: Pull, Run…, Copy image name.
- Loading: skeleton rows with subtle pulse.
- Empty: “No Docker Hub images found for ‘{query}’.”
- API error: amber banner “Docker Hub search failed. Check network and try again.” with Retry.

## Action Menu Behavior
- Trigger: kebab `⋯`, `Shift+F10`, or `A` on selected row.
- Position: right-aligned popover inside window bounds.
- Keyboard: Up/Down, Enter, Esc; first safe action focused.
- Menu sections:
  - Safe: Pull, Run…, Copy, View logs, Inspect.
  - Lifecycle: Start, Stop, Restart.
  - Destructive: Remove, Force remove, Prune; red text, separated by divider.
- On success: toast “Copied image name”, “Started container”, etc.
- On failure: inline row error + Activity tray entry.

## Pull Progress UX
- Pull creates Activity tray item immediately.
- Progress row shows layer status:
  - Overall bar: weighted if bytes available; indeterminate if Docker returns only text stream.
  - Layer list expandable: Pulling fs layer, Downloading, Extracting, Verifying, Complete.
- Completed: emerald check, “Pulled `redis:latest`”. Actions: Run, Copy.
- Failed: red state, preserve logs, actions: Retry, Copy error.
- Cancel: available while downloading when backend can cancel process; copy “Cancel pull?” confirmation not required because non-destructive.

## Run Form
Open as drawer/modal from image action `Run…`.

Fields:
- Image: readonly `repository:tag` with Copy.
- Container name: optional text; validation `^[a-zA-Z0-9][a-zA-Z0-9_.-]+$`.
- Mode:
  - Detached (default) checkbox/toggle.
  - Interactive `-it` checkbox; helper: “Opens Exec shell after start when detached is off.”
- Ports: repeatable rows `Host port` → `Container port/protocol`; add/remove.
- Environment: repeatable `KEY` `VALUE`; mask toggle for secrets.
- Volumes: repeatable `Host path` → `Container path` with Browse.
- Command/Args: optional mono input.
- Advanced collapsed: restart policy, network, working dir, user.

Footer:
- Primary: Run container.
- Secondary: Copy `docker run` command.
- Tertiary: Cancel.

Validation:
- Duplicate host port: “Host port 5432 is mapped more than once.”
- Invalid env key: “Use uppercase letters, numbers, and underscores for env names.”
- Missing container path for volume: “Container path is required.”
- Failed run keeps form values and opens output panel.

## Images Tab
- Empty: “No Docker images yet. Search Docker Hub to pull one.” CTA: Search Hub.
- Row: repo:tag, image ID, size, created, in-use badge.
- Actions: Run…, Copy name, Inspect, Remove image.
- Remove disabled with tooltip if used by running container unless Force remove selected.

## Containers Tab
- Empty: “No containers found. Run an image to create one.” CTA: Images.
- Filters: All, Running, Stopped.
- Row: name, image, status chip, ports, created.
- Actions:
  - Running: Stop, Restart, Logs, Exec shell, Inspect, Copy ID.
  - Stopped: Start, Remove, Inspect, Copy ID.
- Logs view:
  - `font-mono`, virtualized, max visible height, sticky controls.
  - Controls: Follow tail, timestamps, last 100/500/1000/all, search within logs, copy visible, clear UI buffer.
  - Long logs show “Showing last 1,000 lines” notice; never render unbounded DOM.
- Exec shell:
  - Shell selector: `/bin/sh`, `/bin/bash`, custom.
  - Opens terminal-like panel; if shell missing, show fallback suggestion.

## Inspect View
- JSON tree with search/filter.
- Buttons: Copy JSON, Collapse all, Expand all.
- Large inspect payload: lazy expand nested nodes.

## Compose View
- Existing paths panel:
  - List detected/saved `compose.yml`, `docker-compose.yml` paths.
  - Row metadata: project name, services count, last modified, path.
  - Actions: Up, Down, Restart, Logs, Open editor, Reveal path, Remove from list.
- Create/Edit panel:
  - File path picker + template dropdown: Blank, Web + DB, Redis, Postgres.
  - Monaco-like or textarea mono editor using `bg-zinc-950/60 border-white/10`.
  - Buttons: Validate, Save, Save as, Up.
- Validation errors:
  - Inline gutter/line highlight when line known.
  - Summary banner: “Compose validation failed: services.web.ports must be a list.”
- Output tab shows compose command stream with status chips per service.
- Unsaved changes: prompt before switching file/closing page.

## Prune UX
- Prune tab/card is visually separated and red-accented.
- Options checkboxes:
  - Stopped containers
  - Dangling images
  - Unused images
  - Unused volumes (extra warning)
  - Build cache
- Dry-run preview first: “This will remove 8 objects and reclaim about 1.2 GB.”
- Primary button disabled until preview completes.

## Docker Status Detection
- Initial state checks: Docker CLI present, daemon reachable, version, context.
- Missing Docker:
  - Full-page empty state: “Docker is not installed or not in PATH.”
  - Actions: Retry, Open Docker install docs, Configure Docker path.
- Daemon down:
  - “Docker is installed, but the daemon is not running.”
  - Actions: Retry, Open Docker Desktop.
- Permission error:
  - “GQuick cannot access Docker. Check socket permissions.”
  - Include copied diagnostic command.

## Confirmation Copy
- Remove image: “Remove image `{image}`? Containers using it may fail to start.” Buttons: Cancel, Remove image.
- Force remove image: “Force remove `{image}`? This can break containers that reference it.” Buttons: Cancel, Force remove.
- Remove container: “Remove container `{name}`? Its writable layer will be deleted.” Buttons: Cancel, Remove container.
- Stop container: no modal; use inline action with undo-style restart toast if stopped successfully.
- Prune: “Prune Docker resources? This will remove {summary}. This cannot be undone.” Require typing `prune` when volumes or unused images selected.
- Compose down with volumes: “Stop project `{project}` and remove volumes? Database data may be deleted.” Require checkbox “I understand volumes will be removed.”

## Keyboard Shortcuts
- Global: `Cmd/Ctrl + Left Shift + D` open Docker page.
- Page: `Cmd/Ctrl + R` refresh Docker data.
- Tabs: `Cmd/Ctrl + 1–5` switch Hub, Images, Containers, Compose, Activity.
- Search focus: `/`.
- Action menu: `A` or `Shift+F10`.
- Run selected image: `R`.
- Logs for selected container: `L`.
- Exec for selected running container: `E`.
- Inspect selected item: `I`.
- Close drawer/dialog: `Esc`.

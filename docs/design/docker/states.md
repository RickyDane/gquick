# States: Docker Page

## Loading
- Header status: spinner + “Checking Docker…”.
- Main area: 5 skeleton rows matching selected tab.
- Disable lifecycle actions until status known.

## Empty States
- No images: “No Docker images yet. Search Docker Hub to pull one.” CTA “Search Hub”.
- No containers: “No containers found. Run an image to create one.” CTA “Run image”.
- No compose paths: “No Compose files saved. Add an existing path or create one.” CTAs “Add path”, “Create compose file”.
- No activity: “No Docker tasks running.”

## Error States
- Docker missing: red bordered panel with install/configure actions.
- Daemon down: amber panel with Retry and Open Docker Desktop.
- Docker Hub API/network failure: non-blocking banner in Hub tab.
- Pull failed: Activity tray error, expandable logs, Retry.
- Run failed: Run form stays open, output panel focuses first error line.
- Compose validation errors: editor line highlights + summary banner.
- Permission denied: show socket/path details and Copy diagnostics.

## Long Content
- Logs: virtualized, capped to last selected line count; search only loaded buffer unless “Load more” selected.
- Inspect JSON: lazy tree expansion; search collapses non-matching nodes.
- Compose editor: sticky filename/status bar; unsaved dot in tab.

## Accessibility
- All icon buttons require `aria-label`.
- Status chips include text, not color only.
- Progress bar uses `aria-valuenow` when determinate and text fallback.
- Confirmation dialogs trap focus and restore focus to triggering action.
- Destructive buttons use red text plus clear labels.
- Keyboard navigation mirrors existing launcher list pattern.

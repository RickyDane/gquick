# Release Notes: Docker Management

## Summary
Expanded GQuick's Docker support into a fuller Docker management workflow, making it easier to find images, run containers, manage Compose projects, and inspect Docker resources from one dedicated page.

## What's New
- **Dedicated Docker Page**: Open Docker management quickly with `Cmd/Ctrl + Left Shift + D`.
- **Docker Hub Search**: Search Docker Hub through the Docker Hub API and open an action menu for matching images.
- **Image Pulling**: Pull Docker images directly from GQuick.
- **Run Container Form**: Start containers with common options for ports, environment variables, volumes, container name, detached mode, and interactive mode.
- **Image and Container Management**: View and manage Docker images and containers, including logs, exec output, inspect details, and prune actions.
- **Docker Compose Support**: Read and write Compose files, then run Compose actions using `docker compose`.
- **Status Detection**: GQuick now detects Docker CLI availability and Docker daemon status so users can understand setup issues sooner.
- **Risk Confirmations**: Risky actions now ask for confirmation before proceeding.

## Bug Fixes
- No specific bug fixes are included in this release.

## Migration Notes
No migration required. Existing Docker usage continues to work, with new management features available from the dedicated Docker page.

## Breaking Changes
None.

## Limitations
- Exec output is captured from non-interactive commands; fully interactive terminal sessions are not supported.
- Pull progress and container logs are not streamed live.
- Compose actions use `docker compose`; legacy `docker-compose` is not used.
- Docker commands have a 120-second timeout.

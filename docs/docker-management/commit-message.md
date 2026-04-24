feat(docker): expand Docker management workflows

Add a dedicated Docker page with Docker Hub search, image pulls,
container run options, Compose actions, resource management, and Docker
status detection. This makes common Docker tasks available inside GQuick
while adding confirmations around risky operations.

Document current limitations: exec captures non-interactive output,
pulls and logs are not streamed live, Compose uses `docker compose`, and
commands time out after 120 seconds.

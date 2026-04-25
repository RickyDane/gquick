# Release Notes: Terminal Command Search

## Summary
Main search can now launch and run terminal commands directly, making command execution faster without leaving the search flow.

## What's New
- **Terminal Command Mode**: Use the `>` prefix to enter a terminal command. This prefix now starts command mode instead of translation.
- **Open in Terminal**: Press Enter to open the command in an external terminal.
- **Run Inline**: Press Left Shift+Enter to run the command inside search. Output appears in the search UI after the command finishes.
- **Safe Inline Cancellation**: Closing or hiding search while an inline command is running asks for confirmation and cancels the command if confirmed.
- **Translation Prefixes**: Translation remains available with `t:` and `tr:`.

## Bug Fixes
- No user-facing bug fixes in this release.

## Migration Notes
If you previously used `>` for translation, switch to `t:` or `tr:`.

## Breaking Changes
- The `>` prefix now starts terminal command mode instead of translation.

## Caveats
- Inline command output appears after the command exits; it is not streamed live yet.
- Cancellation is best effort for commands that daemonize or spawn detached child processes.

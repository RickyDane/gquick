# Release Notes: Speedtest Plugin

## Summary
GQuick now includes a finished speedtest plugin for checking internet performance directly from the launcher, with live results, configurable test settings, and immediate cancellation.

## What's New
- **Speedtest Commands**: Start a test with `speedtest`, `speed test`, `internet speed`, or `/st`.
- **Cloudflare-Based Testing**: Runs tests through Cloudflare frontend HTTP endpoints.
- **Live and Final Results**: Shows ping, download, and upload values in the selected list item while the test runs and after it finishes.
- **Updated Detail Panel**: Shows a progress bar, current status, Start/Stop controls, and configuration controls in one place.
- **Configurable Test Settings**: Adjust test duration, download package size, and upload package size.
- **Saved Preferences**: Settings are validated and persisted in localStorage.
- **Immediate Stop**: Stop cancels an in-progress speed test right away.

## Bug Fixes
- Removed duplicate metric cards from the detail panel to reduce clutter.

## Migration Notes
No migration required. Default settings are 15 seconds, 50 MB download package size, and 25 MB upload package size.

## Breaking Changes
None.

## Notes
- Network data use depends on configured duration and package sizes.
- Build passed.

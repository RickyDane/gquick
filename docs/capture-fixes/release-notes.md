# Release Notes: Capture Region Fixes

## Summary
Improved screenshot capture reliability on macOS by ensuring the correct monitor is targeted and physical coordinates are correctly calculated based on high-DPI (Retina) scaling factors.

## What's New
- Replaced basic monitor selection with a check against the application's active monitor to prevent capture errors on multi-monitor setups.
- Implemented scale-factor-aware coordinate mapping to ensure selected regions match the actual screen area captured.

## Bug Fixes
- Fixed "black screen" captures by correctly mapping logical coordinates to physical coordinates using the window's scale factor.
- Ensured selected capture regions are validated against image dimensions to prevent out-of-bounds errors during cropping.

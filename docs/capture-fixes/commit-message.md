fix(capture): resolve black screen issues on macOS

Ensure accurate screen capture by:
- Matching xcap monitor to current window's monitor
- Correctly applying window scale factor to map logical to physical coordinates
- Validating capture region bounds

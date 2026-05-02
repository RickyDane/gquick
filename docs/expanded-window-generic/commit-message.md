feat(windows): make expanded window feature generic

Replace hardcoded Docker-specific expanded window implementation with
a generic config map system. Any view can now be configured to open in
an expanded window by adding a single entry to EXPANDED_WINDOW_VIEWS.

Key changes:
- Add EXPANDED_WINDOW_VIEWS config map with docker and chat entries
- Add isExpandedView() and getExpandedWindowSize() helper functions
- Update window resize logic to use config map instead of hardcoded check
- Rename CSS class from gquick-docker-root to gquick-expanded-root
- Configure chat view to open in expanded window (1200x860) by default
- Simplify back button to work generically for all expanded views

Files modified:
- src/App.tsx
- src/index.css
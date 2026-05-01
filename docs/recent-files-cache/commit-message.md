feat(search): add instant recent files cache

Implement a dedicated recentFilesPlugin that returns recently opened
files/folders immediately (no debounce) while the filesystem scan
continues to run with its 500ms debounce.

Key changes:
- Add getRecentItemsByPlugin() to usageTracker for filtering history
- Create recentFilesPlugin with score 200 (above filesystem exact-match)
- Remove recent-file boosting from fileSearchPlugin (pure filesystem now)
- Deduplicate published items by ID, keeping first occurrence
- Hide search indicator for immediate plugins, show only for debounced
- Merge recent files into unified Recent section with proper icons

This eliminates the 500ms wait for recently opened items and stops
the "Searching files…" flash on every keystroke.

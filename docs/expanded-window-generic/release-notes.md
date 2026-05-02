# Release Notes: Generic Expanded Window Feature

## Summary
Made the Docker expanded window feature generic so any view can be configured to open in a bigger window. The AI chat now opens in the expanded window by default.

## What's New

### Generic Expanded Window System
- **Configurable Views**: Any view can now be configured to open in an expanded window by adding it to a simple config map
- **AI Chat Expansion**: Chat view now opens in expanded window (1200x860) by default
- **Easy Configuration**: Adding new expanded views requires just one line in the config map
- **Clean API**: New helper functions `isExpandedView()` and `getExpandedWindowSize()` for clean checks

### Improved User Experience
- **Consistent Behavior**: All expanded views now use the same window management system
- **Better Space Utilization**: Expanded views fill available space for optimal viewing
- **Simplified Navigation**: Back button works generically for all expanded views

## Changes

### Technical Improvements
- **Config Map**: Replaced hardcoded `DOCKER_WINDOW_SIZE` with generic `EXPANDED_WINDOW_VIEWS` config map
- **CSS Renaming**: Renamed `gquick-docker-root` class to `gquick-expanded-root` for clarity
- **Window Resize Logic**: Uses config map instead of hardcoded docker check
- **Back Button**: Simplified to work generically for all views

## Bug Fixes
- Fixed hardcoded Docker-specific window management that prevented other views from using expanded windows
- Fixed inconsistent window behavior between different expanded views

## Migration Notes
- **No action required** for existing users
- Docker expanded window functionality remains unchanged
- Chat view now opens in expanded window by default (previously opened in standard window)

## Breaking Changes
- **CSS class renamed**: `gquick-docker-root` → `gquick-expanded-root` (affects any custom CSS targeting this class)

## Configuration
To add a new expanded view, simply add an entry to the config map:
```typescript
const EXPANDED_WINDOW_VIEWS = {
  docker: { width: 1200, height: 860 },
  chat: { width: 1200, height: 860 },
  notes: { width: 1200, height: 860 },  // just add here
};
```

## Files Modified
- `src/App.tsx`
- `src/index.css`
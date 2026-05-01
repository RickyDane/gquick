# Recent Files Plugin

**File:** `src/plugins/recentFiles.tsx`

## Overview

`recentFilesPlugin` is an **immediate plugin** (no debounce) that surfaces recently opened files and folders from usage history stored in `localStorage`. It returns matches with a high score (200) so they consistently rank above runtime filesystem scan results from `fileSearchPlugin`.

## Why immediate?

The plugin reads from `localStorage` synchronously and performs lightweight string matching. It does not call the backend or any external API, so it runs instantly without needing a debounce delay or loading indicator.

## Architecture

```mermaid
flowchart TD
  Query[User query, length >= 2] --> shouldSearch[shouldSearch: true]
  shouldSearch --> getItems[getItems]
  getItems --> Filter[getRecentItemsByPlugin("file-search", 5)]
  Filter --> Match[Normalize + substring match on title and path]
  Match --> Score[score: 200]
  Score --> onSelect[onSelect: recordUsage + open_file]
```

## Data source

- Uses `getRecentItemsByPlugin("file-search", 5)` from `src/utils/usageTracker.ts`.
- Returns up to 5 most recent file-search usage entries sorted by recency (`timestamp` descending).
- Each entry is a `UsageEntry` with `id` (file path), `title`, `subtitle`, `timestamp`, and `count`.

## Matching logic

1. Normalize query and entry title/path with Unicode NFD decomposition + diacritic removal + lowercase.
2. Check if normalized query is a substring of normalized title **or** normalized path.
3. If match, create a `SearchResultItem` with `score: 200`.

## Result scoring

- `recentFilesPlugin` assigns **200** to all matches.
- This is intentionally higher than `fileSearchPlugin` exact match (115) so recent files always appear above filesystem scan results.

## Selection behavior

```ts
onSelect: async () => {
  // Re-record usage under file-search plugin for continuity
  recordUsage({ id: entry.id, pluginId: "file-search", ... });
  await invoke("open_file", { path: entry.id });
}
```

- Re-records the selection under `pluginId: "file-search"` so the usage history remains coherent with the main file search plugin.
- Opens the file via the Rust `open_file` command.

## Registry position

`recentFilesPlugin` is registered **second** in `src/plugins/index.ts`, immediately after `appLauncherPlugin` and before `fileSearchPlugin`. This ensures its results are processed early and can be deduplicated before debounced plugins complete.

## Deduplication

In `App.tsx`, `publishItems()` merges results from immediate and debounced plugins and deduplicates by `id`, keeping the **first occurrence**. Because `recentFilesPlugin` is an immediate plugin, its results take priority over `fileSearchPlugin` results for the same path.

## No AI tools

`recentFilesPlugin` does not expose any AI tools. It is purely a search-ranking enhancement.

## SearchSuggestions integration

`SearchSuggestions.tsx` no longer has a dedicated "Recent Files" section. Instead, file-search entries appear in the unified **"Recent"** section alongside app-launcher entries, based on `getRecentItems(8)` from `usageTracker.ts`.

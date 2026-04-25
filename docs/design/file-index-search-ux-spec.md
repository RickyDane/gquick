# UX Spec: Faster File/Folder Search + File Index Viewer

## Overview
Improve GQuick file/folder discovery while keeping current dark launcher feel: translucent `bg-zinc-900/95`, rounded panels, compact rows, blue/cyan accents, keyboard-first behavior. Scope is UX/spec only; no implementation details beyond user-facing behavior.

Goals:
- Most filename/folder searches feel responsive within **1–5 seconds**, with first useful results sooner.
- Runtime-found files/folders are **added directly to the index** so repeat searches become instant or near-instant.
- Add a dedicated **File Index** page to inspect, validate, refresh, and rebuild indexed paths.

Non-goals:
- Full filesystem admin UI.
- Complex content preview/editor.
- Destructive bulk file operations.

## Launcher Search Behavior

### Performance Experience
- Query starts at 2+ characters, using existing launcher input.
- Target timeline:
  - `0–150ms`: show cached/indexed matches if available.
  - `150–500ms`: show “Searching index…” only if no results yet.
  - `500ms–5s`: stream/add runtime matches incrementally.
  - `5s+`: stop waiting in launcher, keep partial results, show non-blocking “Still indexing/searching…” status with action to open File Index page.
- Search must never blank existing results while runtime search continues. New/better results merge into list.
- Repeat search for a previously runtime-found item should show that item from index immediately.

### Incremental Results
- Result list states:
  1. **Instant index results**: normal file/folder rows.
  2. **Runtime additions**: newly found rows fade/slide in subtly and show a small `Newly indexed` pill for current query only.
  3. **Still searching**: compact spinner row below results: `Searching deeper… 14 found`.
  4. **Complete**: spinner disappears; optional footer text: `Indexed 6 new items` for 3 seconds.
- Ranking priority:
  1. Exact basename/folder name match.
  2. Prefix match.
  3. Recent/opened or newly indexed match.
  4. Path segment match.
  5. Fuzzy match.
- Duplicate paths must collapse into one row. If runtime result duplicates indexed item, update metadata silently.

### Direct Add-to-Index Feedback
- When runtime search finds an item, it is immediately queued/added to index.
- User-facing feedback should be subtle:
  - Row pill: `Newly indexed` (`bg-cyan-500/10 text-cyan-300 border-cyan-500/20`).
  - Footer status: `Added to file index for faster future searches`.
- If indexing add fails, do not block opening the file. Show low-priority warning in status row: `Found, but not indexed — retry from File Index`.

### Search Status Copy
- Initial with no results: `Searching files and folders…`
- With partial results: `Searching deeper…`
- After timeout/slow search: `Search is taking longer than expected. Showing partial results.`
- Index refresh running: `Refreshing file index in background…`
- Error: `File search unavailable. Open File Index to validate paths.`

## Dedicated File Index Page

### Entry Points
- Command palette/action list (`Cmd/Ctrl + K`): **File Index** with file/folder icon.
- Launcher query action: typing `file index`, `index files`, or `validate index` surfaces **Open File Index**.
- Footer/status link during slow search: `Open File Index`.
- Optional shortcut: **Cmd/Ctrl + Shift + I**. If shortcut conflict exists, keep command palette only.

### Page Layout
Use same expanded workspace pattern as Docker/Notes when needed.

- Window target: `min-w 760px`, `h 620–800px`; responsive down to launcher width with stacked filters.
- Header:
  - Icon: `FolderSearch` or `Database` in cyan.
  - Input placeholder: `Search indexed files and folders…`
  - Buttons: `Refresh`, `Rebuild`, `Actions`.
- Body:
  - Top status strip.
  - Filter toolbar.
  - Index table/list.
  - Optional right-side detail drawer on wide screens.
- Footer:
  - Keyboard hints: `↵ Open`, `Space Preview`, `⌘R Refresh`, `⌘⇧R Rebuild`, `Esc Back`.

### Status Strip
Show compact cards or chips:
- **Indexed items**: total count.
- **Files / Folders**: split count.
- **Last updated**: relative time.
- **Health**: `Valid`, `Refreshing`, `Needs validation`, `Errors found`.
- **Roots**: count of indexed roots.

Progress state:
- Spinner + progress text: `Refreshing index… 12,450 scanned · 320 added · 18 removed`.
- If exact progress unavailable, show indeterminate spinner with current phase: `Scanning Documents…`.
- Keep page usable while refresh/rebuild runs.

### Fields Shown in Index List
Each row:
- Type icon: file or folder.
- Name.
- Full path, truncated middle when needed.
- Kind/type: `Folder`, extension (`PDF`, `TSX`, `MD`, etc.), or `Unknown`.
- Size for files; `—` for folders if unavailable.
- Modified date/time.
- Indexed at / last seen.
- Status pill:
  - `Valid` emerald.
  - `Missing` amber/red.
  - `Excluded` zinc.
  - `New` cyan.
  - `Stale` amber.

Detail drawer fields:
- Full path with copy button.
- Parent folder with `Reveal` action.
- Created/modified/indexed timestamps.
- Source: `Initial scan`, `Runtime search`, `Manual refresh`.
- Validation result and latest error, if any.
- Actions: `Open`, `Reveal in Finder`, `Copy path`, `Remove stale entry`.

### Filters and Search
- Text search across name and path.
- Type chips: `All`, `Files`, `Folders`.
- Status chips: `Valid`, `Missing`, `Stale`, `New`, `Excluded`.
- Root selector: `All roots`, then user roots such as Documents/Desktop/Downloads/Home.
- Sort menu:
  - Relevance/default.
  - Name A–Z.
  - Recently modified.
  - Recently indexed.
  - Size.
- Filter result count: `Showing 120 of 18,430 indexed items`.
- Empty filtered state: `No indexed items match these filters` + `Clear filters`.

### Refresh / Rebuild / Validate Controls
- **Refresh** (`Cmd/Ctrl + R`): incremental update. Keeps current index and adds/removes changed entries.
- **Rebuild** (`Cmd/Ctrl + Shift + R`): full rescan. Requires confirmation modal/sheet:
  - Title: `Rebuild file index?`
  - Copy: `GQuick will rescan indexed locations. Searches may be partial while this runs.`
  - Buttons: `Cancel`, `Rebuild index`.
- **Validate**: checks whether indexed paths still exist without rescanning all roots.
- **Cancel**: visible for long-running refresh/rebuild if backend supports cancellation. If not supported, disable with tooltip: `Finishes current scan first`.

### Empty States
- No index yet:
  - Title: `File index is empty`
  - Body: `Build an index to make file and folder searches faster.`
  - Primary: `Build index`
  - Secondary: `Search without index`
- Index disabled/unavailable:
  - Title: `File index unavailable`
  - Body: `GQuick can still search at runtime, but repeat searches may be slower.`
  - Action: `Retry`.
- No search results:
  - Title: `No indexed match`
  - Body: `Try a broader name, clear filters, or refresh the index.`
  - Actions: `Clear filters`, `Refresh`.

### Error States
- Permission denied:
  - `Some folders could not be indexed due to permissions.`
  - Show affected root/path count and `Open Settings` if permissions are configurable.
- Stale/missing entries:
  - Banner: `23 indexed items are missing from disk.`
  - Actions: `Remove stale entries`, `Validate again`.
- Refresh failed:
  - Banner: `Index refresh failed. Existing index is preserved.`
  - Actions: `Retry`, `Copy error`.

## Visual Design

### Palette
- Background: `bg-zinc-900/95`, `bg-zinc-950/40`.
- Panels/rows: `bg-white/5`, hover `bg-white/10`, borders `border-white/10`.
- Primary actions: `bg-blue-600 hover:bg-blue-500 text-white`.
- File index accent: cyan (`text-cyan-400`, `bg-cyan-500/10`, `border-cyan-500/20`).
- Success: emerald. Warning: amber. Error: red. Muted text: zinc 400/500.

### Typography + Spacing
- Header input: `text-lg text-zinc-100`.
- Page title/status: `text-sm font-medium`.
- Row title: `text-[13px] font-medium`.
- Path/metadata: `text-[11px] text-zinc-500`.
- Row padding: `px-3 py-2.5`, card padding `p-3`, section gaps `gap-2/3`.

## Accessibility
- All actions keyboard reachable.
- Rows expose file/folder name, path, status, and primary action to screen readers.
- Progress uses live region copy, not spinner-only feedback.
- Color states always include text labels (`Valid`, `Missing`, `Stale`).
- Focus ring matches existing `ring-white/10`/blue accent but remains visible.

## Acceptance Criteria
- Search displays indexed results immediately when present and runtime results incrementally.
- Runtime-found items clearly become indexed for future searches.
- Slow searches provide partial results and status within 1–5 seconds.
- File Index page is reachable from Actions and slow-search status.
- File Index page shows counts, health, last updated, searchable/filterable item list, refresh/rebuild/validate controls, progress, and empty/error states.

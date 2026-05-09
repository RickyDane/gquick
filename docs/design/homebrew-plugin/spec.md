# Design Spec: Homebrew Plugin for GQuick

## 1. Overview

The Homebrew plugin provides a dedicated management interface for Homebrew packages (formulae and casks) inside GQuick. It follows the **Docker plugin reference pattern**: a `brew:` launcher prefix, a full-page `HomebrewView` with tabs, and deep integration into the actions panel.

**Platform restriction:** Homebrew is only available on **macOS and Linux**. On Windows, the plugin is hidden from the actions panel and its `shouldSearch` returns `false`.

---

## 2. Files & Module Structure

| File | Purpose |
|------|---------|
| `src/plugins/homebrew.tsx` | Plugin definition: `brew:` search, result items, actions |
| `src/components/HomebrewView.tsx` | Full-page view with tabs (Installed, Search, Outdated) |
| `src/utils/homebrewApi.ts` | Optional thin wrapper for `brew search --json`, `brew info --json` |

---

## 3. Visual Design System

### 3.1 Color Palette
Homebrew uses an **amber/orange** accent to differentiate from Docker's cyan.

| Token | Value | Usage |
|-------|-------|-------|
| Primary accent | `text-amber-400` | Active tab, focused row border, action buttons |
| Primary bg | `bg-amber-500/10` | Selected states, badges, status chips |
| Primary border | `border-amber-500/20` | Cards, selected row borders, input focus ring |
| Primary button | `bg-amber-600 hover:bg-amber-500` | Install, Upgrade primary CTAs |
| Success | `text-emerald-400` | Successfully installed, up-to-date packages |
| Warning | `text-amber-300` | Outdated packages, warnings |
| Error / Destructive | `text-red-400`, `bg-red-500/10`, `border-red-500/20` | Uninstall, failed operations |
| Neutral (base) | `bg-zinc-950/95`, `bg-white/5`, `border-white/10`, `text-zinc-100/400/500` | Surfaces, borders, text — consistent with GQuick dark theme |

### 3.2 Typography
- Page title: `text-sm font-medium text-zinc-100`
- Tab labels: `text-xs font-medium`
- Package name (list title): `text-[13px] font-medium text-zinc-100`
- Description / metadata: `text-[11px] text-zinc-500`
- Version badge: `text-[11px] font-mono`
- Status bar / toast: `text-xs`
- Monospace fields (tap names, paths): `text-xs font-mono text-zinc-400`

### 3.3 Spacing System
- Base unit: 4px
- Page padding: `p-3`
- List row padding: `px-3 py-2.5`
- Tab bar padding: `p-2`
- Section gap: `gap-2` or `gap-3`
- Detail panel width: 280–320px (same as Docker, optional)

### 3.4 Iconography
- Plugin icon: `Beer` from `lucide-react` (preferred). Fallback: `Package`.
- Actions panel: same `Beer` icon with `text-amber-400`.
- List item icon: `Package` (formula) / `Monitor` or `AppWindow` (cask) — small `h-4 w-4 text-zinc-500`.
- Status indicators:
  - Installed: `CheckCircle2` in emerald
  - Outdated: `AlertCircle` in amber
  - Error: `XCircle` in red

---

## 4. Component Hierarchy

```
HomebrewView
├── HeaderBar
│   ├── Title + Beer icon
│   ├── StatusChip (brew version, health)
│   └── SearchInput (global, persists across tabs)
├── TabBar
│   ├── "Installed"
│   ├── "Search"
│   └── "Outdated"
├── ContentArea
│   ├── InstalledTab
│   │   ├── PackageList
│   │   │   └── PackageRow (icon, name, version, date, tap, actions)
│   │   └── EmptyState / LoadingState
│   ├── SearchTab
│   │   ├── SearchInput (integrated with global, or uses global)
│   │   ├── PackageList (remote results)
│   │   └── EmptyState / LoadingState
│   └── OutdatedTab
│       ├── PackageList (current → latest version)
│       ├── BulkActions ("Upgrade All")
│       └── EmptyState / LoadingState
├── StatusBar (bottom)
│   ├── brew --version
│   ├── Last refreshed
│   └── Health / error message
└── ConfirmDialog (uninstall, upgrade all)
```

---

## 5. Tab Specifications

### 5.1 Installed Tab
**Purpose:** Browse and manage locally installed formulae and casks.

**Data displayed per row:**
- Icon: `Package` for formula, `Monitor` for cask
- Name: bold, `text-[13px]`
- Description: one-line truncate, `text-[11px] text-zinc-500`
- Version badge: `text-[11px] font-mono bg-white/5 rounded-full px-1.5 py-0.5`
- Installed date: `text-[11px] text-zinc-600`
- Tap: `text-[11px] font-mono text-zinc-500` (e.g., `homebrew/core`)
- Type badge: "formula" or "cask" pill

**Row actions (kebab menu or inline buttons):**
- **Info** — open `brew info <name>` in detail panel or modal
- **Upgrade** — `brew upgrade <name>` (only if outdated; disabled otherwise)
- **Uninstall…** — triggers confirmation dialog

**Empty state:**
> "No packages installed yet."
> Subtitle: "Homebrew is installed but your cellar is empty. Search and install packages from the Search tab."
> CTA button: "Go to Search"

**Loading state:**
> Spinner + "Loading installed packages…"

### 5.2 Search Tab
**Purpose:** Search for packages across Homebrew formulae and casks.

**Search behavior:**
- Input at top of content area (or reuse global search input)
- Debounce: 300ms
- If query < 2 chars: show empty state or recent searches
- Query 2+ chars: run `brew search --json <query>` or API fallback

**Data displayed per row:**
- Icon: `Package` / `Monitor`
- Name: bold
- Description: one-line truncate
- Version badge: latest stable version
- Install count (if available from API): `text-[11px] text-zinc-600`
- Tap name

**Row actions:**
- **Install** — primary amber button; disabled if already installed
- **Info** — opens detail panel with full metadata

**Empty state:**
> "No packages found for '{query}'."
> Subtitle: "Try a different search term or check the Homebrew naming conventions."

**Loading state:**
> Spinner + "Searching Homebrew…"

**Error state:**
> Amber banner: "Homebrew search failed. Check your connection and try again."
> Action: Retry button

### 5.3 Outdated Tab
**Purpose:** Show packages with available updates.

**Data displayed per row:**
- Icon + Name (same as Installed)
- Current version: `text-[11px] font-mono text-zinc-400`
- Arrow: `ArrowRight` icon `text-zinc-600`
- Latest version: `text-[11px] font-mono text-amber-400`
- Tap

**Bulk actions (top of list):**
- **Upgrade All** — amber primary button; triggers confirmation dialog if >5 packages

**Row actions:**
- **Upgrade** — upgrades single package
- **Info** — shows changelog or info if available

**Empty state:**
> "All packages are up to date."
> Subtitle: "You're running the latest versions of all installed formulae and casks."
> Icon: `CheckCircle2` in emerald

**Loading state:**
> Spinner + "Checking for outdated packages…"

---

## 6. Interaction Flows

### 6.1 Search Flow (Launcher)
1. User types `brew:` → top result: "Open Homebrew" with `Beer` icon, score 120
2. User types `brew: <query>` → plugin searches:
   - Local installed packages matching query (score 100)
   - If query ≥ 2 chars, search remote via `brew search` (score 80)
3. Each result has actions array:
   - Installed match: Uninstall, Upgrade (if outdated), Info
   - Remote match: Install, Info
4. `onSelect` opens `HomebrewView` with relevant tab pre-selected

### 6.2 Install Flow
1. User finds package in Search tab or launcher results
2. Clicks **Install** (or `onRun` from launcher action)
3. Button switches to spinner + "Installing…"
4. On success:
   - Row updates (if in Search tab: button changes to "Installed" or disabled)
   - Toast: "Installed `<name>`"
   - Installed tab auto-refreshes
5. On failure:
   - Inline error on row or banner
   - Button returns to "Install"
   - Error message in status bar

### 6.3 Uninstall Flow
1. User clicks **Uninstall…**
2. Confirmation dialog appears:
   - Title: "Uninstall `<name>`?"
   - Description: "This will remove `<name>` and all associated files. This action cannot be undone."
   - Buttons: Cancel (secondary), Uninstall (red destructive)
3. On confirm:
   - Row shows spinner + "Uninstalling…"
   - On success: row removed from Installed tab, toast shown
   - On failure: error banner

### 6.4 Upgrade Flow
1. User clicks **Upgrade** on single package or **Upgrade All**
2. If Upgrade All and >5 packages: confirmation dialog
   - Title: "Upgrade N packages?"
   - Description: "This will upgrade all outdated formulae and casks."
3. During upgrade:
   - Button disabled with spinner
   - Status bar shows "Upgrading `<name>`…"
4. On completion:
   - Outdated tab refreshes (row removed if now current)
   - Toast: "Upgraded `<name>` to `<version>`"

### 6.5 Info Flow
1. User clicks **Info**
2. Detail panel or modal opens showing:
   - Full name, description, homepage URL
   - Versions (stable, head)
   - Dependencies (runtime and build)
   - Caveats (if any)
   - Conflicts with
   - Installation path / cellar path
3. Actions in detail panel: Open homepage, Copy install command

---

## 7. Launcher Search Integration

### Query Prefix
```ts
const BREW_PREFIX_PATTERN = /^brew\s*:/i;
```

### Result Items

| Item | Score | Condition |
|------|-------|-----------|
| "Open Homebrew" | 120 | Always shown when prefix matches |
| Installed match | 100 | `brew list` result matches query |
| Remote match | 80 | `brew search` result, query ≥ 2 chars |

### Top Result Behavior
When query is just `brew:` or `brew: ` (no search term):
- Show: "Open Homebrew" with subtitle "Type `brew: <package>` to search installed and remote packages."

### Actions Panel Entry
Homebrew appears in the actions panel like Docker:
- Icon: `Beer`
- Color: `text-amber-400`
- Label: "Homebrew"
- Shortcut: `⌘ L⇧ B` / `Ctrl+Shift+B`
- `onClick`: opens Homebrew view

---

## 8. App.tsx Integration Points

### 8.1 View State
Add `"homebrew"` to the `view` union type:
```ts
type View = "search" | "chat" | "settings" | "actions" | "notes" | "docker" | "homebrew";
```

### 8.2 Expanded Window
Add to `EXPANDED_WINDOW_VIEWS`:
```ts
homebrew: { width: 1200, height: 860 }
```

### 8.3 Shortcut Handler
Add `isHomebrewShortcut` function (mirrors `isDockerShortcut`):
```ts
function isHomebrewShortcut(e: KeyboardEvent, isLeftShiftPressed: boolean): boolean {
  const isBKey = e.code === "KeyB" || e.key.toLowerCase() === "b";
  return (e.metaKey || e.ctrlKey) && e.shiftKey && isLeftShiftPressed && isBKey;
}
```
Wire into global keydown handler:
```ts
if (isHomebrewShortcut(e, isLeftShiftPressedRef.current) && view !== "actions") {
  e.preventDefault();
  setView(prev => prev === "homebrew" ? "search" : "homebrew");
  setQuery("");
  setHomebrewSearchQuery("");
}
```

### 8.4 Actions Panel
Add to `appActions` array (before Docker to keep alphabetical or after):
```ts
{ id: "homebrew", label: "Homebrew", icon: Beer, shortcut: `${modKey} L⇧ B`, onClick: () => setView("homebrew") }
```

Note: Only render/include this action on macOS and Linux. On Windows, hide or disable.

### 8.5 State & Event Listeners
- Add `homebrewSearchQuery` state + setter
- Add `homebrewInitialPackage` state (optional, for deep-linking from launcher)
- Add window event listener for `gquick-open-homebrew`
- Add window hidden cleanup for homebrew state

### 8.6 Render View
Add `homebrew` branch in the view renderer:
```tsx
: view === "homebrew" ? (
  <HomebrewView searchQuery={homebrewSearchQuery} onSearchQueryChange={setHomebrewSearchQuery} />
)
```

---

## 9. Responsive Considerations

The Homebrew view uses the same responsive strategy as Docker:

| Breakpoint | Behavior |
|------------|----------|
| `>= 760px` (default) | Left tab sidebar (w-24 to w-32), main content, optional detail drawer |
| `560–759px` | Horizontal pill tabs at top; detail drawer overlays from right |
| `< 560px` | Single column; action menus remain keyboard-accessible; detail drawer becomes bottom sheet |

**List rows:** Always full-width within content area. Action buttons collapse to kebab menu `⋯` on very narrow widths.

**Search input:** Always visible at top of content area. On small screens, uses full width with reduced padding.

---

## 10. Empty, Loading, and Error States

### 10.1 Empty States

| Tab | Message | Subtitle | CTA |
|-----|---------|----------|-----|
| Installed | "No packages installed yet." | "Your Homebrew cellar is empty." | "Go to Search" |
| Search (no query) | "Search Homebrew packages" | "Type a package name to find formulae and casks." | — |
| Search (no results) | "No packages found for '{query}'" | "Try a different search term." | — |
| Outdated | "All packages are up to date." | "You're running the latest versions." | — |

**Empty state styling:**
- Centered flex layout
- Icon: `Search` / `Package` / `CheckCircle2` at `h-8 w-8 text-zinc-600`
- Title: `text-sm text-zinc-400`
- Subtitle: `text-[11px] text-zinc-600`
- CTA: amber primary button

### 10.2 Loading States
- Global page load (first mount): `Loader2` spinner + "Loading Homebrew…" in center
- Tab switch / refresh: Subtle spinner in status bar + list rows show skeleton placeholders
- Search: Spinner in search input (right side) + "Searching Homebrew…" below input
- Action in progress: Button-level spinner, disabled state

**Skeleton row styling:**
```
rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5
├── pulse block (w-32 h-4 bg-white/5 rounded)  // name
└── pulse block (w-48 h-3 bg-white/5 rounded mt-1.5) // subtitle
```

### 10.3 Error States

| Scenario | Display | Recovery |
|----------|---------|----------|
| brew not in PATH | Full-page amber banner: "Homebrew not found. Install from brew.sh." | Link to brew.sh, Retry button |
| brew command fails | Inline banner in content area | Retry, dismiss |
| Search fails | Banner below search input | Retry search |
| Install/uninstall fails | Inline row error + status bar message | Retry action |
| Network issue (API) | Amber banner | Retry |

**Error banner component:**
```
rounded-xl border border-amber-500/20 bg-amber-500/5 p-3
flex items-center gap-2 text-xs text-amber-100
Icon: AlertTriangle
Text: error message
Action: Retry button (text-xs, amber)
```

---

## 11. Confirmation Dialogs

### Uninstall Single Package
```
┌─────────────────────────────────────────┐
│  ⚠️  Uninstall <name>?                  │
│                                         │
│  This will remove <name> and all        │
│  associated files. This cannot be       │
│  undone.                                │
│                                         │
│  [Cancel]          [Uninstall]          │
│            (red destructive button)     │
└─────────────────────────────────────────┘
```

### Upgrade All Packages
```
┌─────────────────────────────────────────┐
│  ⬆️  Upgrade N packages?                │
│                                         │
│  This will upgrade all outdated         │
│  formulae and casks.                    │
│                                         │
│  [Cancel]          [Upgrade All]        │
│            (amber primary button)       │
└─────────────────────────────────────────┘
```

**Dialog styling:** Same as Docker's prune dialog:
- Backdrop: `fixed inset-0 bg-black/45 backdrop-blur-sm`
- Card: `rounded-2xl border border-white/10 bg-zinc-950/95 p-4 shadow-2xl`
- Title: `text-sm font-semibold text-zinc-100`
- Description: `text-xs text-zinc-400`
- Cancel: `border border-white/10 bg-white/5 text-zinc-300`
- Confirm: context-specific (red for destructive, amber for primary)

---

## 12. Status Bar

Fixed at bottom of `HomebrewView`:

```
┌─────────────────────────────────────────────────────────────┐
│  Homebrew 4.2.0  •  42 installed  •  3 outdated  •  Ready   │
└─────────────────────────────────────────────────────────────┘
```

**Fields:**
- `brew --version` output (e.g., "Homebrew 4.2.0")
- Installed count
- Outdated count (amber if >0)
- Current operation status ("Ready", "Installing redis…", "Upgrading 3 packages…")
- Last refreshed timestamp

**Styling:**
- Height: `h-8`
- Background: `border-t border-white/5 bg-white/[0.02]`
- Text: `text-[11px] text-zinc-500`
- Accent text: `text-amber-400` for outdated count

---

## 13. Accessibility

- **Keyboard navigation:** Tab through tabs with arrow keys; Enter to select; Space to activate buttons
- **Focus rings:** `focus:border-amber-500/40 focus:bg-white/10` on rows
- **ARIA:**
  - Tab list: `role="tablist"`, tabs: `role="tab"`, panels: `role="tabpanel"`
  - Search input: `aria-label="Search Homebrew packages"`
  - Action buttons: `aria-label="Install <name>"`, etc.
  - Loading buttons: `aria-busy="true"`
- **Screen readers:** Status bar updates announced via `aria-live="polite"`
- **Color contrast:** All amber text on zinc backgrounds meets WCAG AA (amber-400 on zinc-950)

---

## 14. Platform Considerations

| Platform | Behavior |
|----------|----------|
| **macOS** | Full functionality. Native `brew` commands. |
| **Linux** | Full functionality (Linuxbrew). Same UI. |
| **Windows** | Plugin hidden from actions panel. `shouldSearch` returns `false`. If queried directly, return single result: "Homebrew is not available on Windows." |

**Detection:** Check `navigator.platform` or use a Tauri command `is_homebrew_available` that checks `which brew`.

---

## 15. Implementation Checklist

- [ ] Create `src/plugins/homebrew.tsx` with `GQuickPlugin` export
- [ ] Create `src/components/HomebrewView.tsx` with tabbed interface
- [ ] Add `"homebrew"` to `View` union in `App.tsx`
- [ ] Add `homebrew` to `EXPANDED_WINDOW_VIEWS`
- [ ] Add `isHomebrewShortcut` and wire into keydown handler
- [ ] Add Homebrew to `appActions` array (platform-gated)
- [ ] Add `homebrewSearchQuery` state and view renderer
- [ ] Add window event `gquick-open-homebrew`
- [ ] Add cleanup in window-hidden listener
- [ ] Create `docs/design/homebrew-plugin/spec.md` (this document)

# Mockup: Docker Page

## Entry
- Shortcut: `Cmd/Ctrl + Left Shift + D` opens Docker page directly.
- Launcher action: searching `docker` also shows “Open Docker” result.
- Esc closes detail drawer first, then page back to main launcher.

## Layout
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 🐳 Docker                      ● Running  v27.2     ⌘⇧D      [Refresh] [×] │
├──────────────┬─────────────────────────────────────────────┬───────────────┤
│ Tabs         │ Search / List                               │ Detail Drawer │
│              │                                             │               │
│ Hub Search   │ [ Search Docker Hub, images, containers... ]│ Selected item │
│ Images       │                                             │ title/status  │
│ Containers   │  Result row                                 │               │
│ Compose      │  Result row             [⋯]                 │ Action buttons│
│ Activity     │  Result row                                 │               │
│              │                                             │ Logs/Inspect  │
│              │                                             │ tabs          │
├──────────────┴─────────────────────────────────────────────┴───────────────┤
│ Activity tray: pulling redis:latest  ███████░░ 72%  41 MB/s  [Cancel]      │
└────────────────────────────────────────────────────────────────────────────┘
```

## Panels
### Header
- Left: Docker icon (`Box` or `Container`), title “Docker”.
- Status chip:
  - Running: `● Running · Docker 27.2` in cyan/emerald.
  - Missing: `Docker not installed` in red.
  - Daemon down: `Daemon unavailable` in amber.
- Right: shortcut hint `⌘⇧D` / `Ctrl⇧D`, Refresh, Close.

### Left Tabs
- Hub Search
- Images
- Containers
- Compose
- Activity
- Prune (secondary/destructive grouped at bottom)

### Main Panel
- Top search input persists across tabs.
- Rows use existing GQuick list styling: `bg-white/5`, active `bg-white/10`, `border-white/10`, hover `bg-white/10`.
- Active row opens detail drawer.

### Detail Drawer
- Width: 280–320px.
- Tabs by item type:
  - Image: Overview, Run, Inspect.
  - Container: Overview, Logs, Exec, Inspect.
  - Compose: Services, Editor, Output.
- Drawer collapses on narrow widths into modal sheet.

### Activity Tray
- Bottom persistent tray for pull/run/compose/prune jobs.
- Collapsed by default if no jobs; expands for active/error jobs.
- Shows operation, image/service, progress/log excerpt, cancel/retry/open details.

## Responsive Behavior
- `>= 760px`: three-column layout.
- `560–759px`: left tabs become horizontal pill tabs; detail drawer overlays from right.
- `< 560px`: single-column modal sheets; action menus remain keyboard-accessible.

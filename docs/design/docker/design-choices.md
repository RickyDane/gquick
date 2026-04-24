# Design Choices: Expanded GQuick Docker

## Overview
Dedicated Docker workspace opened by `Cmd/Ctrl + Left Shift + D`. It keeps GQuick's dark translucent launcher pattern while expanding into a compact operations console for Docker Hub search, image/container management, Compose files, logs, exec shell, inspect, prune, and status detection.

## Color Palette
- Primary: `text-blue-400`, `bg-blue-600 hover:bg-blue-500` - Pull, Run, Create, Save, active tabs.
- Docker accent: `text-cyan-400`, `bg-cyan-500/10`, `border-cyan-500/20` - Docker status, page icon, healthy state.
- Success: `text-emerald-400`, `bg-emerald-500/10` - running containers, completed pulls.
- Warning: `text-amber-400`, `bg-amber-500/10` - daemon down, compose warnings, restart loops.
- Error: `text-red-400`, `bg-red-500/10`, `border-red-500/20` - failed pull/run, destructive actions.
- Neutral: `bg-zinc-900/95`, `bg-white/5`, `border-white/10`, `text-zinc-100/400/500` - base GQuick surfaces.

## Typography
- Page title: `text-sm font-medium text-zinc-100`.
- Tabs and buttons: `text-xs font-medium`.
- List title: `text-[13px] font-medium text-zinc-100`.
- Metadata: `text-[11px] text-zinc-500`.
- Logs/inspect/compose editor: `text-xs font-mono leading-5 text-zinc-300`.

## Spacing System
- Base unit: 4px.
- Header padding: `px-4 py-3`.
- Panel padding: `p-3` or `p-4`.
- List rows: `px-3 py-2.5 gap-3`.
- Page size target: `min-w-[760px] h-[520px]`, responsive down to `min-w-[560px] h-[420px]` with stacked detail drawer.

## UX Principles
- Default to safe observability: showing status, images, containers first; destructive ops require typed/explicit confirmation.
- Keep primary actions near object context: each image/container/search result uses a kebab action menu plus one suggested primary action.
- Long-running operations never block page: pull/run/compose operations appear in a bottom activity tray with progress, logs, cancel when supported.
- Preserve launcher speed: search input stays available inside Docker page and supports keyboard navigation.

# Mockup: Settings Footer Quit App Control

## Overview
Adds a destructive **Quit GQuick** control to the Settings footer that fully exits the app using the same backend path as the tray/menu bar **Quit** action. The control sits beside the existing Save action but is visually separated and requires confirmation before quitting.

## 1) Settings Footer Quit Button Layout

Current Settings surface is compact, dark, translucent, and scroll-contained. Keep the quit control in the persistent footer so users can find it without scrolling through settings content.

```text
┌──────────────────────────────────────────────┐
│ Settings content                             │
│ ┌──────────────────────────────────────────┐ │
│ │ Global Shortcut                          │ │
│ │ API Configuration                        │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [ Quit GQuick ]                [ Save ]      │
└──────────────────────────────────────────────┘
```

### Layout specs
- Footer container: `py-3 mb-2 border-t border-white/5 flex items-center justify-between gap-3`.
- Left side: destructive quit button.
- Right side: existing Save button.
- On narrow widths: keep same row; both buttons use compact `text-xs` sizing.
- Quit button label: **Quit GQuick**. Avoid ambiguous labels like “Exit”.

### Quit button styling
- Base: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer`.
- Color: `bg-red-500/10 text-red-300 border border-red-500/20`.
- Hover: `hover:bg-red-500/15 hover:text-red-200 hover:border-red-400/30`.
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40`.
- Icon: power/log-out style icon, `h-4 w-4 text-red-400`.
- Disabled/in-flight: `opacity-60 cursor-not-allowed`, optional spinner if quit request is pending.

## 2) Confirmation Dialog Layout

Use a modal confirmation to prevent accidental app termination. Dialog overlays Settings and traps focus.

```text
┌──────────────────────────────────────────────┐
│ dimmed Settings background                   │
│                                              │
│      ┌────────────────────────────────┐      │
│      │  ⚠ Quit GQuick?                │      │
│      │                                │      │
│      │  This closes all GQuick windows│      │
│      │  and stops background shortcuts│      │
│      │  until you open the app again. │      │
│      │                                │      │
│      │  [ Cancel ] [ Quit GQuick ]    │      │
│      └────────────────────────────────┘      │
│                                              │
└──────────────────────────────────────────────┘
```

### Dialog specs
- Overlay: `fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4`.
- Panel: `w-full max-w-sm rounded-2xl bg-zinc-950/95 border border-white/10 shadow-2xl shadow-black/40 p-4`.
- Header row: `flex items-center gap-2 text-sm font-semibold text-zinc-100`.
- Warning icon badge: `h-7 w-7 rounded-full bg-red-500/10 border border-red-500/20 text-red-400`.
- Body copy: `mt-3 text-xs leading-5 text-zinc-400`.
- Action row: `mt-4 flex justify-end gap-2`.
- Cancel: `px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-xs font-medium`.
- Confirm quit: `px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium`.
- Pending confirm: text changes to **Quitting…** with spinner, button disabled.

### Dialog copy
- Title: **Quit GQuick?**
- Body: “This closes all GQuick windows and stops background shortcuts until you open the app again.”
- Primary destructive action: **Quit GQuick**
- Secondary action: **Cancel**

## 3) Optional Actions Overlay Placement

If Settings later gains an overflow/actions button instead of footer buttons, place **Quit GQuick** at the bottom of that overlay as a separated destructive item.

```text
Settings header/footer action trigger
                         [•••]
                           │
                           ▼
                 ┌────────────────────┐
                 │ Save settings      │
                 │ Reset shortcuts    │
                 ├────────────────────┤
                 │ Quit GQuick        │  ← red/destructive, bottom
                 └────────────────────┘
```

### Overlay specs
- Placement: anchored to top-right or footer-right action trigger, aligned end, `z-40`.
- Surface: `min-w-44 rounded-xl bg-zinc-900/95 border border-white/10 shadow-xl shadow-black/30 p-1 backdrop-blur-md`.
- Normal item: `w-full px-3 py-2 rounded-lg text-left text-xs text-zinc-300 hover:bg-white/5`.
- Destructive item: `text-red-300 hover:bg-red-500/10 hover:text-red-200`.
- Separator before quit: `my-1 border-t border-white/5`.
- Selecting quit opens same confirmation dialog.

## 4) Visual Styling Details

### Palette
- App surface: `bg-zinc-950/95`, `bg-zinc-900/90`, translucent where available.
- Card/footer border: `border-white/5` to `border-white/10`.
- Primary/save: existing `bg-blue-600 hover:bg-blue-500 text-white`.
- Destructive: `red-500/10`, `red-500/20`, `red-600`, `text-red-300`.
- Text: `text-zinc-100` title, `text-zinc-300` labels, `text-zinc-400/500` support copy.

### Tailwind class approximation
```tsx
// Footer layout only; mockup classes, not production code.
<div className="py-3 mb-2 border-t border-white/5 flex items-center justify-between gap-3">
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/15 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-500/40">
    Quit GQuick
  </button>
  <button className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium">
    Save
  </button>
</div>
```

## 5) States
- Default: quit visible in footer-left, lower visual priority than Save but clearly destructive.
- Hover: red tint increases; border and text brighten.
- Focus: visible red ring, no color-only focus reliance.
- Confirm dialog open: Settings dimmed and inert; focus starts on **Cancel** for safety.
- Confirm pending: confirm button disabled with spinner/text **Quitting…**.
- Error: if quit command fails, show inline dialog error `text-red-300 bg-red-500/10 border-red-500/20` and keep dialog open.

## 6) Accessibility Notes
- Quit button accessible name: “Quit GQuick”.
- Dialog uses `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`.
- Initial focus should land on **Cancel**; destructive confirmation requires deliberate Tab/Shift+Tab or pointer selection.
- `Escape` closes dialog and returns focus to **Quit GQuick** button.
- Keyboard order: Quit GQuick → Save in footer; in dialog: Cancel → Quit GQuick.
- Do not rely on red alone: include warning icon, explicit “Quit” label, and confirmation copy.
- Ensure red text/background contrast meets WCAG AA against `zinc-950/95`; prefer `text-red-300` or brighter on dark surfaces.

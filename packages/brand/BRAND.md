# Shanku

Shanku is an open, IFC-native structural modelling app for reinforced concrete, running in the browser with no install and no sign-up for core features. This design system is the single source for how it looks, reads and behaves. Build the app from these tokens, not from screenshots.

## The name and the mark

In traditional Indian building practice the *shanku* is the vertical rod set on site before construction begins; its shadow on a drawn circle fixes true north, true vertical and the building's axes. The mark shows exactly that: an isometric column (three shades), the builders' circle drawn in perspective, and the shadow band cast from the column's base, turning the ring orange where it crosses.

- Use `shanku-mark-paper.svg` on light grounds and `shanku-mark-ink.svg` on dark.
- At 32 px and below use `shanku-mark-small.svg` (heavier strokes, wider column). Never shrink the regular mark below 48 px.
- Clear space around the mark: half its width on every side.
- Do not recolour the column faces, remove the shadow band, add a dot at the ring, or flatten the ring into a circle.
- The wordmark is lowercase **shanku** set in Sora SemiBold (`wordmark`). It is typeset, not yet outlined.

## Voice

Shanku talks like a careful site engineer: short, exact, unhurried.

- Sentence case everywhere: "Import DXF", not "Import Dxf" or "IMPORT DXF". Group labels are the only uppercase text.
- Units always shown, millimetres by default: "400 mm", "12.48 m³". Never bare numbers in properties.
- Name the element and its mark: "Column C12", not "the selected item".
- Say what happened and what to do: "3 beams have no top level. Select them to fix." No exclamation marks, no apologies, no "Oops".
- Local-first is a promise, so say it plainly where it matters: "Local only — nothing uploaded."

## Themes

Two themes from one token set: **Paper** (light, the default when the OS is light) and **Ink** (dark, a soft charcoal rather than black, with a slightly warm off-white text to cut glare). The app follows the OS setting and offers a manual switch. Every colour token carries both values.

## Colour

**The one rule: orange (`accent`) means selected, or the brand. It never means a warning and never marks a category.** Use `accent-text` for orange text; `accent` itself fails contrast as text. Keyboard focus is a 2 px `focus-ring` outline, a darker orange on Paper so it stays visible on every surface.

Chrome is neutral: `bg` for the ground, `panel` for dock panels, `ribbon` for the ribbon and status bar, `viewport` for the working surface. Panels are deliberately a shade apart from the viewport so the model area always reads as the work surface.

**Edges.** `border` for hairlines between panels and rows, `border-strong` for menu and window edges. Anything you can type in or press (inputs, selects, secondary buttons, the command search) takes `control-border`, which stays at 3:1 on every surface.

**Elevation.** Only things that float get a shadow: `shadow-tooltip`, `shadow-menu`, `shadow-window` (and `shadow-hero` on the homepage). Stacking follows the `z-*` layers, from view overlays up to the context menu. Modal dialogs dim the app with `scrim`.

**View modes.** Reveal Hidden Elements draws a `reveal-frame` (magenta) around the view and Temporary Hide/Isolate a `temp-hide-frame` (cyan), each with its `on-…` label colour. The ViewCube keeps its light Revit grey (`viewcube-*`) in both themes.

**3D view.** Elements are neutral concrete by default (`concrete-top`, `concrete-side`, `concrete-shade`), which keeps the selection (`selected-*`) unmistakable. Hover is an outline only (`hover-outline`). Edges follow the theme: `edge-model` is dark ink on Paper and soft off-white on Ink, never black on dark.

**Colour by** is a one-click switch in the view control bar. Each mode has its own reserved set:
- Category: `cat-column`, `cat-beam`, `cat-slab`, `cat-wall`, `cat-footing`, `cat-rebar` (colour-blind-safe, no orange).
- QA status: `status-ok`, `status-warning`, `status-error`, `status-unchecked`. Always paired with an icon; never colour alone.
- Revision diff: `diff-added`, `diff-changed`, `diff-removed` (at `opacity-removed`), `diff-unchanged` (at `opacity-ghost`).
- Concrete grade: `grade-m20` to `grade-m50`, one blue scale; darker is stronger.

**Drawing lines** in plan and section: `line-cut` (heaviest), `line-projection`, `line-hidden` (dashed).

## Type

IBM Plex Sans for the interface, IBM Plex Mono for IDs, GlobalIds and the Python console, Sora for the wordmark only. Default UI text is `body` (13/20); the scale stays small and dense on purpose. Turn on tabular figures (`font-variant-numeric: tabular-nums`) for every number so dimensions align. Drawing annotation shows in Plex on screen and maps to Arial on DXF export (configurable per project).

## Space and size

A 4 px grid (`space-xs`). Rows come in three densities: `row-compact`, `row-default`, `row-comfortable`. Corners are small: `radius-sm` for chips and rows, `radius-md` for buttons and inputs, `radius-xl` for dialogs. See the `size` tokens for the title bar, toolbars, ribbon buttons and bottom panel.

## Iconography

Custom structural icons are drawn on a 24 px grid with 1.5 px round strokes, structural elements at the logo's 30° isometric angle, in a single colour that follows the text colour (orange only when active). The large ribbon buttons for Column, Beam, Wall, Slab and Footing use a two-tone version: shaded face solid, lit face at `opacity-twotone-side`, top at `opacity-twotone-top`. Generic actions (save, undo, search, settings, close) come from Lucide. No letters inside icons. The round-1 set of 20 is in the Icons group, with path data in `icons.json`.

## Window layout

Title bar (mark, file name and save state, command search `Ctrl K`, undo/redo, theme switch, optional Sign in) → ribbon tabs → ribbon → body. The body has Properties and the Project browser docked left, the view tabs and viewport in the centre with a view cube and view control bar, and a collapsible bottom panel (Python console, QA results, BOQ, Activity) under the viewport. The status bar shows the selection, element counts, the local-only indicator, the Python entry and the schema and units.

Keyboard: `Ctrl K` opens the command palette. `` Ctrl ` `` toggles the bottom panel, matched on the physical key (`event.code === "Backquote"`) so it works on every keyboard layout; `` Ctrl Shift ` `` is the fallback binding where a browser or OS takes the first. Both are remappable. Revit-style two-letter shortcuts and mouse controls (middle-drag pan, Shift + middle-drag orbit, wheel zoom) are kept on purpose.

## Accessibility

All text meets 4.5:1 against every surface its token note names, in both themes; focus rings and control borders meet 3:1. The tokens build checks these pairs and fails if one drops below. Status is never shown by colour alone. Every icon-only button has an accessible label, and every action in the ribbon is reachable from the command palette.

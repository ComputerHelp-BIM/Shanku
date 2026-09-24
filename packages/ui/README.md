# @shanku/ui 0.12.0

React 18 components for the Shanku window, styled only with `@shanku/tokens`. Requires `@shanku/tokens >= 2.1.0` and `@shanku/brand >= 1.5.0`.

```tsx
import '@shanku/tokens/tokens.css';
import '@shanku/ui/styles.css';
import { ThemeProvider, AppShell } from '@shanku/ui';
```

## Components

| Component | Purpose |
|---|---|
| `ThemeProvider`, `useTheme` | Paper / Ink / follow OS. Sets `data-theme` on `<html>`; "system" removes it so CSS follows `prefers-color-scheme` with no flash. Persists to localStorage when available. |
| `useShortcut`, `TOGGLE_BOTTOM_PANEL`, `OPEN_COMMAND_PALETTE` | Physical-key shortcuts (`event.code`); `mod` = Ctrl, or Cmd on macOS. Skips inputs unless `allowInEditable`. |
| `Icon` | Structural icons from `@shanku/brand`, `outline` or `twoTone`. |
| `ShankuMark` | The mark, theme-aware; switches to the heavy drawing at 32 px and below. |
| `Button`, `IconButton`, `Kbd` | Actions. `IconButton` requires `label`. |
| `TitleBar`, `CommandSearch` | Title bar; search focuses on Ctrl K. |
| `RibbonTabs`, `Ribbon`, `RibbonGroup`, `RibbonButton` | Ribbon. `twoTone` on structural element buttons only. |
| `DockPanel`, `TypeSelector`, `PropertySection`, `PropertyRow` | Properties. `PropertyRow` edits via `onCommit` (Enter or blur commits, Esc reverts), shows `Varies`, keeps computed values read-only. |
| `TreeView` | Project browser: WAI-ARIA tree with arrow keys, Home/End, Enter. |
| `ViewTabs` | Open views. |
| `BottomPanel` | Console / QA / BOQ / Activity, VS Code style: hidden takes no space; drag the edge or press Ctrl + ` (fallback Ctrl + Shift + `) to open; resizable. |
| `StatusBar`, `StatusChip`, `LocalIndicator` | Status bar and the local-only promise. |
| `AppShell` | The full window layout with slots. |

## Rules

- No hard-coded colours: every value is a token.
- Orange (`accent`) means selected or brand only.
- Every icon-only control has an accessible name.

## Changelog

### 0.12.0 — 2026-09-24
- `ErrorBoundary` (inline and page variants, copyable report). `FloatingWindow` wraps its contents in one, so an error in a window stays in that window.

### 0.11.1 — 2026-09-24
- Requires @shanku/tokens 2.1.0. No component or style changes.

### 0.11.0 — 2026-09-24
- Requires @shanku/brand 1.5.0: `IconName` gains `explodeStoreys`, `explodeRadial`, `explodeCategories` and `guide`.

### 0.10.1 — 2026-09-23
- Requires @shanku/tokens 2.0.0 (merged from the design-system branch, released there as ui 0.9.1). No API change.

### 0.10.0 — 2026-09-23
- `TreeView` `onContextMenu(node, x, y)`: right-click on rows (Revit's view menu in the Project Browser).
### 0.9.1 — 2026-09-23
- Requires @shanku/tokens 2.0.0. No component or style changes: ui never used the removed `on-select-window` token.

### 0.9.0 — 2026-09-23
- Merged the design-system branch's 0.8.0 (WCAG contrast, token-only CSS, stylelint guard) with this line's 0.8.0 (TitleBar `brandHref`); both lines had used 0.8.0.
- `RibbonButton` `onClick` receives the click event (to open menus under the button).
- Fixed: `FloatingWindow` took focus a frame after opening even when a field inside had it, which blurred autofocused fields (e.g. naming a new view template).

### 0.8.0 — 2026-09-23
- `TitleBar` takes `brandHref`: the logo and name become a link (new tab), e.g. to the homepage.
- Fixed (from the design-system branch, released there as 0.7.1): view-tab colour rules had been pasted into the shared button reset's selector list, so buttons, ribbon buttons, ribbon and bottom-panel tabs and view-tab labels lost `font: inherit` and fell back to the browser font instead of IBM Plex Sans. Reset restored; regression tests parse styles.css. (This line's own 0.7.1 was the brand 1.3.0 dependency bump; both are in 0.8.0.)
- Requires @shanku/tokens 1.2.0.
- Focus outlines and the focused property field use `focus-ring` (3:1 on every surface; the Paper outline was 2.5:1).
- Secondary buttons and the command search use `control-border` (3:1; on Paper they were 1.3–1.5:1 and 1.3:1).
- `FloatingWindow` uses `shadow-window`. No hard-coded colours remain in `styles.css`.

### 0.7.1 — 2026-09-23
- Requires @shanku/brand 1.3.0 (visibility icon). No API change.

### 0.7.0 — 2026-09-22
- Added `ThemeIcon`: sun (light), moon (dark) and a half-filled circle for Auto, so Auto never looks like Light or Dark.

### 0.6.0 — 2026-09-22
- `TitleBar` takes `quickAccess` (Revit's Quick Access Toolbar, after the logo). Requires @shanku/brand 1.2.0.

### 0.5.0 — 2026-09-22
- Added `FloatingWindow`: a Revit-style modeless dialog above the whole app (ribbon included), moved by its title bar, resized from any edge or corner, brought to front on use, position remembered, Esc closes.
- The page frame never scrolls (`html, body { overflow: hidden }`); focus calls use `preventScroll`.

### 0.4.0 — 2026-09-22
- `AppShell` takes an optional `workspace` that owns the area between ribbon and status bar (for docking layouts); the fixed `left` / `viewTabs` / `viewport` / `bottomPanel` slots are now optional.
- Requires @shanku/brand 1.1.0 (workspace icons).

### 0.3.0 — 2026-09-21
- `ViewTabs`: optional `color` and `title` per tab. Coloured tabs get a 3 px top stripe and a light tint, so all views of one file share a colour.

### 0.2.0 — 2026-09-21
- Changed (breaking for layouts): `BottomPanel` takes no space when closed, like VS Code's panel. A thin drag handle sits on the edge: drag it up to open, drag the top edge to resize, drag below `minHeight` (96 px) to close. The handle is keyboard operable (Enter toggles, arrow keys resize).
- Added `height` / `onHeightChange` / `minHeight` props.
- Tests: 12 (added drag-open and drag-close).

### 0.1.0 — 2026-09-21
- First release: components covering the full window, from the approved design system. 11 unit tests: shortcut matching and formatting, editable-target handling, bottom-panel toggle (both bindings, including from an input), property commit/revert/Varies/read-only, tree keyboard navigation, theme application and persistence.

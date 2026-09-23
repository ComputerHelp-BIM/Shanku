# @shanku/ui 0.7.0

React 18 components for the Shanku window, styled only with `@shanku/tokens`. Requires `@shanku/tokens >= 1.0.0` and `@shanku/brand >= 1.0.0`.

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

# @shanku/web 0.2.0

The Shanku app. Requires `@shanku/engine >= 0.2.0`, `@shanku/ui >= 0.1.0`, `@shanku/tokens >= 1.0.0`.

Open an IFC file (button, drag and drop, or the sample frame); it is read on this device and never uploaded. Navigate and select like Revit; the Properties panel shows identity, level, property sets and quantities; the Project browser selects by level or category; the Activity tab logs load times; the Keyboard tab lists every shortcut.

```bash
npm run dev          # from the repo root
```

## Revit shortcuts supported

Mouse: middle-drag pan, Shift + middle-drag orbit, wheel zoom to cursor, double middle-click fit, click / Ctrl / Shift selection, window and crossing box selection.

Keys: `Home`, `Esc`, `ZF` `ZE` `ZX` `ZA` fit, `ZP` `ZC` previous view, `ZR` `ZZ` zoom region, `HI` `IC` `HH` `HR` temporary hide/isolate, `BX` section box, `WF` `HL` `SD` `CO` visual styles, `Ctrl K` find, `` Ctrl ` `` bottom panel.

Not yet: perspective camera and walkthrough (`W` `A` `S` `D`, `Q` `E`, Shift + wheel look), SteeringWheel (`F8`), thin lines (`TL`), graphic display options (`GD`).

## Changelog

### 0.2.0 — 2026-09-21
- Revit controls from the navigation cheat sheet: Ctrl adds and Shift removes, window/crossing selection, Home, ZF/ZE/ZX/ZA, ZP/ZC, ZR/ZZ, HI/IC/HH/HR with the view outlined while anything is hidden, BX, WF/HL/SD/CO, Keyboard tab.

### 0.1.0 — 2026-09-21
- First release: open IFC, navigate, select, inspect properties, project browser, activity log.

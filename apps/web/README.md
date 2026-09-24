# @shanku/web 0.30.0

The Shanku app. Requires `@shanku/engine >= 0.26.0`, `@shanku/ui >= 0.12.1`, `@shanku/tokens >= 2.0.0`.
The Shanku app. Requires `@shanku/engine >= 0.26.0`, `@shanku/ui >= 0.12.1`, `@shanku/tokens >= 2.1.0`.
# @shanku/web 0.27.0

The Shanku app. Requires `@shanku/engine >= 0.26.0`, `@shanku/ui >= 0.12.1`, `@shanku/tokens >= 2.1.0`.

Open an IFC file (button, drag and drop, or the sample frame); it is read on this device and never uploaded. Navigate and select like Revit; the Properties panel shows identity, level, property sets and quantities; the Project browser selects by level or category; the Activity tab logs load times; the Keyboard tab lists every shortcut.

```bash
npm run dev          # from the repo root
```

## Roadmap for the workspace

Next for the UI: dockable panels like Revit. Properties and the Project browser (and later the QA and BOQ panels) will dock to any side, stack as tabs, float as windows, or pop out, with the layout saved per user. The plan is dockview (MIT), themed with Shanku tokens.

## Revit shortcuts supported

Mouse: middle-drag pan, Shift + middle-drag orbit, wheel zoom to cursor, double middle-click fit, click / Ctrl / Shift selection, window and crossing box selection.

Keys: `Home`, `Esc`, `ZF` `ZE` `ZX` `ZA` fit, `ZP` `ZC` previous view, `ZR` `ZZ` zoom region, `HI` `IC` `HH` `HR` temporary hide/isolate, `BX` section box, `WF` `HL` `SD` `CO` visual styles, `Ctrl K` find, `` Ctrl ` `` bottom panel.

Not yet: perspective camera and walkthrough (`W` `A` `S` `D`, `Q` `E`, Shift + wheel look), SteeringWheel (`F8`), thin lines (`TL`), graphic display options (`GD`).

## Changelog

### 0.30.0 — 2026-09-24
- **Guide figures** (as in Structura, for Shanku's own controls): a mouse map colour-keyed to each button (click and box selection, wheel zoom, middle-drag pan, Shift + middle orbit, double middle-click fit, right-click menu, trackpad), the interface regions, window vs crossing selection, a plan's View Range from the side, section grips, which graphics win, the section box, exploded views, the command search, where quantities come from and the DXF → 3D pipeline.
- Drawn as inline SVG with design tokens only, so they follow Paper and Ink; each has a text description that the guide search matches and screen readers read. On phones they keep a readable size and scroll inside their frame.
- **Homepage**: "If you know Revit, you already know Shanku" (mouse map, window and crossing) and "Cut it open, pull it apart" (section box, exploded views).

### 0.29.0 — 2026-09-24
- **Command search (Ctrl + K) opens on three sections** before you type: **Recently used** (last 3, newest first), **Most used** (run at least twice, not already listed) and **New in Shanku x.y** (commands from the last five releases you have not tried yet, e.g. QA checks, exploded views, Guide & FAQ). ↑ ↓ move through all of them as one list. New commands carry a **New** badge in search results too; it goes once you use the command.
- Usage (count and last use per command) is kept in this browser; the older recent-commands list is carried over.
- Rows keep the ✓ column for every command, so titles line up.

### 0.28.2 — 2026-09-24
- **Fixed: Guide & FAQ crashed the app in Chrome 154** (`TypeError: n is not a function`) when changing section or closing the window. The guide scrolled back to the top with `useEffect(() => body.current?.scrollTo(...))`; the arrow's value becomes the effect's cleanup, and Chrome 154's `scrollTo()` returns a Promise, which React then called. Reproduced by emulating the Promise-returning scroll methods; fixed with a block body.
- The same pattern was removed from every effect (22 more, in Viewport, DrawingView, VG, Filters, Properties), and a test now fails if an effect returns anything but a real unsubscribe function.

### 0.28.1 — 2026-09-24
- Fixed: an error in one window or panel could wipe out the whole app and leave a blank page (seen with the Guide & FAQ window on shanku.vercel.app). Every floating window and docked panel now keeps its errors to itself and shows **Try again** / **Copy details**; an error that still escapes shows a report with **Copy details**, **Reload** and **Reset panels & windows** instead of a blank page. Errors outside a redraw go to the Activity panel.

### 0.28.0 — 2026-09-24
- Merges main's 0.26.0 (combined exploded views, selectable cut faces, cut outlines) with the design-system branch's 0.26.0 (DXF work) and 0.27.0 (QA checks and panel). Both lines had used 0.26.0; this release is above both.

### 0.26.0 — 2026-09-24
- **Exploded views stack**: Storeys, Radial and Categories are independent toggles and work together (e.g. categories side by side, each storey lifted); turning the last one off collapses the model.
- **Cut faces behave like the element**: hover tints them, selecting turns them orange, the box preview turns them blue, and clicking a cut face selects its element.
- **Cut outlines**: where a section box or a plan / section view range cuts an element, its outline is drawn as a darker cut line, distinct from model edges.
- Merged the design-system branch's 0.25.0 (AutoCAD interface for DXF drawings, 2D right-click menus, Revit gap analysis).

### 0.25.0 — 2026-09-24
- **Cut faces are solid** in section boxes and in plan and section view ranges, a shade darker than the element faces so cuts read as cuts, whatever the IFC mesh quality.
- **Section grips (Revit)**: select a section in a plan to see its far clip extent and grips: ◀ ▶ lengthen or shorten along the line, ▲ drags the far clip, ⇅ flips the direction, and dragging the line moves the section. Each drag or flip is one undoable step (named, e.g. "Resize section: Section 1").
- Merged the design-system branch's 0.24.0 (command search Ctrl + K, Guide & FAQ F1, exploded views).
### 0.27.0 — 2026-09-24
- **QA panel** (View → QA, Ctrl + K "QA", or the QA summary in the status bar): error, warning and note tiles that filter, a check-group filter, and a card per finding with Select all, Isolate (temporary, Esc restores), Zoom and Step ‹ 1 of N ›. Each card opens "How this was checked": what was measured and what it does not prove. A clean model says so, and that this does not prove it correct. Findings update when mark or grade rules change. From a drawing tab, the actions switch to the 3D view. Requires @shanku/engine 0.25.0.

### 0.26.0 — 2026-09-24
- **AutoCAD interface for DXF drawings**: adaptive grid with red / green axes (F7 or the status-bar Grid toggle), UCS icon, crosshair with pick box (small, full screen or off), coordinates read as `X, Y, 0.000`, and MODEL, Grid, UCS, Crosshair and QP toggles in the status bar. Settings are remembered on this device.
- **AutoCAD right-click menus in the 2D view**: nothing selected (Repeat, Clipboard, Isolate, Undo / Redo, Pan, Zoom, Zoom Window, Zoom Previous, Zoom Extents, Quick Select, Count, Find, Display, Layers, Properties) and with a selection (Repeat, Clipboard, Isolate, the editing entries greyed out with the reason, Select Similar, Deselect All, Zoom to Selection, Quick Select, Count Selection, Find, Properties, Quick Properties).
- **Isolate Objects / Hide Objects / End Object Isolation**, undoable, with the cyan frame and an End button.
- **Quick Select** (type, layer, colour; whole drawing or selection; include / exclude; append) with a live count, **Find** in text, MText and attributes (match case, whole words, select all), **Count**, **Select Similar** (same type, layer and colour) and **Quick Properties** (Color, Layer, Linetype, Global width, Closed for polylines).
- ZP and ZR now work in drawings (Zoom Previous, Zoom Window); the view bar has Zoom window, Previous, Quick select and Find. All of it is in Ctrl + K too. Requires @shanku/engine 0.23.0 and @shanku/tokens 2.1.0.
- ZP and ZR now work in drawings (Zoom Previous, Zoom Window); the view bar has Zoom window, Previous, Quick select and Find. All of it is in Ctrl + K too. Requires @shanku/engine 0.24.0 and @shanku/tokens 2.1.0.

### 0.25.0 — 2026-09-24
- **Cut faces are solid** in section boxes and in plan and section view ranges, a shade darker than the element faces so cuts read as cuts, whatever the IFC mesh quality.
- **Section grips (Revit)**: select a section in a plan to see its far clip extent and grips: ◀ ▶ lengthen or shorten along the line, ▲ drags the far clip, ⇅ flips the direction, and dragging the line moves the section. Each drag or flip is one undoable step (named, e.g. "Resize section: Section 1").
- Merged the design-system branch's 0.24.0 (command search Ctrl + K, Guide & FAQ F1, exploded views).

### 0.24.0 — 2026-09-24
- **Command search** (Ctrl + K): the title-bar search is now a command palette over one command registry (`lib/commands.ts`). Type what you want to do ("isolate", "hidden line", "explode storeys", a Revit key such as "ZF") or a mark, Element ID, GlobalId or name. About 70 commands plus one per category, level and view; each shows its group, shortcut and state (✓ for toggles), and greyed commands say what they need. `>` searches commands only; recent commands show first. WAI-ARIA combobox: ↑ ↓, Enter, Esc.
- **Guide & FAQ** (F1, the book icon in the title bar, or View → Windows → Guide): searchable guide in the Structura style with Guide, Answers and About sections (what Shanku opens, navigation, selection, views, graphics, sections, exploded views, commands, quantities, DXF → 3D, the console, undo; common questions; what's new; every shortcut). Content is data in `lib/guide.ts`.
- **Exploded views** (View → Explode: Storeys, Radial, Categories; click again to collapse): animated, display only, 3D views only, reset for each new file. The view bar shows a Spread slider (0–100 %) and Collapse while exploded. Selecting, box selection, isolate and the section box keep working. Requires @shanku/engine 0.22.0.
- Tests: command ranking, recent commands, guide search and structure.

### 0.23.0 — 2026-09-24
- **View symbols behave like elements (Revit).** Hover a level, section or elevation symbol and all of it highlights; click to select (Ctrl adds, Shift removes; picking an element clears them); box selection picks them too. Properties shows a selected **level** (elevation, height to the level above, its plan), **section** (name and far clip editable, length, bearing) or **elevation**. A selected level shows **temporary dimensions** to its neighbours. **Delete** removes selected sections (undoable). Double-click still opens the view.
- **Live selection preview.** While dragging a window (left to right) or crossing (right to left), everything that would be selected glows blue before you release, elements and symbols alike.
- **Section tool rubber band.** After the first click a dash-dot line follows the pointer, snaps to 15° steps and shows the angle (with an arc) and the length.
- No hover tooltips while a tool is running or a drag is in progress.
- Level elevations are read-only for now: moving a level means moving its elements, which comes with editing.

### 0.22.0 — 2026-09-23
- **View symbols, as in Revit.** Structural plans show every section (dash-dot line, numbered head with its look arrow, tail) and the four elevation marks around the building; elevations and sections show every level as a level line with its head (name and elevation in mm, e.g. +3,200) and the sections that cut across them. **Double-click a head** to open its view: a section head opens the section, an elevation mark the elevation, a level head that level's plan. Heads stay in view as you pan and zoom. 3D views show none.

### 0.21.0 — 2026-09-23
- **Structural plans show what is under the slab as dashed hidden lines** (Revit's Show Hidden Lines) instead of making slabs transparent; toggle per view (View → Graphics → Hidden Lines, shown in Properties). Plans saved by 0.20.x lose the old 70 % slab transparency automatically.
- **View Range is relative to the level, either sign**: Cut Plane Offset (default +1200 mm) and View Depth Offset (default −1200 mm); the depth must stay below the cut. Saved plans are converted.
- **Section tool only in 2D views**: plans (click two points, as before) and elevations or sections (a vertical cut across the view; drawn upward it looks to the screen's right). Disabled in 3D views.

### 0.20.1 — 2026-09-23
- Merged the design-system branch (7679278): tokens 2.0.0 (ViewCube compass hover contrast via viewcube-hot / on-viewcube-hot; on-select-window removed), clearer token notes, duplicate README titles removed.

### 0.20.0 — 2026-09-23
- **Views and the Project Browser** (Revit): Views (all) → Structural Plans (one per level, created automatically), 3D Views, Elevations (North, East, South, West) and Sections. Each view opens in its own tab and keeps its own camera, Visibility/Graphics and filters, visual style, edges, temporary hides and (3D) section box.
- **Structural plans** look down with a View Range (cut plane 1200 mm above the level, view depth 1200 mm below; edit both in Properties); cut columns show solid; slabs are 70 % transparent by default so framing under them reads. Level heights come from the storey elevation when the geometry confirms it, else from slab tops, beam tops, then column bases.
- **Sections**: View → Create → Section, two clicks in a plan or 3D view; drawn left to right it looks up the screen (north), as in Revit. Far Clip Offset in Properties (default 5000 mm).
- **Elevations and sections** pan and zoom only; no ViewCube in 2D views.
- **Project Browser right-click**: Open, Duplicate View (copies settings and camera), Rename…, Delete, Apply View Template ▸ (to any view, undoable).
- **Properties** with nothing selected shows the active view (name, level, View Range, visual style), as Revit does.
- Views are saved per file and restored on reload.
### 0.19.1 — 2026-09-23
- Accessibility: the ViewCube compass letters on hover are white on the new `viewcube-hot` blue (5.6:1); they were white on a 70% select-window tint (about 4:1 on Paper, 2.7:1 on Ink).
- Uses @shanku/tokens 2.0.0 (`on-select-window` replaced by `on-viewcube-hot`).

### 0.19.0 — 2026-09-23
- **View Templates** (View → Graphics → View Templates ▾): Apply Template Properties to Current View, Create Template from Current View, Manage View Templates (New from view, Duplicate, Rename, Delete, Update from current view, Include switches for V/G Model, V/G Filters, Visual Style, Edges; Import / Export as JSON). Kept on this device; applying is one undoable step named after the template; element overrides stay with the view, as in Revit.
- Cursors: dark on a Paper canvas, light on Ink.
- Merged the design-system branch (tokens 1.2.0: WCAG contrast fixes, token-only CSS, `npm run lint:css`).

### 0.18.0 — 2026-09-23
- **View filters** (Revit): a Filters manager (New / Duplicate / Delete, categories, rules on Mark, Level, Type, Name, Grade, IFC class, Volume, Length with equals / contains / begins with / ends with / greater / less, AND or OR, live match count, value suggestions from the model) and a **Filters tab in Visibility/Graphics** (enable, visibility, colour, transparency, halftone, priority ↑↓). Precedence: element override > first matching filter > category. Undoable.
- **Session kept across reloads**: the open model, open drawings and each file's Visibility/Graphics are stored in IndexedDB on this device and restored; closing a file forgets it.
- **Full screen toggle** in the title bar; the **Shanku logo** opens the homepage in a new tab.
- Revit cursors and Shift + right-drag orbit (engine 0.16.0); Shift + right-click opens no menu.

### 0.17.0 — 2026-09-23
- **Visibility/Graphics** (View → Graphics, or VG / VV), like Revit's Model Categories tab: visibility, surface colour, transparency and halftone per category; All / None / Invert / Clear overrides; OK / Cancel / Apply. Each Apply is one undoable transaction.
- **Override Graphics in View** from the right-click menu: By Element… (View-Specific Element Graphics: colour, transparency, halftone, Reset; wins over the category) and By Category… (opens VG on that category).
- Elements hidden by the view are separate from Temporary Hide/Isolate: HR does not bring them back and the cyan frame shows only for temporary hides.
- Deployment: `vercel.json` and `docs/deploy.md` (Vercel builds from the repository root into `apps/web/dist`).
### 0.16.2 — 2026-09-23
- Accessibility: visible focus rings and input, select and button edges now meet 3:1 contrast in both themes; orange text and faint text meet 4.5:1 everywhere.
- The Temporary Hide/Isolate label is dark on the cyan frame (white was 2.8:1).
- All colours, shadows and stacking layers in `app.css` and `home.css` now come from @shanku/tokens 1.2.0. Menus share one shadow (the right-click menu's was slightly larger) and floating dock groups use the FloatingWindow shadow.

### 0.16.1 — 2026-09-23
- Fixed: buttons, ribbon buttons and tabs now use IBM Plex Sans instead of the browser default font (@shanku/ui 0.7.1).

### 0.16.0 — 2026-09-22
- **Right-click menus in the 3D view**, in Revit's layout: without a selection (Cancel, Repeat, Select Previous, Find in Project Browser, Zoom In Region, Zoom Out (2x), Zoom To Fit, Previous / Next Pan/Zoom, Browsers, Properties) and with one (plus Hide in View ▸ Elements / Category, Override Graphics ▸, Create Similar, Edit Family, Select All Instances ▸ Visible in View / In Entire Project, Delete). Entries that need editing or Visibility/Graphics are shown greyed, as in Revit.
- **Hover tooltips** after half a second: 3D shows Category : Type, then Mark · Level · ID; DXF shows type · layer, then its main size and handle.
- **ViewCube** is faded and grey at rest and lights up (blue ring) on hover or while you navigate; **smooth transitions** when you click it; a larger ▾ options button.
- **Temporary Hide/Isolate** shows Revit's cyan frame around the view.
- View bar keeps only **Fit** (the ViewCube does the rest).
- Fixed: the orbit centre marker now shows while orbiting.

### 0.15.0 — 2026-09-22
- **ViewCube after Revit's**: shaded cube with 26 clickable directions (named by direction), a compass ring under it (drag to turn in plan, click N/E/S/W to face that side), Home, and a ▾ menu (Go Home, Set Current View as Home, Reset Home, Orient to Front/Top).
- **Temporary dimensions**: in 3D for one selected element; in the DXF view for the selected object (its size, and clear distances to the nearest parallel lines, like Revit), with a thick highlight and AutoCAD grips so a selection is obvious.
- **Orbit never gets stuck** at the top or bottom.
- Fixed: the Canvas theme now changes the view background, not only lines and outlines.
- Theme buttons show a distinct Auto icon (half-filled circle), in the app and on the homepage.

### 0.14.0 — 2026-09-22
- **Canvas theme is separate from the interface theme** (View → Canvas: Auto / Light / Dark), as in Revit: a dark interface can keep a light canvas. Remembered between visits.
- **Selected elements are see-through**, so elements behind them stay visible.
- **Section cuts look solid**, not hollow.
- **Selection box in AutoCAD colours** in both the 3D and DXF views: drag right is a blue solid window, drag left a green dashed crossing. The DXF view now supports box selection and multiple objects.
- **Orbit shows its centre** while you drag (selection, else section box, else model).
- **Homepage**: theme toggle in the nav, and screenshots in both themes so a dark page never shows a light app.

### 0.13.0 — 2026-09-22
- **Homepage** in front of the app (hero, how it works, toolkit, real screenshots, specs, FAQ). **Try Shanku free** opens the app full screen in the same page (browsers only allow fullscreen on a click in the same page); dropping an .ifc or .dxf on the homepage opens it directly. `#app` links straight to the app. The app is loaded on demand, so the homepage stays small.
- **Undo / redo as transactions** (Revit-style): Quick Access Toolbar with Undo ▾ / Redo ▾ listing named steps (undo back to any point), Ctrl + Z, Ctrl + Y, Ctrl + Shift + Z. Undoable now: section box on/off, grip moves and rotation, BOQ rates and overrides, mark and grade rules.
- **Ribbon tabs switch**: Model (Open, Structure, Select, Quantities), View (Create, Section, Graphics, Windows), Manage (Settings).
- **ViewCube**: faces, edges and corners (26 directions), drag to orbit, Home.
- **View controls**: Temporary Hide/Isolate menu (IC, HC, HI, HH, HR), Reveal Hidden Elements (RH, magenta frame; pick hidden elements and Unhide, EU), Graphics → Edges.
- Fixed: changing mark or grade rules reset hidden elements, the section box and the camera (the view now reloads only for a different file).

### 0.12.1 — 2026-09-22
- Requires @shanku/engine 0.10.0: camera no longer sticks at the top or bottom; DXF → 3D walls import completely in Revit.

### 0.12.0 — 2026-09-22
- **BOQ, DXF → 3D and Keys are Revit-style windows** that float anywhere above the app, ribbon included; Properties, Project browser, Activity and the console stay dockable. Saved dock layouts from earlier versions are reset once.
- **2D DXF selection**: click any line, polyline, circle, text, hatch or block to highlight it and see its properties (handle, layer, colour, linetype, length, area, vertices, text, block…); Esc clears.
- **Windows and doors are see-through glass** in 3D.
- **Close files from their tabs**: the {3D} tab closes the model; it is hidden when only drawings are open.
- Fixed: opening the Python console could blank the whole tab (its output scrolling moved the app frame; the saved layout then repeated it on every visit).
- Refactor: DXF → 3D logic moved into `usePipeline`; dead styles removed.

### 0.11.0 — 2026-09-22
- **DXF → 3D** (ribbon Open → DXF → 3D): pick a drawing in the Computer Help format; the review panel (docked under the view) shows levels with editable names and heights, element counts per level and the checks, each with **Show** to zoom the drawing to it. **Create 3D model** writes an IFC4 file, opens it as the model (BOQ, marks, console all work) and offers **Download IFC**.

### 0.10.0 — 2026-09-22
- **Python console** (Pyodide, runs on this device): `shanku` API 1.0.0 for read-only queries (`elements()`, `selection()`, `get()`, `levels()`, `info()`, `boq()`, `ElementList.volume / .where / .by`) and view actions (`select`, `isolate`, `hide`, `reset`, `fit`). Results that are lists show as tables; errors show their traceback. Enter runs, Shift + Enter adds a line, ↑ ↓ history, Ctrl + L clears. Try `shanku.help()`.
- **Ctrl + ` opens the Python console** at the bottom (was Activity).
- **Section box grips** (engine 0.7.0): drag the arrows to move faces, the ring to rotate, Ctrl + Z to undo; cut faces capped.

### 0.9.0 — 2026-09-22
- Everything stays inside the Shanku tab: pop-out windows removed. Panels float over the whole workspace instead.
- Revit-like docking checked end to end: drag a tab to any side of the 3D view or another dock to dock it, onto another panel to stack them as tabs, drag a floating window by its tab bar, resize it from any edge or corner, resize docks with the splitters (highlighted on hover), Float / Dock buttons. The 3D view never takes panels as tabs.
- When docks change, the 3D view absorbs the freed space (side docks go back to their normal width); splitter sizes you set yourself are kept.
- Fixed: tab bars showed white in the Ink theme (dockview's stylesheet loaded after ours; theme rules now win).

### 0.8.0 — 2026-09-22
- **Dockable panels** (dockview, MIT): Project browser docks left and Properties right by default; Activity, Keyboard, Python console and BOQ dock at the bottom or anywhere else. Drag a tab to dock it on any side or stack it with other panels; every group has **Float** (a window over the whole workspace, not just the 3D view) and **Dock** buttons. The layout is saved per browser; ribbon **Windows → Reset** restores the defaults.
- Ribbon **Windows** group toggles Properties, Browser, Activity, Keys and Console; **Quantities → BOQ** opens the BOQ as a floating panel. Ctrl + ` and the status-bar **Panel** button show or hide the bottom docks.
- Pop-out windows follow the Paper / Ink theme.
- Fixed CI: the Python extractor job installs Pillow (ezdxf's drawing add-on needs it).

### 0.7.0 — 2026-09-22
- The approved **BOQ window** (design system: BoqWindow): floats over the 3D view (ribbon Quantities → BOQ), drag, resize, minimise, dock to the bottom panel, position remembered. Tabs Elements, Levels, Summary, Rates. Elements shows mark, ID, level, category, type, grade, length, width, depth, height, area, volume, rate and amount; sortable headers, filter and category/level pickers, virtualised rows, click to select (Ctrl adds, Shift removes).
- **Rates** per item (category + grade) with **per-element overrides**: Enter sets the item rate, Alt + Enter overrides one element, right-click switches. Overrides are keyed by GlobalId and saved per file in the browser.
- The approved **Excel format** (design system: BoqWorkbook): Summary, Levels, Elements, Rates, About; every range an Excel Table (filters, sorting, banding, totals via SUBTOTAL). Summary and Levels are live `SUMIFS` over Elements; element rates come from the Rates sheet via `INDEX/MATCH` (works in Excel 2010+ and LibreOffice) unless overridden. Indian number format for amounts.

### 0.6.0 — 2026-09-22
- BOQ tab (ribbon Quantities → BOQ): concrete quantities grouped by any mix of level, category and grade/material, with totals; click a row to select its elements; notes when volumes came from geometry.
- Export Excel: `<file> - BOQ.xlsx` with BOQ (live SUM totals, filters, frozen header), Elements (one row per element) and About (source, format rating, rules, caveats). ExcelJS (MIT) loads only on first export.
- Grade rules dialog; quantities and grade shown in Properties.

### 0.5.0 — 2026-09-21
- Compatibility badge and tips in Properties for every IFC, plus an Activity entry. See `docs/ifc-compatibility.md`.
- Marks: shown in Properties with their source, used in the status bar and in Ctrl + K search. Mark rules dialog (Model → Settings → Marks) to reorder, add or limit rules to one property set; saved in the browser.

### 0.4.1 — 2026-09-21
- Requires @shanku/engine 0.3.1 (correct quantity units on Revit exports).

### 0.4.0 — 2026-09-21
- Open DXF drawings as 2D view tabs beside {3D} (ribbon DXF button or drag and drop). Each file gets its own tab colour, like pyRevit's tab colouring.
- 2D view: AutoCAD-style middle-drag pan, wheel zoom, double middle-click fit, ZF and Home fit; theme-aware colours with colour 7 flipping black/white.
- Layers panel with filter, per-layer on/off and All on / All off; drawing properties with a units override (for files whose $INSUNITS is wrong); live X/Y cursor readout.
- Dropping a DWG explains how to convert it to DXF.

### 0.3.0 — 2026-09-21
- The bottom panel starts hidden and takes no space. Open it with Ctrl + `, by dragging up from the bottom edge of the view, or with Panel in the status bar. Its height is remembered.
- Tested with real reconstruction files: Test16 (1,493 elements) and Tower1 (14,039 elements, 29 MB, opens in about 3 s).

### 0.2.0 — 2026-09-21
- Revit controls from the navigation cheat sheet: Ctrl adds and Shift removes, window/crossing selection, Home, ZF/ZE/ZX/ZA, ZP/ZC, ZR/ZZ, HI/IC/HH/HR with the view outlined while anything is hidden, BX, WF/HL/SD/CO, Keyboard tab.

### 0.1.0 — 2026-09-21
- First release: open IFC, navigate, select, inspect properties, project browser, activity log.

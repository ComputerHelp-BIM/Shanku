import type { FigureId } from '../components/figures';
import { SHORTCUT_HELP } from './shortcuts';
import { TRADEMARK_NOTICE, asOf } from './legal';

/**
 * The in-app Guide & FAQ (F1), held as data so it can be searched and tested. Text uses two inline
 * marks only: **bold** and `code`. Keep the voice of BRAND.md: short, exact, sentence case, units shown.
 */
export type GuideBlock =
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string }
  | { faq: Array<{ q: string; a: string }> }
  | { keys: Array<{ keys: string; action: string }> }
  | { releases: Array<{ version: string; date: string; items: string[] }> }
  /** A diagram (components/figures.tsx); `alt` is searchable and read by screen readers. */
  | { figure: FigureId; alt: string };

export interface GuideSection {
  id: string;
  group: 'Guide' | 'Answers' | 'About';
  title: string;
  blocks: GuideBlock[];
}

export const GUIDE: GuideSection[] = [
  {
    id: 'what',
    group: 'Guide',
    title: 'What this is',
    blocks: [
      { p: 'Shanku is an open, IFC-native structural modelling app for reinforced concrete. It opens Revit IFC models and CAD drawings in the browser, lets you navigate and select like Revit, organises views, checks quantities and exports a BOQ to Excel. Modelling tools (Column, Beam, Wall, Slab, Footing) arrive in a later version.' },
      { p: '**Nothing you open is uploaded.** Files are read in this tab. The last model and drawings are kept in this browser so a reload brings them back; closing a file forgets it.' },
      {
        table: {
          head: ['File', 'What happens'],
          rows: [
            ['`.ifc` IFC4 Reference View', 'Recommended. Opens in 3D with properties, levels and quantities.'],
            ['`.ifc` IFC2x3, Design Transfer View', 'Supported. Rated in Properties with what may be missing.'],
            ['`.dxf`', 'Opens as a 2D drawing tab with its layers.'],
            ['`.dxf` drawn to Computer Help’s layer standard', 'Model → DXF → 3D builds an IFC4 model from it with Computer Help’s conversion engine.'],
            ['`.dwg`', 'Not read directly: save it as DXF first.'],
            ['`.rvt`', 'Not read: export IFC from Revit (see Common questions).'],
          ],
        },
      },
    ],
  },
  {
    id: 'interface',
    group: 'Guide',
    title: 'The interface',
    blocks: [
      { figure: 'interface', alt: 'Diagram of the interface regions: title bar, ribbon, Project Browser, views, Properties, view bar and status bar.' },
      {
        list: [
          '**Title bar**: Quick Access (open, undo, redo, home), the file name, the search (commands and elements, `Ctrl + K`), Guide, full screen and the interface theme.',
          '**Ribbon**: Model (open files, select, BOQ), View (create views, section box, graphics, explode, windows) and Manage (mark rules).',
          '**Panels**: Properties, Project Browser, Activity and the Python console dock to any side, stack as tabs or float. View → Windows → Reset restores the layout.',
          '**Views**: each open view is a tab over the canvas, with the view bar under it (fit, visual style, section box, hide/isolate, reveal).',
          '**Status bar**: what is selected, element counts and the local-only promise.',
        ],
      },
    ],
  },
  {
    id: 'moving',
    group: 'Guide',
    title: 'Moving around',
    blocks: [
      { figure: 'mouse', alt: 'Mouse map: click select, window and crossing drags, wheel zoom, middle-drag pan, Shift and middle-drag orbit, double middle-click fit, right-click menu, trackpad Alt drag.' },
      { p: 'Navigation follows Revit. On a trackpad, hold Alt to orbit and Alt + Shift to pan.' },
      { keys: SHORTCUT_HELP.filter((k) => /drag|Wheel|middle|Home|ZF|ZP|ZR/.test(k.keys)) },
      { p: 'The view cube turns the model to any of 26 directions; drag its compass ring to turn in plan, and use Home for the default 3D view.' },
    ],
  },
  {
    id: 'selecting',
    group: 'Guide',
    title: 'Selecting, hiding and isolating',
    blocks: [
      {
        list: [
          'Click selects; **Ctrl + click** adds and **Shift + click** removes.',
          'Drag **left to right** for a window (fully inside, blue) and **right to left** for a crossing (touching, green dashed).',
          '**HI** isolates the selection and **IC** its categories; **HH** hides it and **HC** its categories; **HR** brings everything back. A cyan frame shows while anything is temporarily hidden.',
          '**RH** reveals hidden elements in magenta; select some and press **EU** to unhide them.',
          'Right-click for Select Previous, Select All Instances, Hide in View and Override Graphics.',
        ],
      },
      { figure: 'selection', alt: 'Window selection left to right versus crossing selection right to left.' },
    ],
  },
  {
    id: 'views',
    group: 'Guide',
    title: 'Views and the Project Browser',
    blocks: [
      { p: 'The Project Browser lists every view: a structural plan per level, 3D views, the four elevations and your sections. Each view keeps its own camera, Visibility/Graphics, filters, visual style, edges, temporary hides and section box, and views are saved per file.' },
      {
        list: [
          '**Plans** look down with a View Range: Cut Plane Offset (default +1200 mm) and View Depth Offset (default −1200 mm) from the level, set in Properties. What lies under the slab shows as dashed hidden lines.',
          '**Sections**: View → Create → Section, then two clicks in a plan, elevation or section.',
          '**View symbols**: plans show section and elevation marks; elevations and sections show levels. Double-click a head to open its view.',
          'Right-click a view to open, duplicate, rename, delete or apply a view template.',
        ],
      },
      { figure: 'viewRange', alt: 'View Range diagram: cut plane offset, level, view depth offset, cut and hidden lines.' },
      { figure: 'sectionGrips', alt: 'Section grips: ends, far clip, flip, move.' },
    ],
  },
  {
    id: 'graphics',
    group: 'Guide',
    title: 'Colour and visibility',
    blocks: [
      { p: '**Visibility/Graphics** (VG) sets visibility, surface colour, transparency and halftone per category for the current view. Each Apply is one undoable step.' },
      { p: '**Filters** show, colour or hide elements by rules on mark, level, type, name, grade, IFC class, volume or length. When rules disagree, an element override wins over the first matching filter, which wins over the category.' },
      { p: '**View Templates** copy these settings between views; applying one is a single undo step.' },
      { figure: 'precedence', alt: 'Which graphics win: element override, then view filter, then category.' },
    ],
  },
  {
    id: 'cutting',
    group: 'Guide',
    title: 'Cutting into the model',
    blocks: [
      { figure: 'sectionBox', alt: 'Section box grips, rotation ring and solid cut faces.' },
      { p: '**BX** puts a section box around the selection (again to remove it). Drag an arrow to move a face (Shift: 100 mm steps) and the ring to rotate it in plan (Shift: 15° steps). Cut members show as solid. Section box changes undo with Ctrl + Z.' },
      { note: 'Plans and sections use their View Range instead of a section box.' },
    ],
  },
  {
    id: 'explode',
    group: 'Guide',
    title: 'Exploded views',
    blocks: [
      { figure: 'explode', alt: 'Exploded views: storeys, radial, categories.' },
      { p: 'View → Explode pulls the model apart so you can see inside it. It changes only what you see: quantities, selections and saved views are not affected, and opening another file puts the model back together.' },
      {
        table: {
          head: ['Mode', 'What moves'],
          rows: [
            ['Storeys', 'Each storey lifts by one storey height for every storey below it.'],
            ['Radial', 'Each element moves out from the middle of the plan by its own distance from it.'],
            ['Categories', 'Footings, columns, walls, beams, slabs and the rest are laid side by side.'],
          ],
        },
      },
      { p: 'The **Spread** slider in the view bar sets how far (0–100 %); **Collapse** puts everything back. You can still select, box-select, isolate and cut with a section box while the model is exploded. Exploded views are for 3D views only.' },
    ],
  },
  {
    id: 'commands',
    group: 'Guide',
    title: 'Commands and the search',
    blocks: [
      { figure: 'commandSearch', alt: 'Command search sections: recently used, most used, new.' },
      { p: 'Press **Ctrl + K** (Cmd + K on a Mac) and type what you want to do: "isolate", "hidden line", "section box", "explode storeys". The same box finds an element by mark, Element ID, GlobalId or name. Start with **>** to search commands only.' },
      { p: 'Before you type, the search lists **Recently used**, **Most used** and **New** commands; new ones carry a badge until you try them. Greyed commands say what they need, for example a selection.' },
      { p: 'Revit two-letter shortcuts work anywhere outside a text field: type the two letters in a row (for example **ZF**). Shortcuts follow the physical keys, so they work on every keyboard layout.' },
    ],
  },
  {
    id: 'numbers',
    group: 'Guide',
    title: 'Where the numbers come from',
    blocks: [
      { figure: 'quantities', alt: 'Where quantities come from: IFC quantities or geometry, marks and grades, BOQ, Excel.' },
      { p: 'Volumes, areas and lengths come from the IFC base quantities when the file has them, and are measured from the geometry otherwise. Properties shows which one for each element.' },
      { p: 'Marks and concrete grades are read from properties by rules you can change (Manage → Marks); the first property that has a value wins.' },
      { p: 'The **BOQ** window groups quantities by level, category and grade, takes a rate per item or per element, and exports an Excel workbook. Rates are kept per file in this browser.' },
    ],
  },
  {
    id: 'dxf',
    group: 'Guide',
    title: 'DXF drawings and DXF → 3D',
    blocks: [
      { figure: 'dxfPipeline', alt: 'DXF to 3D pipeline: read, check, write IFC4, open.' },
      { p: 'Open a DXF to see it as a 2D drawing: select objects to see their layer, size and handle, and turn layers on or off.' },
      { p: 'The drawing view works like AutoCAD model space: a grid in round drawing units with the red X and green Y axes through the origin (**F7** turns it off), the UCS icon, a crosshair with a pick box, and the cursor position as `X, Y, 0.000` in the status bar. The status bar toggles Grid, UCS, Crosshair (small, full screen, off) and QP (Quick Properties).' },
      {
        table: {
          head: ['Right-click', 'What you get'],
          rows: [
            ['Nothing selected', 'Repeat, Clipboard (copy the point), Isolate, Undo / Redo, Pan, Zoom, Zoom Window, Zoom Previous, Zoom Extents, Quick Select, Count, Find, Display, Layers, Properties'],
            ['Objects selected', 'Repeat, Clipboard (properties, handles, point), Isolate / Hide / End Object Isolation, Select Similar, Deselect All, Zoom to Selection, Quick Select, Count Selection, Find, Properties, Quick Properties'],
          ],
        },
      },
      { list: ['**Select Similar** picks visible objects with the same type, layer and colour.', '**Quick Select** filters by type, layer and colour, in the drawing or the selection, including or excluding matches.', '**Find** searches text, MText and block attributes; pick a match to select it and zoom to it.', '**Isolate Objects** and **Hide Objects** can be undone; the cyan frame has an End button.', '**Pan** and **Zoom** from the menu run until Esc, Enter or a right-click. **ZR** is Zoom Window and **ZP** Zoom Previous, as in 3D.'] },
      { note: 'Shanku opens drawings to view and check them. Erase, Move, Copy, Scale, Rotate, Draw Order and Group are in the menu so it matches AutoCAD, but greyed out.' },
      { note: 'An element’s level is the lowest level at or above its top: columns and walls belong to the level they rise to, beams and slabs to the level they hang from (sunk, or up to 600 mm upstand), foundations to Level 1. Every model follows this, including models loaded from Revit (whose IFC storey is shown in Properties for reference).' },
      { note: 'Levels follow Revit’s structural convention: a level is the top of its storey. The frame labelled Level 5 holds the structure below Level 5 (columns and walls from Level 4 up, beams and slabs hanging from Level 5); Level 1, the foundation frame, is ±0 with the foundations below it.' },
      { p: 'DXF drawings drawn to Computer Help’s layer standard can become a 3D model: Model → DXF → 3D reads frames, levels and labelled outlines, shows its checks (each with Show, to zoom the drawing to the problem), then writes an IFC4 model that opens in Shanku and can be downloaded.' },
    ],
  },
  {
    id: 'colour',
    group: 'Guide',
    title: 'Colour by parameter',
    blocks: [
      { p: '**View → Colour by** (or Ctrl + K, "colour by") colours the model by category, grade, level, type, section or mark, or as a gradient by height, length or volume. The Colour panel lists every group with its colour and count.' },
      { list: ['Click a **swatch** to recolour that group.', 'Untick a group to **hide** it.', 'Click a **name** to select the group.', 'Pick a **palette**; Reset puts the colours back.'] },
      { p: 'A small legend sits on the view while colouring, for screenshots. Visibility/Graphics overrides still win, as in Revit. **Realistic** (view bar) and **Shadows** make presentation views.' },
    ],
  },
  {
    id: 'measure',
    group: 'Guide',
    title: 'Measuring',
    blocks: [
      { p: '**Model → Measure**, the Quick Access toolbar, or type **ME**. It works in 3D views, plans, sections and elevations; in 2D views distances are measured in the view plane, as Revit does. The bar over the view picks what to measure:' },
      { list: [
        '**Distance**: two points. The cursor snaps to endpoints (square), midpoints (triangle), face centres and centreline ends (circle), centrelines (diamond), any point on an edge (X) or on a face. You get the total and ΔX ΔY ΔZ (east, north, up), and the perpendicular distance when both picks are parallel faces, parallel edges or centrelines (centre to centre).',
        '**Clear & C/C**: two elements. The clear gap between their surfaces (0 when they touch or overlap) and, for columns, beams and walls, centre to centre. Clear height from a slab to a beam soffit is two clicks.',
        '**Along**: an element’s centreline, the edge under the cursor, or a chain of joined walls or beams.',
        '**Face area**: one flat face, with its perimeter and which way it faces (top, soffit, side facing NE…).',
        '**Chain**: point after point with a running total. **Enter** or double-click finishes, **Backspace** removes the last point.',
      ] },
      { p: 'In **plans and sections** (and on section box cuts in 3D) the cursor also snaps to the **cut outline**, what the view cuts through: cut corners, cut edges, the cut face and a column’s centre (“Centreline at the cut”). Face-to-face between two columns in a plan is two clicks on their cut edges.' },
      { p: '**Tab** steps through the other choices under the cursor (a face, then its edge, then the corner, then the centreline); **Shift + Tab** steps back. **Esc** drops a half-made measurement; Esc again closes the tool. **Copy** puts the values on the clipboard.' },
      { note: 'Centrelines are worked out from each element’s shape, because IFC exports do not carry Revit’s analytical lines. Straight columns, beams and walls are exact; a sloped or tapered member is a close fit and says so.' },
      { p: '**Tab while selecting**: over the view, Tab steps through every element under the cursor, front to back (a beam behind a slab, a column behind a wall), then the chain of walls or beams joined end to end with the first one. Click takes the one shown. Tab only belongs to the view while the pointer is over it; elsewhere it moves between fields as usual.' },
    ],
  },
  {
    id: 'dimensions',
    group: 'Guide',
    title: 'Dimensions',
    blocks: [
      { p: '**Annotate → Dimension** has Revit’s nine tools. Dimensions stay in the view they were placed in (like Revit, they are view-specific), are saved with the views, and every placement, move, edit and delete is one undo step. They work in plans, sections, elevations and 3D views (in 3D on the plan or elevation plane facing you).' },
      { list: [
        '**Aligned** (DI): pick references (edges, faces, points, centrelines; Tab cycles), keep picking for a string, then click an empty spot to place. Between parallel edges or faces it measures square to them.',
        '**Linear**: two points, measured horizontally or vertically in the view; move the cursor up/down or sideways to choose.',
        '**Angular**: two edges or centrelines; the quadrant follows where you place the arc.',
        '**Radial**, **Diameter**, **Arc Length**: point at a circular edge (round column, pile, curved beam). Shanku rebuilds the circle from the model’s facets, within about a millimetre.',
        '**Spot Elevation** (EL): a point’s elevation in metres, from the file’s own origin (top of slab, beam soffit, founding level).',
        '**Spot Coordinate**: north and east of a point, from the file’s origin.',
        '**Spot Slope**: a face’s slope in percent with an arrow pointing downhill; level and vertical faces say so.',
      ] },
      { p: 'Click a dimension to select it: **Properties** shows its value and Revit’s Dimension Text (Prefix, Suffix, Below, Replace With Text). Drag its square grip to move the line; **Delete** removes it. When Revit sends changes, dimensions move with their elements, and ones on deleted elements go, as in Revit.' },
      { note: 'Measure (Model → Measure) is still there for quick readings that are not kept, as in Revit.' },
    ],
  },
  {
    id: 'marks',
    group: 'Guide',
    title: 'Selecting by marks',
    blocks: [
      { p: 'Copy a message like "please check C1, C4 and B12" and press **Ctrl + V on the model**: every element with those marks is selected (on every level) and the view zooms to them. Ranges work: C1-C5 or C1 to C5. Marks that are not in the model are listed. Linked to Revit with sync on, Revit selects them too.' },
      { p: 'In the QA panel, **Show in Revit** selects a finding in Revit, and **Fix in Revit** proposes marks for unmarked elements that continue your numbering. They go to Changes for Revit: check, then apply as one Revit undo.' },
    ],
  },
  {
    id: 'share',
    group: 'Guide',
    title: 'Sharing a view',
    blocks: [
      { p: '**Copy view link** (Ctrl + K, the right-click menu in 3D, or What now?) copies a link with the camera, the view, the section box, the visual style, the selection and what is hidden. The model is not in the link: whoever opens it needs the same file, and elements are matched by GlobalId, so a re-export of the same model works too.' },
      { p: '**Open a view link…** takes a pasted link, or text starting with `SHANKU/1|`.' },
    ],
  },
  {
    id: 'files',
    group: 'Guide',
    title: 'Files that do not open',
    blocks: [
      { p: 'Shanku opens IFC (.ifc) and DXF (.dxf). For anything else, or a file that fails, it reads the first bytes on this device, says what the file really is and how to export one it can read: Revit → File → Export → IFC; DWG → Save As DXF; ETABS → export the .e2k text file.' },
      { p: '**What is in this file?** gives a report to copy for support: name, size, the IFC schema and authoring tool or the DXF version, and the error. It never contains model data.' },
    ],
  },
  {
    id: 'revit',
    group: 'Guide',
    title: 'Revit bridge',
    blocks: [
      { figure: 'revitBridge', alt: 'Revit bridge diagram: the Shanku add-in in Revit and Shanku in the browser, paired with a code over localhost; load the model as IFC4 and sync the selection both ways.' },
      { p: 'With **Shanku Bridge for Revit** installed, Shanku loads the model open in Revit 2025 and keeps the selection in step both ways: select in either program and the other follows.' },
      {
        list: [
          'Install the add-in (`bridge/revit` in the Shanku repository), open a model in Revit, then **Shanku → Connect**: Revit shows a 6-digit code.',
          'In Shanku open the **Revit** ribbon tab and click **Connect** (or click **Revit** in the status bar), enter the code and allow Chrome\'s prompt for apps on this device.',
          'The **Revit** tab also has **Load from Revit** (Reload), **Sync**, and **Send to Revit** / **Get from Revit** to pass the selection once when Sync is off.',
          '**Load model from Revit** exports it as IFC4 inside a transaction that Revit rolls back, so the Revit model is never changed.',
          'This browser stays paired; **Shanku → Disconnect** in Revit unpairs every browser.',
        ],
      },
      {
        list: [
          '**Edit parameters** (add-in 0.3.0): select elements of the model loaded from Revit; Properties shows them as Revit\'s palette does: family and type, the category with **Edit Type** (the type\'s parameters), then Revit\'s groups in Revit\'s order (click a group to collapse it). Edit a value (several elements at once too); the row is marked and waits; **Apply** at the bottom applies the selection\'s changes. Ctrl + Z undoes an edit.',
          '**Revit → Changes** lists every edit: Revit\'s value, the new one, a tick per row. **Check in Revit** tries them and keeps nothing; **Apply** makes them in one Revit transaction, so one Edit → Undo in Revit takes them all back.',
          'Revit refuses a change that someone made in Revit meanwhile, a read-only parameter, an element borrowed by someone else, or a number it cannot read (numbers use the project units: 600 means 600 mm in a millimetre project). **Refresh from Revit** takes Revit\'s current values as the base.',
          'Type parameters, and parameters that pick another element (material, level), are edited in Revit for now.',
          '**Export to Revit** (add-in 0.6.0): with a DXF open in **DXF → 3D** (or from **Revit tab → Export to Revit**), Revit builds the model natively from your template: levels (matched by name, then height), columns, beams, walls, slabs and footings of your families, new sizes duplicated from template types. Revit checks the plan first and keeps nothing; you approve it by level and kind; it is created as one undo in Revit, checked against the drawing, and Shanku loads it back so both stay in step. A second export skips what Revit already has (CH-ID). Families and type names: shanku_export_config.json in the add-in folder.',
          '**Live updates** (add-in 0.5.0): when anything changes in Revit (your Apply included), the chip shows how many elements changed and Properties re-reads them at once. **Revit tab → Update** brings in just those elements (Revit exports only them, in the background): changed ones move in place, deleted ones go, new ones appear; the camera, views, selection and hides stay. **Auto-update** does it as changes happen.',
        ],
      },
      { note: 'Everything stays on this computer: the add-in listens on localhost for Shanku only. Changes wait in Shanku (and survive a reload) until you apply them.' },
    ],
  },
  {
    id: 'qa',
    group: 'Guide',
    title: 'QA checks',
    blocks: [
      { p: 'Every model is checked on this device as it opens. The status bar shows the result ("QA: 2 errors · 1 warning"); click it, or View → QA, for the QA panel.' },
      {
        table: {
          head: ['Check', 'Flags'],
          rows: [
            ['Duplicate elements', 'Same category, all bounds within 5 mm'],
            ['Overlapping columns', 'Column boxes overlapping by more than 1 mm'],
            ['Discontinuous columns', 'A column with nothing under it within 50 mm (it looks through the slab it sits on)'],
            ['Zero or tiny size', 'A dimension under 10 mm, or no volume'],
            ['Unusual length', 'Beams, columns and members over 25 m or under 150 mm'],
            ['No level, no grade', 'Elements the plans or the BOQ by grade will miss'],
            ['Lateral system gap', 'Storeys without walls or bracing when others have them (a note)'],
            ['Marks', 'Missing marks, and one mark used for different sizes'],
          ],
        },
      },
      { p: 'Each card has **Select all**, **Isolate** (Esc restores), **Zoom** and **Step** through its elements. **How this was checked** says what was measured and what the check does not prove.' },
      { note: 'Passing every check does not mean the model is correct. It means these checks found nothing.' },
    ],
  },
  {
    id: 'python',
    group: 'Guide',
    title: 'The Python console',
    blocks: [
      { p: '**Ctrl + `** opens the console. It runs Python in this tab. `shanku.elements(category="Column", level="Level 3")` returns elements you can filter, total (`.volume`) and group (`.by("grade")`); `shanku.isolate(...)`, `shanku.select(...)` and `shanku.fit(...)` act on the view. Type `shanku.help()` for everything.' },
      { p: 'Enter runs, Shift + Enter adds a line, ↑ and ↓ recall earlier input, Ctrl + L clears.' },
    ],
  },
  {
    id: 'undo',
    group: 'Guide',
    title: 'Undo and your session',
    blocks: [
      { p: 'Ctrl + Z and Ctrl + Y undo and redo; the Undo list in Quick Access goes back several steps at once. Undoable: section box changes, Visibility/Graphics, filters, view templates, BOQ rates, and mark and grade rules.' },
      { note: 'Temporary hide/isolate is not an undo step: press HR to bring everything back.' },
    ],
  },
  {
    id: 'faq',
    group: 'Answers',
    title: 'Common questions',
    blocks: [
      {
        faq: [
          { q: 'Is my model uploaded anywhere?', a: 'No. Files are read in this browser tab. The last model is stored in this browser so a reload restores it; closing the file removes it.' },
          { q: 'Which IFC export should I use from Revit?', a: '**IFC4 Reference View [Structural]** with base quantities, Revit property sets and IFC common property sets turned on. Properties rates every file you open and says what is missing.' },
          { q: 'Can I open a .rvt or .dwg file?', a: 'Not directly. Export IFC from Revit; save DWG as DXF in AutoCAD or with the free ODA File Converter.' },
          { q: 'Why can\'t I see an element?', a: 'Check, in order: temporary hide (HR shows everything), the view\'s Visibility/Graphics and filters, the View Range in plans, and the section box. RH shows hidden elements in magenta.' },
          { q: 'Why is the mark or grade empty?', a: 'Shanku reads them from properties by rules. Manage → Marks shows which properties the model has and lets you choose.' },
          { q: 'Are the quantities exact?', a: 'They are the IFC base quantities when the export has them, otherwise measured from the geometry. Properties shows the source for each element.' },
          { q: 'Does exploding change my model or quantities?', a: 'No. It only moves what you see, and opening another file resets it.' },
          { q: 'My panels are in a mess.', a: 'View → Windows → Reset puts the Project Browser on the left and Properties on the right.' },
          { q: 'Do shortcuts work on my keyboard layout?', a: 'Yes. They follow the physical keys, so ZF is the same two keys on every layout.' },
        ],
      },
    ],
  },
  {
    id: 'about',
    group: 'About',
    title: 'About Shanku',
    blocks: [
      { p: 'Shanku is an open, IFC-native structural BIM application by **Computer Help**, Mumbai, that runs in the browser. It opens IFC models and DXF drawings on your device, checks quantities and exports a BOQ; with the optional **Shanku Bridge for Revit** add-in it also works with the Revit model open on your computer.' },
      { p: 'Revit-style navigation and familiar shortcuts are there so Revit users feel at home. Shanku contains no Autodesk code or artwork; the optional add-in runs inside Revit through Revit’s published API, and uses Revit’s own IFC export to send models to Shanku.' },
      { note: TRADEMARK_NOTICE + ' Features and compatibility as of ' + asOf() + '.' },
    ],
  },
  {
    id: 'news',
    group: 'About',
    title: "What's new",
    blocks: [
      {
        releases: [
          { version: '0.46.0', date: '2026-09-26', items: ['DXF → 3D reads large drawings much faster (a 4,444-element drawing: about 2 s instead of half a minute).', 'Export to Revit: the check takes seconds, the build regenerates Revit once, and Revit’s progress shows in the Export window (with Shanku Bridge for Revit 0.8.0).'] },
          { version: '0.45.0', date: '2026-09-26', items: ['Progress you can watch: a frame builds itself while files open, DXF → 3D runs and Revit works, with a timer and tips.', 'Download IFC: the model as a file; from Revit, a fresh export with every change.', 'Models open faster, and Revit answers at once without moving the mouse over it.'] },
          { version: '0.44.0', date: '2026-09-26', items: ['A start page with three sample buildings to open: the small frame, a G+14 residential tower and G+24 twin towers on a G+3 podium (4,780 elements). .ifc.gz files open directly.', 'Measure and dimensions snap to the cut outline in plans (cut corners and edges, the cut face, a column’s centre), and on section box cuts in 3D.'] },
          { version: '0.43.0', date: '2026-09-26', items: ['Annotate → Dimension, as in Revit: Aligned (strings), Linear, Angular, Radial, Diameter, Arc Length, Spot Elevation, Spot Coordinate and Spot Slope, placed in plans, sections, elevations and 3D views. Kept with the view, undoable, text overrides in Properties, a grip to move them, and they follow the model when Revit sends changes. DI and EL.'] },
          { version: '0.42.0', date: '2026-09-26', items: ['Measure (Model → Measure, ME): distance with Revit-style snaps and Tab, clear distance and centre to centre, along an element or a chain of joined walls and beams, face area, and chain measure, in 3D views, plans, sections and elevations.', 'Tab over the view steps through the elements under the cursor, then a chain of joined walls or beams, as in Revit; the browser no longer jumps between fields there.'] },
          { version: '0.41.1', date: '2026-09-26', items: ['Fixed: in models loaded from Revit, columns and walls could land one level low (selecting Level 4 picked the storey above it), and level labels and height colours were off by the building’s own height. Levels are now calibrated against the geometry.'] },
          { version: '0.41.0', date: '2026-09-26', items: ['One definition of an element’s level, for every model: the lowest level at or above its top. Models loaded back from Revit now show columns and walls on the same levels as the drawing; the IFC storey stays visible in Properties, and QA lists a CH-LEVEL that differs.'] },
          { version: '0.40.0', date: '2026-09-26', items: ['DXF → 3D: a level is now the top of its storey (Revit’s convention); Level 1 is ±0. Export to Revit hosts every element on its own level, walls top-constrained, and writes marks to CH-ScheduleMark instead of Mark.', 'Fixed: level heights in elevations and sections now show the model’s own elevations (they could be off by the file’s origin shift).'] },
          { version: '0.39.2', date: '2026-09-26', items: ['Export to Revit: beams now land at their drawn height (with Shanku Bridge for Revit 0.6.1).'] },
          { version: '0.39.1', date: '2026-09-25', items: ['About Shanku in the Guide, with the trademark notice; wording on the homepage and in the Guide says what Shanku does today.'] },
          { version: '0.39.0', date: '2026-09-25', items: ['Export to Revit: the DXF → 3D model built natively in Revit from your template (checked first, approved by level and kind, one undo), then loaded back into Shanku.', 'Colour by grade, level, section and more, with a legend.', 'Fix in Revit from QA, and paste marks to select (Revit follows).', 'Realistic style and shadows.', 'BOQ rates by city (CPWD DSR 2023 base) and a nicer Excel.'] },
          { version: '0.37.1', date: '2026-09-25', items: ['Fixed: updates from Revit no longer reset the view to the default 3D.'] },
          { version: '0.37.0', date: '2026-09-25', items: ['Live updates from Revit: Shanku learns what changed in Revit and brings in just those elements (Update, or Auto-update), keeping the camera, views, selection and hides.'] },
          { version: '0.36.0', date: '2026-09-25', items: ['Revit 2025 look: drag the line between names and values in Properties; Apply always visible; sort A→Z / Z→A within groups; the Project Browser with Search and Families; Type Properties like Revit\'s dialog with a Preview; units next to numbers; thin scrollbars.'] },
          { version: '0.35.0', date: '2026-09-25', items: ['Properties looks and works like Revit\'s palette: collapsible groups, lines between rows, family and type, Edit Type, an Apply button; Properties docks left and the Project Browser right, as in Revit.', 'No more duplicate Revit parameters; Revit\'s warnings (duplicate marks…) show when you check or apply.'] },
          { version: '0.34.0', date: '2026-09-25', items: ['Edit Revit parameters in Shanku: Properties shows the live Revit parameters; edits wait in the Changes window, are checked in Revit, and apply as one Revit undo.'] },
          { version: '0.33.0', date: '2026-09-25', items: ['A Revit ribbon tab: Connect, Disconnect, Load from Revit, Sync, Send to Revit and Get from Revit, and the bridge guide.'] },
          { version: '0.32.0', date: '2026-09-24', items: ['Revit bridge: connect to Revit 2025 with Shanku Bridge for Revit, load the open model and keep the selection in step both ways.'] },
          { version: '0.31.0', date: '2026-09-24', items: ['What now? in the title bar.', 'BOQ scope (visible, selection, levels) with a scope sentence; steel estimate with range warnings.', 'Help for files that do not open, and view links to share a view.', 'Diagrams in the Guide: the mouse map, interface, selection, View Range, section grips, graphics precedence, section box, exploded views, command search, quantities and DXF → 3D.'] },
          { version: '0.29.0', date: '2026-09-24', items: ['Command search (Ctrl + K) opens on Recently used, Most used and New in this release; new commands carry a New badge until you try them.'] },
          { version: '0.28.2', date: '2026-09-24', items: ['Fixed: Guide & FAQ could crash the app in Chrome 154 when changing section or closing it.', 'A failing window or panel now shows its own error with Try again and Copy details instead of blanking the app.'] },
          { version: '0.28.0', date: '2026-09-24', items: ['Exploded views combine: storeys, radial and categories together.', 'Cut faces are solid, a shade darker, answer hover and selection, and have their own cut outline.', 'Section grips in plans: lengthen, far clip, flip and move.'] },
          { version: '0.27.0', date: '2026-09-24', items: ['QA checks: duplicates, floating columns, overlaps, sizes, levels, grades and marks, with a QA panel to select, isolate and step through each finding.'] },
          { version: '0.26.0', date: '2026-09-24', items: ['DXF drawings look and work like AutoCAD: grid with red and green axes (F7), UCS icon, crosshair, X, Y, 0.000 coordinates.', 'AutoCAD right-click menus with Isolate, Select Similar, Quick Select, Find, Count and Quick Properties.'] },
          { version: '0.25.0', date: '2026-09-24', items: ['Solid cut faces in section boxes, plans and sections.', 'Section grips in plans: lengthen, far clip, flip and move, each undoable.'] },
          { version: '0.24.0', date: '2026-09-24', items: ['Command search: Ctrl + K finds every command as well as elements.', 'Guide & FAQ (F1).', 'Exploded views by storey, radially or by category.'] },
          { version: '0.23.0', date: '2026-09-24', items: ['View symbols behave like elements: hover, select, Properties, and Delete for sections.', 'Live preview of what a window or crossing box will select.', 'Section tool rubber band with 15° snapping, angle and length.'] },
          { version: '0.22.0', date: '2026-09-23', items: ['View symbols: section and elevation marks in plans, levels in elevations and sections; double-click a head to open its view.'] },
          { version: '0.21.0', date: '2026-09-23', items: ['Dashed hidden lines in plans; View Range relative to the level; sections drawn in elevations and sections.'] },
          { version: '0.20.0', date: '2026-09-23', items: ['Views and the Project Browser: plans, 3D views, elevations and sections, each with its own settings.'] },
        ],
      },
    ],
  },
  {
    id: 'keys',
    group: 'About',
    title: 'Keyboard shortcuts',
    blocks: [{ keys: SHORTCUT_HELP }],
  },
];

/** Plain text of a section, for search. */
function textOf(s: GuideSection): string {
  const parts: string[] = [s.title];
  for (const b of s.blocks) {
    if ('p' in b) parts.push(b.p);
    else if ('note' in b) parts.push(b.note);
    else if ('list' in b) parts.push(...b.list);
    else if ('table' in b) parts.push(...b.table.head, ...b.table.rows.flat());
    else if ('faq' in b) for (const f of b.faq) parts.push(f.q, f.a);
    else if ('keys' in b) for (const k of b.keys) parts.push(k.keys, k.action);
    else if ('releases' in b) for (const r of b.releases) parts.push(r.version, ...r.items);
    else if ('figure' in b) parts.push(b.alt);
  }
  return parts.join(' ').toLowerCase();
}

/** Sections whose text contains every word of the query (all sections when it is empty). */
export function searchGuide(query: string): GuideSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return GUIDE;
  return GUIDE.filter((s) => {
    const t = textOf(s);
    return words.every((w) => t.includes(w));
  });
}

import { SHORTCUT_HELP } from './shortcuts';

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
  | { releases: Array<{ version: string; date: string; items: string[] }> };

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
            ['`.dxf` in the Computer Help format', 'Model → DXF → 3D builds an IFC4 model from it.'],
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
      { p: 'Navigation follows Revit. On a trackpad, hold Alt to orbit and Alt + Shift to pan.' },
      { keys: SHORTCUT_HELP.filter((k) => /drag|Wheel|middle|Home|ZF|ZP|ZR/.test(k.keys)) },
      { p: 'The ViewCube turns the model to any of 26 directions; drag its compass ring to turn in plan, and use Home for the default 3D view.' },
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
    ],
  },
  {
    id: 'cutting',
    group: 'Guide',
    title: 'Cutting into the model',
    blocks: [
      { p: '**BX** puts a section box around the selection (again to remove it). Drag an arrow to move a face (Shift: 100 mm steps) and the ring to rotate it in plan (Shift: 15° steps). Cut members show as solid. Section box changes undo with Ctrl + Z.' },
      { note: 'Plans and sections use their View Range instead of a section box.' },
    ],
  },
  {
    id: 'explode',
    group: 'Guide',
    title: 'Exploded views',
    blocks: [
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
      { p: 'Press **Ctrl + K** (Cmd + K on a Mac) and type what you want to do: "isolate", "hidden line", "section box", "explode storeys". The same box finds an element by mark, Element ID, GlobalId or name. Start with **>** to search commands only.' },
      { p: 'Commands you ran recently show first. Greyed commands say what they need, for example a selection.' },
      { p: 'Revit two-letter shortcuts work anywhere outside a text field: type the two letters in a row (for example **ZF**). Shortcuts follow the physical keys, so they work on every keyboard layout.' },
    ],
  },
  {
    id: 'numbers',
    group: 'Guide',
    title: 'Where the numbers come from',
    blocks: [
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
      { p: 'Drawings in the Computer Help format can become a 3D model: Model → DXF → 3D reads frames, levels and labelled outlines, shows its checks (each with Show, to zoom the drawing to the problem), then writes an IFC4 model that opens in Shanku and can be downloaded.' },
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
    id: 'news',
    group: 'About',
    title: "What's new",
    blocks: [
      {
        releases: [
          { version: '0.25.0', date: '2026-09-24', items: ['DXF drawings look and work like AutoCAD: grid with red and green axes (F7), UCS icon, crosshair, X, Y, 0.000 coordinates.', 'AutoCAD right-click menus with Isolate, Select Similar, Quick Select, Find, Count and Quick Properties.'] },
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

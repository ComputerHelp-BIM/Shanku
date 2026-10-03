/**
 * cad2bim's roadmap: one list for the homepage's two drawings of it (the building under construction and the
 * metro map) and for docs/roadmap.md, which is generated from it (`npm run roadmap`; a test fails when the file
 * is out of step). Plain TypeScript with no imports, so Node runs it directly.
 *
 * Shipped items name the release that brought them. Ideas are not commitments: they are things we may build,
 * and the page asks which matter.
 */

/** Where an item stands. */
export type Status = 'shipped' | 'building' | 'next' | 'planned' | 'idea';
/** What kind of change it is. */
export type Kind = 'new' | 'update' | 'rework' | 'revamp' | 'idea';
/** The metro line it runs on. */
export type Line = 'editing' | 'revit' | 'drawings' | 'quantities' | 'platform';

export interface RoadItem {
  id: string;
  title: string;
  detail: string;
  line: Line;
  status: Status;
  kind: Kind;
  /** For shipped items: the release that brought it. */
  version?: string;
  /** Its design note in docs/design, when there is one. */
  design?: string;
}

/** The lines, coloured by the structural category each is closest to (design tokens --cat-*). */
export const LINES: Record<Line, { label: string; colour: string }> = {
  editing: { label: 'Editing', colour: 'var(--cat-column)' },
  revit: { label: 'Revit', colour: 'var(--cat-beam)' },
  drawings: { label: 'Drawings & exchange', colour: 'var(--cat-slab)' },
  quantities: { label: 'Quantities & rebar', colour: 'var(--cat-rebar)' },
  platform: { label: 'Platform', colour: 'var(--cat-wall)' },
};

export const STATUS_LABEL: Record<Status, string> = {
  shipped: 'Shipped',
  building: 'Building now',
  next: 'Next',
  planned: 'Planned',
  idea: 'Ideas',
};

export const KIND_LABEL: Record<Kind, string> = { new: 'New', update: 'Update', rework: 'Rework', revamp: 'Revamp', idea: 'Idea' };

/**
 * The building's storeys, bottom to top: shipped work is built, what is being built has scaffolding, planned
 * storeys are drawn dashed, and ideas float above the crane.
 */
export const STOREYS: Array<{ id: string; label: string; status: Status; items: string[] }> = [
  { id: 'foundation', label: 'Foundation · 0.1–0.49', status: 'shipped', items: ['ifc-viewer', 'navigation', 'see-inside', 'dxf', 'dxf-3d', 'boq', 'console', 'qa', 'bridge'] },
  { id: 'l1', label: 'Level 1 · 0.50–0.51', status: 'shipped', items: ['project-file', 'offline'] },
  { id: 'l2', label: 'Level 2 · 0.52–0.55', status: 'shipped', items: ['native-editing', 'levels', 'picker', 'grids', 'units', 'move-align'] },
  { id: 'l3', label: 'Level 3 · 0.56–0.59', status: 'shipped', items: ['grid-underlay', 'visual-styles', 'faster-tools', 'cad2bim', 'ribbon', 'homepage'] },
  { id: 'l4', label: 'Level 4 · building now', status: 'building', items: ['ifc-writer', 'tool-polish'] },
  { id: 'l5', label: 'Level 5 · next', status: 'next', items: ['edit-2', 'picker-rotate', 'move-grids', 'align-elevations', 'first-hover'] },
  { id: 'l6', label: 'Level 6 · planned', status: 'planned', items: ['sync-revit', 'create-tools', 'constraints', 'families', 'export-to-cad2bim', 'export-revit-more'] },
  { id: 'l7', label: 'Level 7 · planned', status: 'planned', items: ['rebar', 'ch-dxf', 'stairs', 'sheets', 'view-markers', 'etabs'] },
  { id: 'roof', label: 'Roof · planned', status: 'planned', items: ['versions', 'bcf', 'addons'] },
  { id: 'sky', label: 'Ideas', status: 'idea', items: ['ask', 'clash', 'is456', 'formwork', 'steel', 'tablet', 'diff', 'dwg', 'site'] },
];

export const ROADMAP: RoadItem[] = [
  // ---- shipped: the foundation (0.1–0.49)
  { id: 'ifc-viewer', title: 'IFC viewer', detail: 'IFC2x3 and IFC4 from Revit and other tools, 50,000 elements smooth.', line: 'drawings', status: 'shipped', kind: 'new', version: '0.2' },
  { id: 'navigation', title: 'Revit-style navigation', detail: 'View cube, orbit, pan, zoom and two-letter shortcuts.', line: 'editing', status: 'shipped', kind: 'new', version: '0.2' },
  { id: 'see-inside', title: 'Section box and exploded views', detail: 'Capped cuts with arrow grips; explode by storey, radially or by category.', line: 'editing', status: 'shipped', kind: 'new', version: '0.10' },
  { id: 'dxf', title: 'DXF drawings', detail: 'Linework and layers from AutoCAD and other CAD programs.', line: 'drawings', status: 'shipped', kind: 'new', version: '0.4' },
  { id: 'dxf-3d', title: 'DXF → 3D', detail: 'CH-format drawings become an IFC4 model.', line: 'drawings', status: 'shipped', kind: 'new', version: '0.11' },
  { id: 'boq', title: 'BOQ with rates', detail: 'Element-wise quantities, rates and overrides, to Excel with live formulas.', line: 'quantities', status: 'shipped', kind: 'new', version: '0.6' },
  { id: 'console', title: 'Python console', detail: 'Ask the model questions in Python, in the browser.', line: 'platform', status: 'shipped', kind: 'new', version: '0.8' },
  { id: 'qa', title: 'QA checks', detail: 'Every IFC rated, with the Revit export settings that improve it.', line: 'quantities', status: 'shipped', kind: 'new', version: '0.5' },
  { id: 'bridge', title: 'cad2bim Bridge for Revit', detail: 'Load the open Revit model, sync selection, edit parameters and types, build DXF models natively.', line: 'revit', status: 'shipped', kind: 'new', version: '0.32' },
  // ---- shipped: level 1 (0.50–0.51)
  { id: 'project-file', title: 'Project files', detail: 'An open project format: model, views, edits and settings in one file.', line: 'platform', status: 'shipped', kind: 'new', version: '0.50', design: 'project-file.md' },
  { id: 'offline', title: 'Works offline', detail: 'After the first visit the app opens without a connection.', line: 'platform', status: 'shipped', kind: 'new', version: '0.50' },
  // ---- shipped: level 2 (0.52–0.55)
  { id: 'native-editing', title: 'Native editing', detail: 'Move, Copy, Rotate, Mirror, Array, Offset, Delete, Pin — one undo each.', line: 'editing', status: 'shipped', kind: 'new', version: '0.52', design: 'native-editing.md' },
  { id: 'levels', title: 'Levels as datums', detail: 'Move a level and everything hosted on it follows.', line: 'editing', status: 'shipped', kind: 'new', version: '0.53', design: 'levels.md' },
  { id: 'picker', title: 'Snaps and typed distances', detail: 'Element, datum and angle snaps; type a length and press Enter.', line: 'editing', status: 'shipped', kind: 'new', version: '0.54' },
  { id: 'grids', title: 'Grids and reference planes', detail: 'Drawn in plans, named 1, 2, 3 and A, B, C, shown in elevations.', line: 'editing', status: 'shipped', kind: 'new', version: '0.54' },
  { id: 'units', title: 'Project Units', detail: 'mm, cm, m or feet-inches, with Indian or international grouping.', line: 'platform', status: 'shipped', kind: 'new', version: '0.54' },
  { id: 'move-align', title: 'Move, Copy and Align, Revit’s way', detail: 'Start and end points, Constrain, Align with locks.', line: 'editing', status: 'shipped', kind: 'rework', version: '0.55', design: 'datums-and-constraints.md' },
  // ---- shipped: level 3 (0.56–0.59)
  { id: 'grid-underlay', title: 'Grid underlay', detail: 'CAD-style grid in plans and elevations, Blender-style ground in 3D.', line: 'editing', status: 'shipped', kind: 'new', version: '0.56' },
  { id: 'visual-styles', title: 'Visual Style menu', detail: 'Wireframe, Hidden Line, Shaded, Consistent Colors, Realistic.', line: 'editing', status: 'shipped', kind: 'update', version: '0.56' },
  { id: 'faster-tools', title: 'Faster tools on big models', detail: 'Snapping three times quicker on a 14,000-element tower.', line: 'platform', status: 'shipped', kind: 'rework', version: '0.56' },
  { id: 'cad2bim', title: 'Shanku becomes cad2bim', detail: 'New name, .c2b projects; every older file still opens.', line: 'platform', status: 'shipped', kind: 'revamp', version: '0.57' },
  { id: 'ribbon', title: 'Revit-style File menu and Modify tab', detail: 'Revit’s panels and order; Quick Access Toolbar.', line: 'editing', status: 'shipped', kind: 'revamp', version: '0.58' },
  { id: 'homepage', title: 'This homepage and roadmap', detail: 'A drawing sheet you can scroll through; the guide brought up to date.', line: 'platform', status: 'shipped', kind: 'revamp', version: '0.59' },
  // ---- building now
  { id: 'ifc-writer', title: 'IFC writer', detail: 'Download IFC with your edits in it — the base for syncing back to Revit.', line: 'drawings', status: 'building', kind: 'new' },
  { id: 'tool-polish', title: 'Move, Copy and Align polish', detail: 'The refinements found in testing against Revit.', line: 'editing', status: 'building', kind: 'update' },
  // ---- next
  { id: 'edit-2', title: 'More Modify tools', detail: 'Trim/Extend, Split, Scale, Match Type, Paste Aligned to Levels.', line: 'editing', status: 'next', kind: 'new', design: 'native-editing.md' },
  { id: 'picker-rotate', title: 'Rotate and Mirror by picking', detail: 'Centre and angle by clicking, like Move.', line: 'editing', status: 'next', kind: 'rework' },
  { id: 'move-grids', title: 'Move grids', detail: 'And what is locked to them follows.', line: 'editing', status: 'next', kind: 'new', design: 'datums-and-constraints.md' },
  { id: 'align-elevations', title: 'Align in elevations', detail: 'Faces and levels, not only plans.', line: 'editing', status: 'next', kind: 'update' },
  { id: 'first-hover', title: 'Faster first hover', detail: 'The first snap over a large model without a pause.', line: 'platform', status: 'next', kind: 'update' },
  // ---- planned
  { id: 'sync-revit', title: 'Sync with Revit', detail: 'Send cad2bim edits back to Revit; conflicts are always decided by a person.', line: 'revit', status: 'planned', kind: 'new', design: 'native-editing.md' },
  { id: 'create-tools', title: 'Create tools', detail: 'Columns, beams, walls, slabs and footings, drawn in cad2bim.', line: 'editing', status: 'planned', kind: 'new', design: 'native-editing.md' },
  { id: 'constraints', title: 'Dimension constraints', detail: 'Locked dimensions and EQ, as in Revit.', line: 'editing', status: 'planned', kind: 'new', design: 'datums-and-constraints.md' },
  { id: 'families', title: 'Families and templates', detail: '.c2f families and .c2t templates.', line: 'editing', status: 'planned', kind: 'new' },
  { id: 'export-revit-more', title: 'Export to Revit: windows, doors and grids', detail: 'DXF models built in Revit with their openings and datums.', line: 'revit', status: 'planned', kind: 'update' },
  { id: 'view-markers', title: 'Section and elevation markers', detail: 'Markers in plans, and crop regions on views.', line: 'drawings', status: 'planned', kind: 'new' },
  { id: 'export-to-cad2bim', title: 'Export to cad2bim, from Revit', detail: 'A button in Revit that keeps what IFC drops.', line: 'revit', status: 'planned', kind: 'new', design: 'roadmap-archive.md' },
  { id: 'rebar', title: 'Rebar and bar bending schedules', detail: 'Reinforcement in 3D and BBS to IS 2502 shapes.', line: 'quantities', status: 'planned', kind: 'new' },
  { id: 'ch-dxf', title: 'Model → CH DXF', detail: 'The reverse of DXF → 3D: drawings from the model.', line: 'drawings', status: 'planned', kind: 'new', design: 'to-ch-dxf.md' },
  { id: 'stairs', title: 'Stairs in DXF → 3D', detail: 'The CH stair convention: runs and landings.', line: 'drawings', status: 'planned', kind: 'update' },
  { id: 'sheets', title: 'Sheets and PDF', detail: 'Views on sheets with title blocks, printed to PDF.', line: 'drawings', status: 'planned', kind: 'new' },
  { id: 'etabs', title: 'ETABS models', detail: 'Open .e2k analysis models as structure.', line: 'drawings', status: 'planned', kind: 'new', design: 'roadmap-archive.md' },
  { id: 'versions', title: 'Versions and history', detail: 'Every save kept; compare two revisions side by side.', line: 'platform', status: 'planned', kind: 'new', design: 'revision-timeline.md' },
  { id: 'bcf', title: 'Issues (BCF)', detail: 'Pin an issue to a view and pass it to Revit and other tools.', line: 'platform', status: 'planned', kind: 'new' },
  { id: 'addons', title: 'Add-ons', detail: 'pyRevit-style extensions in Python, from a folder or a Git repository.', line: 'platform', status: 'planned', kind: 'new', design: 'addons.md' },
  // ---- ideas: not commitments
  { id: 'ask', title: 'Ask the model', detail: '“Total M30 concrete on Level 4?” in plain words.', line: 'platform', status: 'idea', kind: 'idea' },
  { id: 'clash', title: 'Clash checks', detail: 'Members that overlap, found and listed.', line: 'quantities', status: 'idea', kind: 'idea' },
  { id: 'is456', title: 'IS 456 checks', detail: 'Cover, spacing and size rules flagged on the model.', line: 'quantities', status: 'idea', kind: 'idea' },
  { id: 'formwork', title: 'Formwork quantities', detail: 'Shuttering areas beside concrete volumes.', line: 'quantities', status: 'idea', kind: 'idea' },
  { id: 'steel', title: 'Steel takeoff', detail: 'Reinforcement weight by diameter and level.', line: 'quantities', status: 'idea', kind: 'idea' },
  { id: 'tablet', title: 'Tablet and phone', detail: 'Check a model on site from a tablet.', line: 'platform', status: 'idea', kind: 'idea' },
  { id: 'diff', title: 'What changed, in quantities', detail: 'Concrete and cost differences between two revisions.', line: 'quantities', status: 'idea', kind: 'idea' },
  { id: 'dwg', title: 'Open DWG directly', detail: 'No more saving as DXF first.', line: 'drawings', status: 'idea', kind: 'idea' },
  { id: 'site', title: 'The model on its site', detail: 'Placed on the map, in its surroundings.', line: 'platform', status: 'idea', kind: 'idea' },
];

export const byId = (id: string): RoadItem | undefined => ROADMAP.find((r) => r.id === id);

/** docs/roadmap.md, generated from this list (`npm run roadmap`). */
export function roadmapMarkdown(): string {
  const out: string[] = [
    '# cad2bim roadmap',
    '',
    '<!-- Generated from apps/web/src/home/roadmap.ts by `npm run roadmap`; edit the list there, not this file. -->',
    '',
    'Shipped work names the release that brought it. Ideas are not commitments — tell us which matter.',
    '',
  ];
  for (const status of ['building', 'next', 'planned', 'idea', 'shipped'] as const) {
    const items = ROADMAP.filter((r) => r.status === status);
    out.push(`## ${STATUS_LABEL[status]}`, '');
    for (const line of Object.keys(LINES) as Line[]) {
      const here = items.filter((r) => r.line === line);
      if (!here.length) continue;
      out.push(`### ${LINES[line].label}`, '');
      for (const r of here) out.push(`- **${r.title}** (${KIND_LABEL[r.kind].toLowerCase()}${r.version ? `, ${r.version}` : ''}) — ${r.detail}${r.design ? ` Design: [${r.design}](design/${r.design}).` : ''}`);
      out.push('');
    }
  }
  return out.join('\n');
}

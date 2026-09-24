# Revision timeline (design)

Status: **proposed**, not built. Written against Shanku 0.22.0 (engine 0.20.0). Nothing in this document exists in code yet unless it says "today".

## Why

Revit has no built-in way to see what changed between two issues of a model. Teams compare PDFs by eye or buy add-ins. Shanku already has the pieces for a better answer: stable element identity (IFC GlobalId), reserved diff colours (`diff-added`, `diff-changed`, `diff-removed`, `diff-unchanged`, never used so far), a transaction history and local storage. The revision timeline turns them into one feature: every model you open for a project is kept as a revision, and any two revisions can be compared in 3D, in a change list and in an export.

## What exists today

| Piece | Where | State |
|---|---|---|
| Element identity | `packages/engine/src/model/types.ts` `ElementRecord.globalId` | Read from IFC. Revit keeps GlobalIds stable (`docs/ifc-compatibility.md`); DXF → 3D makes deterministic ones (`dxf2ifc.py` `ifc_guid`, key `layer|mark|level|x|y`). |
| Diff colours | `packages/tokens/tokens.json` `diff-*`, `opacity-removed`, `opacity-ghost` | Defined, unused. |
| Per-element colour hook | `Viewport` prop `overrides` (`index`, `color`, `transparency`, `halftone`) | Used by Visibility/Graphics; reusable. |
| Session storage | `apps/web/src/lib/session.ts`, IndexedDB `shanku` v1, store `session` | Holds one model (`key 'model'`), drawings and views per file name. |
| Model identity | File name only | No project id and no content hash. |
| Revision compare | — | Does not exist (the playground has a mock-up button only). |

## User stories

1. I open `Tower-B_R3.ifc`. Shanku sees I opened `Tower-B_R2.ifc` for the same project last week and offers: "Keep as revision R3 of Tower B?".
2. I open the Revisions panel and see R1, R2, R3 on a timeline, each with its date, label and a change badge (`+12 ~5 −3 ↔2` against the previous one).
3. I pick R2 as the base and R3 as the compare. The model colours by change, removed elements show as faint ghosts where they used to be, and the change list shows every difference.
4. I click "Column C12: section 400 × 400 → 450 × 450" and the view selects and zooms to it.
5. I export the change list to Excel or CSV for the site team, or as BCF for the consultant.

## Model

### Project and revision

```ts
/** A project groups revisions of the same building. Stored, never inferred silently. */
interface Project {
  id: string;            // uuid
  name: string;          // "Tower B"
  createdAt: number;
}

interface Revision {
  id: string;            // uuid
  projectId: string;
  label: string;         // "R3", editable
  note: string;          // free text, e.g. "Issued for tender"
  fileName: string;
  fileBytes: number;
  sha256: string;        // of the file bytes: the same file twice is the same revision
  openedAt: number;
  ifcSchema: string;     // "IFC4"
  /** Compact per-element summary: enough to diff and to draw removed elements. */
  elements: RevisionElement[];
  /** The file itself, optional: kept only when the user asks and quota allows. */
  hasFile: boolean;
}

interface RevisionElement {
  globalId: string;
  category: Category;
  ifcClass: string;
  mark: string;
  name: string;
  typeName: string;
  level: string;
  grade: string;
  volume: number;
  dims: { length: number | null; width: number | null; depth: number | null; height: number | null };
  bounds: [number, number, number, number, number, number];
}
```

A 50,000-element model summary is about 10 MB as JSON; stored as structured-clone objects in IndexedDB it needs no parsing on read. The file bytes are optional because a large IFC can be 100 MB or more.

**Project detection.** On open, Shanku computes the SHA-256 of the file. If it matches a stored revision, the timeline simply marks that revision as current. Otherwise it proposes a project in this order:

1. The project whose latest revision shares most GlobalIds with the new file (sample 2,000 GlobalIds; accept when at least 50 % match).
2. The project whose file name matches after stripping revision tokens (`_R3`, `-rev3`, ` (3)`, dates like `2026-09-24`).
3. A new project named from the file name.

The user always confirms. Nothing is added to a project without that confirmation, and "Don't keep revisions for this file" is one click.

### Storage

IndexedDB `shanku` moves from version 1 to 2 and adds three stores: `projects` (key `id`), `revisions` (key `id`, index `projectId`), and `revisionFiles` (key `revisionId`, the optional bytes). The existing `session` store is unchanged, so an upgrade keeps today's saved model and views.

- Ask for persistent storage (`navigator.storage.persist()`) the first time a revision is kept, and show the used and available space (`navigator.storage.estimate()`) in the panel.
- When a write fails for quota, keep the summary and drop the file bytes, and say so: "R4 kept without its file: not enough browser storage."
- Export and import a whole project as one `.shanku-project` zip (summaries JSON plus any kept IFC files), so revisions move between machines without a server.

## Matching elements between revisions

Pairs are found in three passes. Each pair records how it was matched, and the change list shows it.

| Pass | Key | When it is used |
|---|---|---|
| 1. GlobalId | `globalId` | Always first. Revit and DXF → 3D keep it stable. |
| 2. Geometry | `category` + bounds rounded to 5 mm | For elements left over after pass 1. Catches tools that regenerate GlobalIds on every export. This is Structura's approach (see `structura-lessons.md`). |
| 3. Mark | `category` + `level` + `mark`, only when the mark is unique on both sides | For elements left over after pass 2. |

Everything still unmatched in the base is **removed**; everything still unmatched in the compare is **added**.

If fewer than half of the elements matched in pass 1 but most matched in pass 2, show a banner: "This file changed its GlobalIds. Elements were matched by position; moved elements may show as removed and added." This keeps a bad export from looking like a redesign.

### Change kinds

| Kind | Rule | Colour token |
|---|---|---|
| Added | Only in the compare revision | `diff-added` |
| Removed | Only in the base revision; drawn as a ghost box from `bounds` | `diff-removed` at `opacity-removed` |
| Modified | Matched, and any compared field differs | `diff-changed` |
| Moved | Matched, fields equal, bounds centre moved more than 5 mm | `diff-moved` (new token, see below) |
| Unchanged | Matched, nothing differs | `diff-unchanged` at `opacity-ghost` |

Compared fields, with tolerances: `typeName`, `grade`, `mark`, `level`, `ifcClass`, each `dims` value (±1 mm), `volume` (±0.1 % or 0.0001 m³, whichever is larger), and the bounds size (±1 mm). An element that both moved and changed is **Modified**, and its change record includes the move.

```ts
interface ElementChange {
  kind: 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';
  matchedBy: 'globalId' | 'geometry' | 'mark' | null;
  base: RevisionElement | null;
  compare: RevisionElement | null;
  fields: Array<{ field: string; from: string | number | null; to: string | number | null }>;
  /** Centre displacement in metres, when matched. */
  moved: number;
}

interface RevisionDiff {
  baseId: string;
  compareId: string;
  counts: Record<ElementChange['kind'], number>;
  changes: ElementChange[];
  globalIdMatchRate: number;
  ms: number;
}

/** packages/engine/src/model/diff.ts: pure, synchronous, no DOM. */
export function diffRevisions(base: RevisionElement[], compare: RevisionElement[], opts?: { moveTolerance?: number }): RevisionDiff;
```

Maps keyed by GlobalId and by rounded geometry make this linear. The target is under 300 ms for 50,000 elements against 50,000 (the `tools/fixtures` large model) on the main thread. If that target is missed, run it in the IFC worker.

## Showing a comparison

### In 3D

- **Colour by → Revision diff** becomes a real mode. It writes the Viewport `overrides` for every element of the loaded (compare) model from the change kinds.
- **Removed elements** are not in the loaded file, so they are drawn as translucent boxes from their stored `bounds`, in `diff-removed` at `opacity-removed`. This needs one small engine addition: a "ghost boxes" overlay layer that draws instanced boxes and takes part in picking.
- A legend with the five kinds and their counts; clicking a kind toggles its visibility, like Visibility/Graphics.
- Comparing is a view state, not a transaction: switching it on or off does not add undo steps. Per-view: each view keeps its own colour mode, as today.

### Revisions panel

A new dock panel `revisions` (DockWorkspace `PanelId` gains `'revisions'`).

- **Timeline:** one row per revision, newest first: label, date, note, file name and size, and the change badge against the previous revision. A kept file shows a download icon; the current revision is marked.
- **Compare pickers:** Base and Compare drop-downs, defaulting to previous and current. A "Step" slider moves both along the timeline, so you can scrub through the project history one issue at a time.
- **Change list:** a table (Kind, Category, Mark, Level, Field, Was, Now, Matched by) with filters by kind and category and a text search. Clicking a row selects the element and fits the view to it; for a removed element it fits to its ghost box. Arrow keys step through rows.
- **Actions:** rename and annotate a revision (transactions `Rename revision`, `Edit revision note`, so they undo), delete a revision (confirm, cannot be undone because storage is freed), keep or drop the file bytes, export.

### Exports

- **Change list CSV and Excel:** one row per field change (Kind, GlobalId, Category, Mark, Level, Field, Was, Now, Matched by). The Excel version adds a Summary sheet with counts per level and category.
- **BCF 2.1:** one topic per modified or removed element, with a viewpoint that selects its GlobalId. Consultants can open it in Solibri, BIMcollab or Revit (with a plug-in). Revit cannot produce this on its own.
- **Revision report PDF** later, when a PDF writer exists; Structura's jsPDF report is the model to follow.

## Honesty rules

- A comparison describes the elements, not the design. The panel says: "Compared by element identity and geometry. Loads, reinforcement and analysis results are not compared."
- Every change row says how it was matched.
- A removed element drawn as a ghost box is labelled "shape approximated from its bounding box".

## Design-system impact

- **New token `diff-moved`:** a blue that is distinct from `diff-added` (green), `diff-changed` (yellow) and `diff-removed` (red) in lightness as well as hue. Suggested `#3F7DB8`. Colour-by modes are exclusive, so reusing a hue from the concrete-grade scale is acceptable.
- The change-list table, badge and legend reuse `StatusChip`, `PropertyRow` patterns and the planned Menu and Table components.
- The ghost boxes use `diff-removed` and `opacity-removed`; no raw colours in the engine.

## Delivery

| Phase | Scope | Versions |
|---|---|---|
| 1 | Storage v2, project detection, timeline list, `diffRevisions` with GlobalId and mark matching, change list, CSV export | engine minor, web minor |
| 2 | Colour by Revision diff, ghost boxes for removed elements, geometry matching, Excel export, `diff-moved` token | engine minor, web minor, tokens minor |
| 3 | Step slider, project export and import, BCF export | web minor |

Tests: unit tests for `diffRevisions` (each kind, each matching pass, tolerances, the GlobalId-regenerated banner), a storage upgrade test from v1 to v2, and a render check that the five diff colours meet 3:1 against `viewport` in both canvas themes.

## Open questions

1. Should the file bytes be kept by default for models under a size limit (say 20 MB)?
2. Is a project-level "issue" label (Tender, For construction) worth a field of its own, or is the free-text note enough?
3. IFC `IfcOwnerHistory` can say who last changed an element, but Revit fills it inconsistently. Show it when present, or leave it out to avoid misleading blanks?

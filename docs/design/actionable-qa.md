# Actionable QA (design)

Status: **proposed**, not built. Written against Shanku 0.22.0. Nothing in this document exists in code yet unless it says "today".

## Why

Revit's Warnings dialog is a long list of text with no severity, no explanation and no way to act on most entries. The brand book already promises better: "3 beams have no top level. Select them to fix." This design makes every QA result a card you can act on. It says what was checked, how bad it is, which elements are affected, what the check does not prove, and gives one-click select, isolate and zoom, plus a fix where a safe one exists.

## What exists today

| Piece | Where | State |
|---|---|---|
| IFC export rating | `packages/engine/src/ifc/compat.ts` `assessCompatibility` | Model-wide notes only (schema, quantity sets, Revit property sets, elements without level > 5 %). Shown in Properties when nothing is selected. Not element-level. |
| DXF → 3D checks | `dxf2ifc.py` `analyze()`, type `PipelineQa` in `packages/engine/src/pipeline/types.ts` | 16 codes with severity, DXF position, layer, handle and bounds. "Show" zooms the 2D drawing to the problem but does not select the entity. |
| Status colours | tokens `status-ok`, `status-warning`, `status-error`, `status-unchecked` | Used by the compatibility badge and Activity; no per-element QA state. |
| Bottom panel with badges | `@shanku/ui` `BottomPanel` (`badge?: number`) | Built, used only in the playground. |
| Select and zoom helpers | `m.setSelection`, `viewport.fit(indices)`, `boqSelect` | Ready to reuse. |
| QA panel, QA colour mode | — | Do not exist. |

## One finding shape for every check

The Structura viewer's finding card is the best pattern we have: severity, the clause it relates to, what was measured, and what the result does not prove (see `structura-lessons.md`). Shanku adopts it and adds actions.

```ts
type Severity = 'error' | 'warning' | 'info';

interface Finding {
  /** Stable across runs: `${checkId}:${hash of sorted element GlobalIds}`. Used for "ignore". */
  id: string;
  checkId: string;
  severity: Severity;
  title: string;          // "Discontinuous column"
  detail: string;         // "Column C12 on Level 3 starts 450 mm above anything that supports it."
  clause?: string;        // "IS 1893 (Part 1): 2016, Table 6(d)"
  measured: string;       // "Column bottom vs. the top of columns, walls and footings below, 50 mm tolerance."
  limits: string;         // "Does not check transfer beams or load paths through slabs."
  /** Model element indices; empty for model-wide findings. */
  elements: number[];
  /** DXF findings: where on the drawing. */
  drawing?: { docId: string; handle: string | null; bounds: [number, number, number, number] | null };
  fixes: Fix[];
}

interface Fix {
  id: string;
  label: string;          // "Assign level by elevation"
  /** One sentence shown before applying: exactly what will change. */
  preview: string;
  /** Runs inside history.run(label, …), so every fix is one undo step. */
  apply: (tx: Transaction) => void;
}

interface QaCheck {
  id: string;
  group: 'model' | 'is1893' | 'marks' | 'ifc' | 'pipeline';
  title: string;
  /** Which categories it reads; drives "unchecked" colouring. */
  scope: Category[];
  run(ctx: QaContext): Finding[];
}
```

The checks live in a registry in `packages/engine/src/qa/` and run in the IFC worker after parse, so the interface never blocks. Each check is a pure function of `ElementRecord[]` plus levels. That makes it cheap to test and lets the Python console run the same checks. The DXF pipeline keeps its own checks in Python; its `PipelineQa` items are converted to `Finding` so both appear in one list.

## Checks, first set

Shanku reads IFC solids, not ETABS analytical lines. So each Structura check is adapted to what an IFC element carries: category, level, bounds, dimensions, mark, grade and volume. Tolerances are named constants; each one is shown in the card's "Measured" line.

### Model health

| Check | Severity | Rule | Adapted from |
|---|---|---|---|
| Duplicate elements | error | Same category and bounds equal within 5 mm | Structura `duplicates` |
| Overlapping columns | error | Two columns on one level whose plan boxes overlap by more than 1 mm | Structura `overlapping-columns` |
| Discontinuous columns | error | Column bottom more than 50 mm above the model base and not within 50 mm of the top of a column, wall, footing or beam below it | Structura `floating-columns` |
| Zero or tiny size | error | Any dimension below 10 mm, or volume 0 | Structura `zero-length` |
| Unusual length | warning | Beam or column longer than 25 m or shorter than 150 mm | Structura `odd-length` |
| No level | warning | `level` empty | Existing compatibility note, now per element |
| No grade | warning | Concrete element with empty `grade` | New |
| Lateral system gap | info | The model has walls or braces, but some storeys (above the base) have none | Structura `lateral-gap` |

### Marks (Shanku-specific)

| Check | Severity | Rule |
|---|---|---|
| Missing mark | warning | Structural element with empty `mark` |
| Duplicate mark | warning | Same mark on the same level with different dimensions or grade |
| Mark and size disagree | info | Elements sharing a mark have different cross-sections |

### IS 1893 screening (geometry only)

These carry Structura's exact ratios and its labelling: **"Screening, not compliance"**.

| Check | Clause | Flag when | Error when |
|---|---|---|---|
| Setback | Cl. 7.1, Table 6(a) | Width or depth ratio between adjacent storeys > 1.25 | > 1.5 |
| Re-entrant corner | Table 5(a) | Projection beyond the re-entrant corner > 15 % of the plan dimension | > 30 % |
| Soft storey (vertical area) | Table 6(a) | Column + wall area < 70 % of the storey above, or < 80 % of the average of the three above, or storey height > 1.25 × the one above | ratio < 0.6 |
| In-plane discontinuity | Table 6(d) | More than 50 % of a storey's wall and brace positions are missing in the storey below | always |

The panel also lists what is **not checkable** from geometry and why: torsional irregularity (Table 5(a)), mass irregularity (Table 6(b)), weak storey (Table 6(c)) and diaphragm discontinuity (Table 5(b)). Minimum member sizes from IS 13920 (for example columns and beams in special moment frames) belong here too, but each clause and value must be confirmed against the published code text before it ships.

## Acting on a finding

Each card has:

- **Select all N:** selects the elements (Shift/Ctrl add and remove, as in the viewport).
- **Isolate:** temporary isolate plus fit. Esc restores, as everywhere else.
- **Zoom:** fits the view to the elements without changing the selection.
- **Step:** "‹ 1 of 12 ›" walks element by element (keys F8 and Shift F8), selecting and fitting each one.
- **Show in drawing:** for DXF findings, opens the 2D tab, zooms to the bounds and selects the entity by `handle` (today it only zooms).
- **Fix:** only where a fix is safe and exactly describable. It shows its one-sentence preview, then runs as one undo step.
- **Ignore…:** with a required reason. Stored per file and keyed by finding id, listed under "Ignored (n)", and reversible. An ignore stops matching automatically when the affected elements change.

### Fixes available in the first release

Shanku does not edit IFC geometry yet (modelling arrives later), so fixes are limited to what the app already owns:

| Finding | Fix | What changes |
|---|---|---|
| Missing mark (many elements) | "Detect marks from `<property>`" | Adds a mark rule (the existing Mark rules, as a transaction), re-detects |
| No grade | "Detect grade from `<property>`" | Adds a grade rule, re-detects |
| No level | "Assign level by elevation" | Stores a level override per GlobalId in the view data; exported later |
| Duplicate elements | "Hide the extra copies in this view" | View-level hide (a transaction), clearly labelled as not deleting anything |

Fixes that need real model edits ("delete duplicate", "extend column down") are listed as future fixes and appear as disabled buttons with the reason. A fix is never guessed: if two properties could supply marks, the fix asks.

## Where findings appear

- **QA panel:** a new dock panel `qa` with tiles for Errors, Warnings, Notes and Checks run, a filter by group, then the cards. Its tab badge shows the error count (`BottomPanel` already supports `badge`).
- **Colour by → QA status:** each element takes the worst severity of its open findings: `status-error`, `status-warning`, `status-ok`, or `status-unchecked` for categories no check covers. Always with a legend, because status is never shown by colour alone.
- **Properties:** a single selected element shows its findings at the top, each with the same actions.
- **Status bar:** "QA: 3 errors · 12 warnings". Clicking it opens the panel.
- **Exports:** a QA sheet in the Excel BOQ workbook, a CSV, and BCF 2.1 topics (one per finding, viewpoint with the elements' GlobalIds) for issue trackers.

## When checks run

After each model load and after anything that changes the inputs (mark rules, grade rules, level overrides). Checks that depend only on unchanged inputs keep their results. The time taken is shown ("12 checks · 180 ms"). Target: under 500 ms for 50,000 elements, using a spatial hash for the pairwise checks and a cap (4,000 columns per level) on the one quadratic check, as Structura does.

## Writing rules for findings

- The title names the problem; the detail names the element and the number: "Column C12 on Level 3 starts 450 mm above its support."
- Say what to do, never "Oops" or exclamation marks (brand voice).
- Every card has "Measured:" and "What this does not prove:".
- A clean result says: "All 12 checks passed. This does not mean the model is correct; it means these checks found nothing."

## Design-system impact

- Finding cards need a Card and a severity Badge in `@shanku/ui`, built from `status-*` tokens with an icon for each severity (colour never alone), and the planned Menu for Fix and Ignore.
- The QA status colours on the model must reach 3:1 against `viewport` in both canvas themes; add those pairs to `packages/tokens/scripts/check-contrast.mjs`.
- New icons: severity glyphs (error, warning, info) drawn on the 24 px grid, and "step" arrows if Lucide's do not fit.

## Delivery

| Phase | Scope |
|---|---|
| 1 | `Finding` type, check registry, model-health and mark checks, QA panel with select, isolate, zoom and step, pipeline findings merged in |
| 2 | Colour by QA status, Properties integration, ignores, CSV and Excel export, the first fixes |
| 3 | IS 1893 screening with the not-checkable list, BCF export, Python access (`shanku.qa()`) |

Tests: one fixture per check that triggers it and one that does not, tolerance edges, stable finding ids across reloads, and "a fix is one undo step and undo restores the finding".

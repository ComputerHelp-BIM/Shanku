# What Shanku can take from Structura

Status: **analysis**, written 2026-09-24 against Structura 1.6.0 (`ComputerHelp-BIM/structura-viewer`, commit `0aace11`) and Shanku 0.22.0.

Structura is Computer Help's browser viewer for ETABS and SAP2000 models (https://structura-viewer.vercel.app/). Both products come from the same owner and are unlicensed private code, so code and text can be reused directly; each port below still needs rewriting from Structura's plain ES5 modules into Shanku's TypeScript packages.

## Status in Shanku 0.30.0

| # | Structura feature | Status |
|---|---|---|
| 1 | Finding cards | **Built** (QA panel, 0.27.0); ignore and fix buttons are phase 2 |
| 2 | Health checks with named tolerances | **Built**: duplicates, overlapping and discontinuous columns, tiny size, length band, level, grade, lateral gap, marks |
| 3 | IS 1893 screening | Not started (actionable-QA phase 3) |
| 4 | Geometry-keyed revision matching | Not started (revision timeline) |
| 5 | Command palette | **Built** (Ctrl + K, 0.24.0) |
| 6 | ETABS / SAP2000 import | Not started (largest item) |
| 7 | "What now?" intents | **Built** (title bar, 0.30.0) |
| 8 | Scope sentence on quantities | **Built** (BOQ scope switch and Excel, 0.30.0) |
| 9 | Rebar kg/m³ bands | **Built** (reinforcement estimate, 0.30.0) |
| 10 | Rate Card sheet with live formulas | Not started |
| 11 | Filter builder | Not started (Shanku has category filters) |
| 12 | Guide and FAQ | **Built** (F1, 0.24.0) |
| 13 | Guided export and file diagnostic | **Built** (0.30.0) |
| 14 | Shareable view-state token | **Built** (`#app&view=` links, 0.30.0; also quick-wins B3) |
| 15 | Performance readout and plan minimap | Not started |
| 16 | IS 1893 seismic weight | Later (needs loads) |
| 17 | Large-model rendering thresholds | Not started |
| — | Explode views (listed below as not worth porting) | **Built** at your request (0.24.0) |

## The two products side by side

| | Structura 1.6.0 | Shanku 0.22.0 |
|---|---|---|
| Purpose | View, measure, take off and screen ETABS/SAP2000 models | IFC-native RCC modelling: open, navigate, inspect, quantities; modelling next |
| Input | `.e2k`, `.$et`, `.s2k`, `.$2k`, ETABS tables (`.csv`, `.txt`, `.xlsx`); `.edb`/`.ebk` get a guided export | IFC, DXF (and DXF → IFC) |
| Code | 23 plain JS modules, no build, three.js r128 | TypeScript monorepo (tokens, brand, ui, engine, web), three.js, Pyodide |
| Model data | Analytical: joints, frames, areas, sections, materials, loads | Physical: IFC solids with category, level, mark, grade, quantities |
| Look | Teal accent, Barlow type, dark-first | Orange accent, IBM Plex, Paper and Ink themes |
| Keep separate | Brand, audio, look | Brand, Revit-style workflow |

## Worth porting, in priority order

| # | Structura feature | Where in Structura | Why it helps Shanku | Where it goes in Shanku |
|---|---|---|---|---|
| 1 | **Finding cards**: severity, clause, "Measured", "What it does not prove", Select all N, Isolate | `app-drawer.js` `findingCard`, `analysis.js` | The core of actionable QA | `actionable-qa.md` |
| 2 | **Health checks** with named tolerances (5 mm node match, 50 mm column support, 150 mm–25 m length band) | `analysis.js:289-504` | A ready, field-tested rule set | Adapted to IFC solids in `actionable-qa.md` |
| 3 | **IS 1893 screening** (setback 1.25/1.5, re-entrant 15 %/30 %, soft storey 0.70/0.80/0.60, in-plane 50 %) and its "not checkable" list | `codecheck.js` | Indian code relevance; honest scope | `actionable-qa.md` phase 3 |
| 4 | **Geometry-keyed revision matching** (5 mm rounding, category-scoped keys, pairing by count) | `analysis.js:515-567` | Fallback when GlobalIds are regenerated | Pass 2 in `revision-timeline.md` |
| 5 | **Command palette** built from one list of commands (about 100 entries, grouped, arrow keys) | `app.js:802-987` | Shanku's Ctrl K only finds elements | Command registry in `python-macros.md` |
| 6 | **ETABS/SAP2000 import** (a 1,572-line parser with unit normalisation, insertion offsets, curved beams, a binary probe and a diagnostic) | `parser.js`, `sections.js`, `parse-worker.js` | Opens the ETABS user base to Shanku: ETABS text → IFC → Shanku, like DXF → 3D | New pipeline in the engine worker; the section outline code (`sections.js`) also gives true profiles |
| 7 | **"What now?" intents**: six tasks, and loading a sample if no model is open | `app.js:345-420`, `guide.js:597-634` | Shows new users where to start | Title bar button next to search |
| 8 | **Scope sentence on every quantity** ("Visible elements only · 312 of 850") and a scope switch (whole model, visible, selection, storey range) | `costing.js` `describeScope` | Quantities that say what they include | BOQ window |
| 9 | **Rebar kg/m³ bands** with out-of-range warnings (column 120–250, beam 90–200, slab 60–120, wall 70–160) | `costing.js` | Catches bad rate entries | BOQ rates |
| 10 | **Excel BOQ driven by a Rate Card sheet with live formulas** | `boq.js` | Shanku's workbook already exists; compare the formula approach | `apps/web/src/lib/excel.ts` |
| 11 | **Filter builder** (17 fields, text/enum/number operators, saved sets that work on any model) | `filters.js` | Richer than Shanku's category filters | View filters (`Filters.tsx`) |
| 12 | **Guide and FAQ** as data, searchable, with inline SVG diagrams that follow the theme | `guide.js` | Shanku has no in-app help beyond the Keyboard tab | New Guide window |
| 13 | **Guided export for unreadable files** plus a copyable "What is in this file?" diagnostic | `app.js:638-673`, `parser.js:1462` | Turns an unsupported IFC or DXF into instructions instead of an error | Open-file errors |
| 14 | **Shareable view-state token** (`STRUCTURA/1|` + base64 JSON) | `app-files.js:628-662` | Share a view without sending the model | Views: "Copy view link" |
| 15 | **Status-bar performance** (fps, triangles, draw calls) and a **plan minimap** with a camera arrow | `app.js:102-132, 286` | Helps with large models and orientation | Status bar, optional |
| 16 | **IS 1893 seismic weight per storey** (imposed load × 0.25 up to 3 kN/m², × 0.5 above; roof imposed excluded) | `loads.js:204-321` | Only once Shanku carries loads | Later |
| 17 | **Large-model rendering tricks**: colour and state in a data texture, merged geometry in 25,000-element chunks, box proxies above 30,000, lines only above 140,000 | `viewer.js` | Shanku's viewer already uses a state texture; the thresholds are worth copying | Engine performance work |

## Not worth porting

- **Ambient audio:** it fits a presentation viewer, not a production modelling tool, and it adds 658 lines to maintain. Keep it Structura's.
- **Explode views:** good for presentation, low value for modelling.
- **Environment presets (sunset, construction site):** Shanku's canvas themes cover the working need.
- **Snapshot-based undo:** Shanku's transaction history is the better model; keep it.

## Problems noticed in Structura (for its own backlog)

1. `findByGeometry` matches area elements on corner count plus the first point's x and z only (the model is Z-up), so plan y is never checked. Two slab or wall panels on the same level that share their first corner's x, one behind the other in y, can be confused when the compare view maps revision changes back onto the model (`app-core.js:396-398`; frames check all three axes).
2. The count of health checks is stated three ways: the guide and all-clear text say eight, the tile says "Checks run: 7", and `analysis.js` produces 10 finding types.
3. The tour says the rail has twelve sections; it has 15.
4. The compare picker does not accept `.xlsx`, although the main open does.
5. The "Check this model for problems" intent opens Health but not the IS 1893 panel, although its label covers both.
6. A moved element shows as removed plus added; there is no "moved" category (Shanku's design adds one).

## Suggested order

1. Command registry and palette (item 5): small, unblocks macros and helps every user.
2. Finding cards and health checks (items 1–2): the first release of actionable QA.
3. Revision matching (item 4), inside the revision timeline.
4. ETABS import (item 6): the largest piece and the largest new audience; do it after the command registry, so the importer's options are commands.
5. Scope sentences, rebar bands and "What now?" (items 7–9): small, visible improvements.

# Quick wins: easy features from Revit add-ons, and ones Revit lacks

Status: Analysis (2026-09-24, Shanku 0.26.0). Companion to [revit-gap.md](revit-gap.md), which lists built-in Revit features Shanku lacks. Every item here is small (one to four days) and reuses something Shanku already has: colour overrides, the command registry, History, the Properties data, and the DXF and IFC viewers. Ids (A1, B1…) are for picking; the order within each list is by value.

## A. In Revit, or only through add-ons

| Id | Feature | Where it exists | Why it is used daily | Effort | How it fits Shanku |
|---|---|---|---|---|---|
| A1 | **Colour by parameter** (grade, mark, level, size) with an automatic legend | pyRevit Color Splasher and similar add-ons. Built-in colour schemes are mostly for rooms and areas | "Show all M30 elements", "which beams have no mark" | 2–3 days | Per-element colour overrides |
| A2 | **Columns off grid**: flag columns more than a tolerance from a grid intersection | QA add-ons (Ideate Review and others) | A classic modelling mistake | 2 days | Grid lines and column centres are known |
| A3 | **Duplicate and overlapping elements** | Revit warnings, clearer in add-ons | Duplicates inflate the BOQ | 2 days | Bounds comparison; results select and zoom |
| A4 | **Select by parameter value** ("same size as this") | DiRoots, pyRevit | Faster than a filter | 1 day | The Select Similar pattern from the DXF view |
| A5 | **Export any category's properties to Excel** | BIMLink, DiRoots SheetLink | Checking and sharing data | 2 days | The BOQ Excel writer |
| A6 | **Saved viewpoints**: camera, section box, isolation and selection in one click | Navisworks; Revit needs a duplicated view for each | "Level 3 transfer area", again | 1–2 days | View state is already stored |
| A7 | **Section box from level to level** | pyRevit | One floor in 3D at once | 1 day | Level heights and the section box API |
| A8 | **Image export** with scale bar, title and date | Revit exports images; tidy output needs add-ons | Screenshots for site and client | 1–2 days | Canvas plus overlay |
| A9 | **Coordinates of a picked point** | pyRevit | Checking setting-out | 1 day | Same as the DXF coordinate readout |

## B. Not in Revit, even with add-ons

As far as we know. Check the Autodesk App Store before marketing any of these as unique.

| Id | Feature | Why it is useful | Effort | Why it is easy in Shanku |
|---|---|---|---|---|
| B1 | **"Why is this hidden?"**: pick or search an element; Shanku lists every reason it is not visible (category off, filter, temporary hide, section box, view range, explode) with a one-click fix for each | Probably the most common Revit complaint | 2–3 days | Shanku owns all visibility state |
| B2 | **Paste marks to select**: "C1, C4, B12" from Excel or WhatsApp selects and zooms, and lists unknown marks | Site queries arrive as lists | 1 day | Mark search already exists |
| B3 | **Link to a view** (built in 0.30.0): the URL holds camera, section box, isolation and selection; anyone with the same model opens exactly that view | Revit cannot link into a view | 2 days | View state is serialisable; the model stays on each device |
| B4 | **QR code to an element** on printed drawings | Site crews on phones | 1 day after B3 | Runs in a phone browser |
| B5 | **Drawing against model**: DXF column labels and positions compared with the IFC (missing, moved, different size) | The daily architect-versus-structure check | 3–4 days | Both files are parsed in one app |
| B6 | **Linked plan and 3D highlight**: hover in the plan, light up in 3D, and the other way round | Understanding complex framing | 2 days | One model, several views |
| B7 | **Compare two elements** side by side, differences highlighted | "Why is this beam's BOQ different?" | 1 day | Properties are loaded |
| B8 | **Heat map by a calculated value** (concrete per bay, element volume, steel ratio) with a gradient legend | Spots over-design quickly | 2 days after A1 | BOQ calculations |
| B9 | **Element card to share**: mark, size, level, grade and a snapshot as an image or text | How site coordination actually happens in India | 1 day | Properties plus canvas snapshot |
| B10 | **Undo for view actions**: temporary hide, isolate, section box and explode as named undo steps | In Revit these cannot be undone | 1 day | History transactions exist |

## Recommended first three

1. **B1 "Why is this hidden?"**: small, answers a known frustration, and shows what Shanku can do.
2. **B2 paste marks** and **B3/B4 view links and QR codes**: make Shanku a site-coordination tool.
3. **A1 colour by parameter**, then **A2 columns off grid**: daily checking tools that feed [actionable-qa.md](actionable-qa.md).

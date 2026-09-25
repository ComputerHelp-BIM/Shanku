# Revit parity: design decisions and review log

Shanku's panels follow Revit 2025 where Revit users would otherwise stumble, and use Shanku's design
tokens for colour so they fit Paper and Ink. This note records each pattern, why, and where it lives,
and logs design reviews so the next change starts from what was decided. Newest review first.

## Patterns

### Properties palette (`@shanku/ui`: `PropertySection`, `PropertyRow`, `PropertyGrid`, `PropertiesFooter`, `DockPanel` footer)

| Revit | Shanku | Why |
|---|---|---|
| Groups are bold bands that collapse (» «) | `PropertySection`: bold band, chevron, open/closed remembered per group title (`persistKey`) | Long parameter lists stay scannable; Revit users expect it |
| Thin lines between rows and between label and value | `.sk-prop-row` grid with 1 px row and column lines (`--border`), group band lines `--border-strong` | Reads as a table, like Revit |
| The line between label and value can be dragged | `PropertyGrid` sets `--sk-prop-label`; the 6 px handle sits fully inside the label (its overflow clipping must not shrink the grab zone); shared across panels, remembered | Long names ("Rebar Cover - Bottom Face") need room |
| Values left-aligned; read-only labels and values greyed | `.is-readonly` on the row | Shows at a glance what can be edited |
| Sort buttons in the footer: categorized, A → Z, Z → A | `PropertiesFooter` + `usePropertySort(key)`; sorts rows **within** groups, never the groups | As Revit; per panel, remembered |
| Apply always visible at the bottom | `DockPanel footer`: the body scrolls, the footer stays | Apply must never scroll away |
| Family and type at the top; category (count) and Edit Type | Properties head in Revit mode | Same orientation as Revit |
| Units | Number values show the project's display unit ("mm", "m³") unless Revit's text already has it | "600.000" must visibly mean 600.000 mm |

### Project Browser (`TreeView variant="revit"`)

Boxed +/− expanders, dotted guide lines (one 16 px column per level, elbow on the last child), small
icons per node, the open view in bold, a **Search** box that keeps matches and their parents and opens
everything while typing. Branches: Views (all), Families (category → family → type, from Revit's IFC
naming "Family:Type:Id"), then Shanku's Levels and Categories selection helpers.

### Type Properties (Revit's dialog)

Family and Type fields, Load / Duplicate / Rename, "Type Parameters" with a Parameter | Value header that
follows the split, collapsible groups, Sort by, Preview >> (a small 3D view of one instance), OK / Cancel /
Apply. Editing controls are present but disabled until type editing ships, with a tooltip saying so.

### Docking

Properties left, Project Browser right, as Revit docks them (layout key `shanku.layout.v3`).

### Scrollbars

Thin and themed everywhere (`scrollbar-width: thin`, thumb `--border-strong`, hover `--text-faint`), in
`@shanku/ui` styles so every surface gets them.

## Review log

### 2026-09-25 — Revit 2025 palette, browser and Type Properties (web 0.36.0, ui 0.15.0)

Compared side by side with Revit 2025 screenshots. Adopted: adjustable label/value split, fixed footer
with Apply, sort buttons within groups, Revit-style Project Browser with search and Families, Type
Properties layout with Preview, units next to numbers, thin scrollbars. Fixed: nested IFC groups lost
the line under their last row; the split handle was mostly clipped.

### 2026-09-25 — Properties like Revit's palette (web 0.35.0, ui 0.14.0)

Collapsible bold group bands, row lines, family/type head, Edit Type, Apply, IFC data folded under Revit's
parameters, Properties docked left. Fixed duplicate parameters by reading the palette's own list.

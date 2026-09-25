# Shanku ⇄ Revit bridge — protocol v1

The **Shanku Revit add-in** (`bridge/revit`, `Shanku.Revit.dll`) serves this API to Shanku running in a
browser on the same machine. Milestone 1 covers connecting, loading the model and syncing the selection.
Later milestones (parameter write-back, native element creation, change tracking) extend it; every
change keeps `protocol` compatible or bumps it.

## Transport

- HTTP/1.1 on `http://localhost:7071/shanku/v1` (port configurable in the add-in config).
- JSON bodies (UTF-8, camelCase). Errors: `{ "error": "message" }` with a 4xx/5xx status.
- **CORS**: only allowed origins get `Access-Control-Allow-Origin` (Shanku's production and preview
  sites, GitHub Pages and local dev servers; more can be added in the add-in config). Requests from any
  other origin are refused with 403. Preflights answer `Access-Control-Allow-Private-Network: true`, as
  Chrome's local network access requires; the first connection shows Chrome's permission prompt.
- The add-in never listens beyond `localhost`.

## Pairing and authentication

1. In Revit: **Shanku → Connect** shows a 6-digit code, valid for 5 minutes.
2. Shanku sends it once: `POST /pair { code, client }` → `{ token }`.
3. Every other call sends `Authorization: Bearer <token>` (the event stream: `?token=`).

Five wrong codes void the current code. Tokens survive a Revit restart (stored hashed in
`%APPDATA%\Shanku\bridge-tokens.json`) until **Shanku → Disconnect** revokes them all.

## Identity

An element is matched by its **IFC GlobalId**, computed the way Revit's IFC exporter does: the element's
`IfcGUID` parameter when present, otherwise `ExportUtils.GetExportId` compressed to the 22-character IFC
form. The Revit **ElementId** (the IFC `Tag`) is sent alongside as a fallback. A **document key** (the
project information's UniqueId) tells documents apart.

## Endpoints

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/hello` | no | `{ service: "shanku-revit", protocol: 1, addin, revit, pairingOpen, hasDocument, features }` |
| POST | `/pair` | no | `{ token }` or 403 |
| GET | `/status` | yes | `{ document: { title, key, path, isFamily } \| null, selection: string[] }` |
| POST | `/model/export` | yes | IFC4 Reference View bytes (`application/octet-stream`); headers `X-Shanku-Document-Key`, `X-Shanku-Document-Title` |
| GET | `/model/ids` | yes | `{ key, ids: [[globalId, uniqueId, elementId], …] }` (model elements only) |
| POST | `/selection` | yes | body `{ key, globalIds, elementIds? }` → `{ selected, missing }` |
| GET | `/events?token=` | yes | `text/event-stream` (below) |
| POST | `/params/read` | yes | body `{ key, globalIds }` (≤ 500) → `{ elements: [{ globalId, elementId, category, typeName, params: [{ id, name, group, kind, display, readOnly, why }] }] }` |
| POST | `/params/write` | yes | body `{ key, dryRun, changes: [{ globalId, paramId, name, oldDisplay, value }] }` (≤ 5000) → `{ dryRun, undoName, results: [{ index, ok, error, newDisplay }], warnings }` |

### Events

```
event: selection
data: {"key":"…","globalIds":["…"],"elementIds":[123]}

event: document
data: {"document":{"title":"…","key":"…","path":"…","isFamily":false}}   (null when none is open)
```

A comment line (`: ping`) every 15 s keeps the stream open. A selection that Shanku itself set is not
echoed back.

## Parameters (feature `params`, add-in 0.2.0)

Instance parameters only (type parameters change every instance and come later). `kind` is `text`,
`number` (shown and entered in the project's units: `"600"` in a millimetre project is 600 mm),
`integer`, `yesno` (`"Yes"`/`"No"`) or `element` (chosen in Revit; read-only here).

`/params/write` applies every change in **one Revit transaction** named `undoName`, so one Edit → Undo in
Revit takes it all back. Each change runs in its own sub-transaction, so one failure does not block the
others. A change is refused when:

- `oldDisplay` differs from the value in Revit now (it changed since Shanku read it);
- the parameter is read-only or chosen in Revit;
- the element is borrowed by someone else in a workshared model;
- Revit cannot read the value (for numbers, `SetValueString` in the project's units).

Revit warnings (duplicate marks and the like) are collected into `warnings` instead of dialogs.
`dryRun: true` runs the same checks and rolls everything back.

## Export

`POST /model/export` exports the active document as **IFC4 Reference View** with base quantities, Revit
and IFC common property sets, inside a transaction that is rolled back, so the Revit model is never
changed. Big models take a while; Shanku waits up to 10 minutes and shows progress.

## Threading

The HTTP server runs on a background thread. Everything that touches the Revit API is queued to Revit's
main thread through one `ExternalEvent`, and answered when Revit is idle (a modal dialog in Revit delays
it).

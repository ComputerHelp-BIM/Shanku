# Architecture

Shanku is a monorepo of small parts with one direction of dependency. Each part can be read, tested and
replaced on its own.

```
packages/tokens    design tokens (colours, type, spacing)          depends on nothing
packages/brand     logo and icons (icons.json)                     depends on nothing
packages/ui        design system: React components                 tokens, brand
packages/engine    IFC reading, 3D and 2D viewers, QA, BOQ, levels, measuring, merging, the DXF → 3D pipeline
                   (Python, run in Pyodide)                         no other Shanku package, no React
apps/web           the app (React): features on top of the engine and the design system
apps/playground    the design system's own showcase                tokens, ui
api/               serverless routes (shared models)                its own storage interface
bridge/revit       Shanku Bridge for Revit (C#): Core (no Revit API, unit-tested) + Revit (the API calls)
tools/             the mock Revit bridge, refactoring tools
```

Rules: a lower layer never imports a higher one; packages are used through their public entry points
(`@shanku/engine`, `@shanku/engine/worker`, `@shanku/engine/pyodide`, `@shanku/ui`); the Revit add-in talks
to Shanku only through the bridge protocol (`docs/bridge/protocol.md`).

## The web app

```
apps/web/src/
  App.tsx            composition: the app's shared state, one call per feature, and the screen layout
  app/constants.ts   app-wide constants (version, visual styles, ribbon tabs)
  features/          one folder per feature: a hook holding its state, effects and actions
    revit/           useRevitLink — connect, load, selection sync, parameters, QA fixes, live updates,
                     Export to Revit, editing (Changes for Revit), Download IFC
    views/           useViewsFeature — views, Project Browser, graphics, colours, view templates, sections
    commands/        useAppCommands — the command list (search, menus, "What now?")
                     useCommandDispatch — the keyboard's two-letter commands and shortcuts
    dimensions/      useDimensionsFeature — dimensions and QA findings in the model
    viewLinks/       useViewLinks — view links, shared models
    files/           useFileOpening — opening files and samples
    pipeline/        usePipelineFeature — DXF → 3D
    selection/       usePasteMarks — selecting by pasted marks
    progress/        useAppProgress — the progress display's tasks
    project/         useProjectFile — Save / Save As / opening projects (.shk), the title bar's status
  components/        UI pieces (windows, panels, dialogs), no app state of their own
  lib/               plain logic, unit-tested (paramEdits, liveUpdate, exportPlan, editChecks, sharedModel…)
```

**A feature hook** takes what it needs from the app as one typed object (`XDeps`) and returns what the
app and other features use. Values the app declares after the hook, which only callbacks and effects read,
come through a ref (`XLate`, assigned just before the layout), so they are read at the same moment as
before the split. Logic that needs no React goes in `lib/` with its tests; screens go in `components/`.

**Adding a feature:** a folder under `features/`, its hook, one call in `App.tsx`, its commands in
`useAppCommands`, its tests next to its `lib/` logic.

## Checks

`npm run typecheck` (every package, the web app, `api/`), `npm run lint:css` (tokens only), `npm test`,
`npm run build`; the add-in: `dotnet build` and `dotnet test` in `bridge/revit`. CI runs them from a clean
clone, which is how releases are checked.

## Refactoring tools

`tools/refactor/extract-feature.mjs` moves statements of `App()` into a feature hook, using the TypeScript
checker to find the hook's inputs (typed) and outputs; `tools/refactor/prune-imports.mjs` removes imports
left unused. The 0.49.2 split of `App.tsx` (3,240 lines → 1,226, of which 194 are logic) was made with them,
each step type-checked, and checked against the previous build in the browser.

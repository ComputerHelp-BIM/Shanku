import { STYLES } from '../../app/constants';
import { type ElementHit } from '../../components/CommandPalette';
import { type MenuItem, item, sep } from '../../components/ContextMenu';
import { type Intent } from '../../components/WhatNow';
import { COLOR_MODES } from '../../lib/colorBy';
import { type AppCommand, sequenceKeys } from '../../lib/commands';
import { fmtCount } from '../../lib/format';
import { type changeCount } from '../../lib/liveUpdate';
import { changeKey } from '../../lib/paramEdits';
import { SAMPLES } from '../../lib/samples';
import { createSequenceReader, type CommandId } from '../../lib/shortcuts';
import { type useDrawings } from '../../lib/useDrawings';
import { useDrawingTools } from '../../lib/useDrawingTools';
import { type useHistory } from '../../lib/useHistory';
import { type usePipeline } from '../../lib/usePipeline';
import { type useShankuModel } from '../../lib/useShankuModel';
import { isTwoD, KIND_LABEL } from '../../lib/views';
import { type Category, CATEGORY_PLURAL, EXPLODE_MODES, DIMENSION_TOOLS, MEASURE_MODES, type ExplodeMode } from '@shanku/engine';
import { useShortcut, isEditableTarget } from '@shanku/ui';
import { useRef, useEffect, useCallback } from 'react';

export interface AppCommandsDeps {
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  activeDoc: import('../../lib/useDrawings').DrawingDoc | null;
  activeModelView: import('../../lib/views').ModelView | null;
  autoUpdate: boolean;
  bridge: import('../../lib/revitBridge').RevitBridge;
  canExport: boolean;
  canLive: boolean;
  canParams: boolean;
  cancelSection: () => void;
  canvasTheme: "follow" | "paper" | "ink";
  colorSettings: import('../../lib/colorBy').ColorSettings;
  copyViewLink: () => Promise<void>;
  cycle: () => void;
  cycleCanvasTheme: () => void;
  dimTool: import('../../../../../packages/engine/src/render/dimensions').DimensionKind | null;
  displayStyle: import('../../../../../packages/engine/src/render/Viewer').DisplayStyle;
  dock: React.RefObject<import('../../components/DockWorkspace').DockWorkspaceHandle>;
  downloadIfc: () => Promise<void>;
  drawingView: React.RefObject<import('../../components/DrawingView').DrawingViewHandle>;
  duplicateModelView: (id: string) => void;
  dx: ReturnType<typeof useDrawings>;
  edges: boolean;
  editWhy: string | null;
  explode: { modes: import('../../../../../packages/engine/src/render/explode').ExplodeMode[]; amount: number; } | null;
  exportToRevit: () => Promise<void>;
  exportWhy: string;
  fullscreen: boolean;
  getSelectionFromRevit: () => Promise<void>;
  hidden: number[];
  history: ReturnType<typeof useHistory>;
  lastCommand: { id: import('../../lib/shortcuts').CommandId; label: string; } | null;
  liveBusy: boolean;
  liveCount: ReturnType<typeof changeCount>;
  loadFromRevit: () => Promise<void>;
  m: ReturnType<typeof useShankuModel>;
  measure: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null;
  notice: string | null;
  openDxfFromDisk: () => Promise<void>;
  openFromDisk: () => Promise<void>;
  openGeom: (mode: "move" | "rotate") => void;
  openGuide: (section?: string | undefined) => void;
  openPanels: import('../../components/DockWorkspace').PanelId[];
  openRevit: () => void;
  openSample: (sample?: import('../../lib/samples').SampleBuilding) => Promise<void>;
  openView: (id: string) => void;
  pending: import('../../lib/paramEdits').PendingChange[];
  pipe: import('../../components/PipelinePanel').PipelineState | null;
  pipeline: ReturnType<typeof usePipeline>;
  preference: import('../../../../../packages/ui/src/hooks/theme').ThemePreference;
  prevSelection: React.MutableRefObject<number[]>;
  reveal: boolean;
  revit: import('../../lib/revitBridge').BridgeState;
  revitLoading: boolean;
  revitProps: { status: string; groups: never[]; header?: undefined; onEditType?: undefined; apply?: undefined; pending?: undefined; } | { header: { family: string; typeName: string; category: string; count: number; types: import('../../lib/paramEdits').TypeChoice[] | undefined; typeId: number | null; typeModified: boolean; onChangeType: ((t: import('../../lib/paramEdits').TypeChoice) => void) | undefined; }; onEditType: (() => void) | null; apply: { count: number; busy: boolean; disabled: boolean; onApply: () => undefined; onReview: () => void; }; pending: number; status: string | undefined; groups: { group: string; rows: { key: string; label: string; value: string | null; unit: string | undefined; varies: boolean; modified: boolean; readOnly: boolean; hint: string | undefined; kind: "text" | "yesno"; onCommit: ((v: string) => void) | undefined; }[]; }[]; } | undefined;
  revitSync: boolean;
  run: (id: import('../../lib/shortcuts').CommandId, label: string) => void;
  runChanges: (keys: string[], dryRun: boolean) => Promise<void>;
  runCommand: (cmd: import('../../lib/shortcuts').CommandId) => void;
  search: React.RefObject<HTMLInputElement>;
  sectionBox: boolean;
  sectionTool: boolean;
  sendSelectionToRevit: () => Promise<void>;
  setAutoUpdate: React.Dispatch<React.SetStateAction<boolean>>;
  setBrowserFocus: React.Dispatch<React.SetStateAction<string | undefined>>;
  setColorMode: (mode: import('../../lib/colorBy').ColorMode) => void;
  setDimTool: (next: import('../../../../../packages/engine/src/render/dimensions').DimensionKind | null) => void;
  setDisplayStyle: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/Viewer').DisplayStyle>>;
  setEdges: React.Dispatch<React.SetStateAction<boolean>>;
  setElemVgOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExplode: React.Dispatch<React.SetStateAction<{ modes: import('../../../../../packages/engine/src/render/explode').ExplodeMode[]; amount: number; } | null>>;
  setFiltersOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setGradeDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setLinkDialog: React.Dispatch<React.SetStateAction<{ mode: "copy" | "open"; link: string; } | null>>;
  setMarkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setMarksDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setMeasure: (next: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | ((cur: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) => import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) | null) => void;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setRevitSync: React.Dispatch<React.SetStateAction<boolean>>;
  setShadows: (next: boolean | ((v: boolean) => boolean)) => void;
  setVgOpen: React.Dispatch<React.SetStateAction<{ focus?: string | undefined; } | null>>;
  setViews: React.Dispatch<React.SetStateAction<import('../../lib/views').ModelView[]>>;
  setVtOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shadows: boolean;
  startSection: () => void;
  toggleFullscreen: () => void;
  toggleWin: (k: "keys" | "boq" | "pipeline" | "guide" | "revit" | "changes" | "typeProps" | "exportRevit" | "editGeom", v?: boolean | undefined) => void;
  updateFromRevit: () => Promise<void>;
  viewHidden: number[];
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  views: import('../../lib/views').ModelView[];
  viewsRef: React.MutableRefObject<import('../../lib/views').ModelView[]>;
  wins: { boq: boolean; pipeline: boolean; keys: boolean; guide: boolean; revit: boolean; changes: boolean; typeProps: boolean; exportRevit: boolean; editGeom: boolean; };
}

export function useAppCommands(deps: AppCommandsDeps) {
  const { saveProject, saveProjectAs, activeDoc, activeModelView, autoUpdate, bridge, canExport, canLive, canParams, cancelSection, canvasTheme, colorSettings, copyViewLink, cycle, cycleCanvasTheme, dimTool, displayStyle, dock, downloadIfc, drawingView, duplicateModelView, dx, edges, editWhy, explode, exportToRevit, exportWhy, fullscreen, getSelectionFromRevit, hidden, history, lastCommand, liveBusy, liveCount, loadFromRevit, m, measure, notice, openDxfFromDisk, openFromDisk, openGeom, openGuide, openPanels, openRevit, openSample, openView, pending, pipe, pipeline, preference, prevSelection, reveal, revit, revitLoading, revitProps, revitSync, run, runChanges, runCommand, search, sectionBox, sectionTool, sendSelectionToRevit, setAutoUpdate, setBrowserFocus, setColorMode, setDimTool, setDisplayStyle, setEdges, setElemVgOpen, setExplode, setFiltersOpen, setGradeDialog, setLinkDialog, setMarkDialog, setMarksDialog, setMeasure, setNotice, setRevitSync, setShadows, setVgOpen, setViews, setVtOpen, shadows, startSection, toggleFullscreen, toggleWin, updateFromRevit, viewHidden, viewport, views, viewsRef, wins } = deps;

  // ---- "What now?" (Structura item 7) ----
  /** A task picked before a model was open: run once the sample has loaded. */
  const pendingIntent = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!m.model || !pendingIntent.current) return;
    const run = pendingIntent.current;
    pendingIntent.current = null;
    setTimeout(run, 400);
  }, [m.model]);
  const withModel = (run: () => void) => () => {
    if (m.model) return run();
    pendingIntent.current = run;
    void openSample();
  };
  const intents: Intent[] = [
    { id: 'open', title: 'Open a model', detail: 'Choose an IFC file; it opens on this device and is never uploaded.', run: () => void openFromDisk() },
    { id: 'qa', title: 'Check it for problems', detail: 'Duplicates, floating columns, missing marks and more, each with Select and Isolate.', needsModel: true, run: withModel(() => dock.current?.open('qa')) },
    { id: 'boq', title: 'Get quantities and cost', detail: 'Concrete by level, category and grade; rates; steel estimate; Excel export.', needsModel: true, run: withModel(() => toggleWin('boq', true)) },
    { id: 'plan', title: 'Look at one floor', detail: 'Open a structural plan of a level.', needsModel: true, run: withModel(() => { const v = viewsRef.current.find((x) => x.kind === 'plan'); if (v) openView(v.id); }) },
    { id: 'find', title: 'Find an element', detail: 'Type a mark, Element ID or GlobalId in the search (Ctrl + K).', needsModel: true, run: withModel(() => search.current?.focus({ preventScroll: true })) },
    { id: 'share', title: 'Share this view', detail: 'Copy a link that opens this camera, selection and isolation, for someone with the same file or, shared with the model, for anyone.', needsModel: true, run: withModel(() => void copyViewLink()) },
    { id: 'dxf', title: 'Open a DXF drawing', detail: 'See it like AutoCAD, or build a 3D model from it (DXF → 3D).', run: () => void openDxfFromDisk() },
    { id: 'learn', title: 'Learn the basics', detail: 'The Guide: moving around, selecting, views, quantities (F1).', run: () => openGuide() },
  ];

  /** Right-click menu in the 3D view: Revit's layout, with element entries when something is selected. */
  const contextItems = (): MenuItem[] => {
    const model = m.model!;
    const v = viewport.current;
    const has = sel.length > 0;
    const first = has ? model.elements[sel[0]] : null;
    const sameType = (e: (typeof model.elements)[number]) => !!first && e.category === first.category && e.typeName === first.typeName;
    const elementItems: MenuItem[] = has
      ? [
          item('Hide in View', undefined, {
            submenu: [item('Elements', () => run('hideElement', 'Hide Elements'), { hint: 'HH' }), item('Category', () => run('hideCategory', 'Hide Category'), { hint: 'HC' })],
          }),
          item('Override Graphics in View', undefined, {
            submenu: [item('By Element…', () => setElemVgOpen(true)), item('By Category…', () => setVgOpen({ focus: first?.category }))],
          }),
          sep,
          item('Create Similar', undefined, { disabled: true }),
          item('Edit Family', undefined, { disabled: true }),
          item('Select Previous', () => m.setSelection(prevSelection.current), { disabled: !prevSelection.current.length }),
          item('Select All Instances', undefined, {
            submenu: [
              item('Visible in View', () => m.setSelection(model.elements.filter((e) => sameType(e) && !hidden.includes(e.index)).map((e) => e.index))),
              item('In Entire Project', () => m.setSelection(model.elements.filter(sameType).map((e) => e.index))),
            ],
          }),
          item('Delete', undefined, { disabled: true }),
          sep,
        ]
      : [item('Select Previous', () => m.setSelection(prevSelection.current), { disabled: !prevSelection.current.length }), sep];
    return [
      item('Cancel', () => undefined),
      sep,
      item(lastCommand ? `Repeat [${lastCommand.label}]` : 'Repeat Last Command', () => lastCommand && runCommand(lastCommand.id), { disabled: !lastCommand }),
      sep,
      ...elementItems,
      item('Find in Project Browser', () => {
        if (!first) return;
        dock.current?.open('browser');
        setBrowserFocus(`category:${first.category}`);
      }, { disabled: !has }),
      sep,
      item('Zoom In Region', () => run('zoomRegion', 'Zoom In Region'), { hint: 'ZR' }),
      item('Zoom Out (2x)', () => v?.zoomOut2x()),
      item('Zoom To Fit', () => run('fit', 'Zoom To Fit'), { hint: 'ZF' }),
      sep,
      item('Previous Pan/Zoom', () => run('previous', 'Previous Pan/Zoom'), { disabled: !v?.canPrevious(), hint: 'ZP' }),
      item('Next Pan/Zoom', () => v?.nextView(), { disabled: !v?.canNext() }),
      sep,
      item('Copy View Link', () => void copyViewLink()),
      sep,
      item('Browsers', undefined, {
        submenu: [item('Project Browser', () => dock.current?.toggle('browser'), { checked: openPanels.includes('browser') })],
      }),
      item('Properties', () => dock.current?.toggle('properties'), { checked: openPanels.includes('properties') }),
    ];
  };

  const undo = useCallback(() => {
    const done = history.undo();
    setNotice(done.length ? `Undid: ${done[0]}` : 'Nothing to undo.');
  }, [history]);
  const redo = useCallback(() => {
    const done = history.redo();
    setNotice(done.length ? `Redid: ${done[0]}` : 'Nothing to redo.');
  }, [history]);
  useShortcut({ code: 'KeyZ', ctrl: true }, undo);
  useShortcut({ code: 'KeyY', ctrl: true }, redo);
  useShortcut({ code: 'KeyZ', ctrl: true, shift: true }, redo);
  useShortcut({ code: 'Home' }, () => (activeDoc ? drawingView.current?.fit() : viewport.current?.home()));
  // The AutoCAD layer of the 2D view: grid, crosshair, isolation, right-click menus, Quick Select, Find.
  const dxt = useDrawingTools({
    doc: activeDoc,
    view: drawingView,
    select: dx.select,
    update: dx.update,
    history,
    undo,
    redo,
    notify: setNotice,
    log: (t) => m.log(t),
    panelOpen: (id) => openPanels.includes(id),
    togglePanel: (id) => dock.current?.toggle(id),
  });
  const dxtRef = useRef<typeof dxt | null>(null);
  dxtRef.current = dxt;
  useShortcut({ code: 'F7' }, () => dxt.act('grid'), { enabled: !!activeDoc });
  const commandRef = useRef(runCommand);
  commandRef.current = runCommand;
  useEffect(() => {
    const read = createSequenceReader();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isEditableTarget(e.target)) return;
      if (!/^Key[A-Z]$/.test(e.code)) return;
      const cmd = read(e.code.slice(3), performance.now());
      if (cmd) {
        e.preventDefault();
        commandRef.current(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  /** The search finds elements by mark, Element ID, GlobalId or name (then selects and zooms). */
  const findElement = (q: string): ElementHit | null => {
    const model = m.model;
    const hit = model ? m.find(q) : null;
    if (hit === null || !model) return null;
    const e = model.elements[hit];
    return {
      label: `${e.category === 'Other' ? e.ifcClass : e.category} ${e.mark || e.name || e.expressId}`,
      detail: e.level || 'Element',
      run: () => {
        m.setSelection([hit]);
        viewport.current?.fit([hit]);
      },
    };
  };

  const selectCategory = (c: Category) => m.selectWhere((cat) => cat === c);
  const selectLevel = (l: string) => m.selectWhere((_, level) => level === l);

  /**
   * Every action as a command (lib/commands.ts): the palette lists these, each with its current state.
   * Built on demand so enabled/checked always match the model, selection and active view.
   */
  const getCommands = (): AppCommand[] => {
    const model = m.model;
    const hasModel = !!model;
    const hasSel = m.selection.length > 0;
    const in3d = hasModel && !activeDoc && !isTwoD(activeModelView ?? undefined);
    const needModel = hasModel ? undefined : 'open a model first';
    const needSel = !hasModel ? 'open a model first' : hasSel ? undefined : 'select elements first';
    const need3d = !hasModel ? 'open a model first' : in3d ? undefined : 'works in 3D views';
    const legacy = (id: CommandId, title: string, group: AppCommand['group'], why: string | undefined, extra: Partial<AppCommand> = {}): AppCommand => ({
      id: `${group.toLowerCase()}.${id}`,
      title,
      group,
      keys: sequenceKeys(id),
      enabled: why === undefined,
      why,
      run: () => run(id, title),
      ...extra,
    });
    const list: AppCommand[] = [
      // File
      { id: 'file.openIfc', title: 'Open IFC model', group: 'File', keywords: 'load import revit', run: () => void openFromDisk() },
      { id: 'file.openDxf', title: 'Open DXF drawing', group: 'File', keywords: 'cad 2d autocad', run: () => void openDxfFromDisk() },
      { id: 'file.saveProject', title: 'Save project', group: 'File', keys: 'Ctrl + S', keywords: 'save project file shk keep store', enabled: !!m.model, why: 'open a model first', run: () => void saveProject() },
      { id: 'file.saveProjectAs', title: 'Save project as…', group: 'File', keys: 'Ctrl + Shift + S', keywords: 'save as copy project file shk', enabled: !!m.model, why: 'open a model first', run: () => void saveProjectAs() },
      { id: 'file.downloadIfc', title: 'Download IFC', group: 'File', keywords: 'save export ifc file revit', run: () => void downloadIfc() },
      { id: 'file.dxfTo3d', title: 'DXF → 3D: build an IFC model from a drawing', group: 'File', keywords: 'pipeline convert computer help', run: () => (pipe ? toggleWin('pipeline', true) : void pipeline.start()) },
      { id: 'file.sample', title: 'Open the sample model', group: 'File', keywords: 'demo example frame', run: () => void openSample() },
      ...SAMPLES.slice(1).map((smp) => ({ id: `file.sample.${smp.id}`, title: `Open sample: ${smp.title}`, group: 'File' as const, keywords: `demo example large tower ${smp.detail}`, run: () => void openSample(smp) })),
      // Edit
      { id: 'edit.undo', title: history.canUndo ? `Undo ${history.undoList[0] ?? ''}`.trim() : 'Undo', group: 'Edit', keys: 'Ctrl + Z', enabled: history.canUndo, why: history.canUndo ? undefined : 'nothing to undo', run: undo },
      { id: 'edit.redo', title: history.canRedo ? `Redo ${history.redoList[0] ?? ''}`.trim() : 'Redo', group: 'Edit', keys: 'Ctrl + Y', enabled: history.canRedo, why: history.canRedo ? undefined : 'nothing to redo', run: redo },
      // Select
      { id: 'select.clear', title: 'Clear selection', group: 'Select', keys: 'Esc', enabled: hasSel, why: hasSel ? undefined : 'nothing selected', run: () => m.setSelection([]) },
      { id: 'select.previous', title: 'Select previous', group: 'Select', enabled: prevSelection.current.length > 0, why: prevSelection.current.length ? undefined : 'no earlier selection', run: () => m.setSelection(prevSelection.current) },
      {
        id: 'select.visible',
        title: 'Select everything visible',
        group: 'Select',
        keywords: 'all',
        enabled: hasModel,
        why: needModel,
        run: () => {
          const off = new Set(viewHidden);
          m.setSelection((model?.elements ?? []).filter((e) => !off.has(e.index)).map((e) => e.index));
        },
      },
      ...(model ? [...new Set(model.elements.map((e) => e.category))].map((c) => ({ id: `select.category.${c}`, title: `Select all ${CATEGORY_PLURAL[c].toLowerCase()}`, group: 'Select' as const, keywords: `category ${c}`, run: () => selectCategory(c) })) : []),
      ...(model ? model.info.levels.map((l) => ({ id: `select.level.${l.name}`, title: `Select everything on ${l.name}`, group: 'Select' as const, keywords: 'level storey floor', run: () => selectLevel(l.name) })) : []),
      { id: 'select.byId', title: 'Find element by mark, Element ID or GlobalId', group: 'Select', keys: 'Ctrl + K', keywords: 'search find id', run: () => search.current?.focus({ preventScroll: true }) },
      // Visibility
      legacy('isolateElement', 'Isolate elements', 'Visibility', needSel, { keywords: 'temporary hide isolate' }),
      legacy('isolateCategory', 'Isolate category', 'Visibility', needSel),
      legacy('hideElement', 'Hide elements', 'Visibility', needSel, { keywords: 'temporary' }),
      legacy('hideCategory', 'Hide category', 'Visibility', needSel),
      legacy('resetHidden', 'Reset temporary hide/isolate', 'Visibility', hasModel ? (hidden.length ? undefined : 'nothing is temporarily hidden') : 'open a model first', { keywords: 'show all unhide' }),
      legacy('revealHidden', 'Reveal hidden elements', 'Visibility', needModel, { checked: reveal }),
      legacy('unhideElement', 'Unhide elements', 'Visibility', !reveal ? 'turn on Reveal hidden elements first' : needSel),
      legacy('visibilityGraphics', 'Visibility/Graphics…', 'Visibility', needModel, { keywords: 'vg vv category colour color transparency halftone overrides' }),
      { id: 'visibility.filters', title: 'Filters…', group: 'Visibility', keywords: 'rules view filter', enabled: hasModel, why: needModel, run: () => setFiltersOpen(true) },
      { id: 'visibility.elementGraphics', title: 'Override graphics of the selection…', group: 'Visibility', keywords: 'element colour color halftone transparency', enabled: hasSel, why: needSel, run: () => setElemVgOpen(true) },
      // View
      legacy('fit', 'Zoom to fit', 'View', hasModel || activeDoc ? undefined : 'open a model first'),
      legacy('previous', 'Previous pan/zoom', 'View', needModel),
      legacy('zoomRegion', 'Zoom in region', 'View', needModel),
      { id: 'view.zoomOut', title: 'Zoom out (2x)', group: 'View', enabled: hasModel, why: needModel, run: () => viewport.current?.zoomOut2x() },
      { id: 'view.home', title: 'Default 3D view', group: 'View', keys: 'Home', enabled: hasModel, why: needModel, run: () => viewport.current?.home() },
      legacy('sectionBox', sectionBox ? 'Remove section box' : 'Section box around the selection', 'View', !hasModel ? 'open a model first' : sectionBox ? undefined : in3d ? needSel : 'works in 3D views', { checked: sectionBox }),
      ...STYLES.filter((st) => st.id !== 'realistic').map((st) =>
        legacy(({ shaded: 'shaded', consistent: 'consistent', hiddenLine: 'hiddenLine', wireframe: 'wireframe' } as const)[st.id as 'shaded' | 'consistent' | 'hiddenLine' | 'wireframe'], `Visual style: ${st.label}`, 'View', needModel, { checked: displayStyle === st.id }),
      ),
      { id: 'view.edges', title: 'Show edges', group: 'View', checked: edges, enabled: hasModel, why: needModel, run: () => setEdges((v) => !v) },
      {
        id: 'view.hiddenLines',
        title: 'Show hidden lines (this view)',
        group: 'View',
        checked: !!activeModelView?.hiddenLines,
        enabled: !!activeModelView,
        why: activeModelView ? undefined : 'open a model first',
        run: () => activeModelView && setViews((vs) => vs.map((x) => (x.id === activeModelView.id ? { ...x, hiddenLines: !x.hiddenLines } : x))),
      },
      { id: 'view.canvasTheme', title: `Canvas theme: ${{ follow: 'Auto', paper: 'Light', ink: 'Dark' }[canvasTheme]} (change)`, group: 'View', keywords: 'background dark light', run: cycleCanvasTheme },
      { id: 'view.interfaceTheme', title: `Interface theme: ${{ system: 'Auto', paper: 'Light', ink: 'Dark' }[preference]} (change)`, group: 'View', keywords: 'dark light paper ink mode', run: cycle },
      { id: 'view.fullscreen', title: fullscreen ? 'Exit full screen' : 'Full screen', group: 'View', keys: 'F11', run: toggleFullscreen },
      // Explode
      ...EXPLODE_MODES.map((md) => ({
        id: `explode.${md.id}`,
        title: `Explode: ${md.label.toLowerCase()}`,
        group: 'Explode' as const,
        keywords: `${md.hint} exploded apart spread`,
        checked: !!explode?.modes.includes(md.id),
        enabled: in3d,
        why: need3d,
        run: () => toggleExplode(md.id),
      })),
      { id: 'explode.collapse', title: 'Collapse exploded view', group: 'Explode', keywords: 'assemble reset', enabled: !!explode, why: explode ? undefined : 'nothing is exploded', run: () => setExplode(null) },
      // Views
      { id: 'views.open3d', title: 'Open {3D}', group: 'Views', keywords: '3d view', enabled: hasModel, why: needModel, run: () => openView('3d') },
      ...views.filter((v) => v.id !== '3d').map((v) => ({ id: `views.open.${v.id}`, title: `Open ${KIND_LABEL[v.kind].toLowerCase()}: ${v.name}`, group: 'Views' as const, keywords: 'view plan elevation section', run: () => openView(v.id) })),
      { id: 'views.duplicate', title: 'Duplicate this view', group: 'Views', enabled: !!activeModelView, why: activeModelView ? undefined : 'open a model first', run: () => activeModelView && duplicateModelView(activeModelView.id) },
      { id: 'views.section', title: 'Create a section', group: 'Views', keywords: 'cut', enabled: hasModel && isTwoD(activeModelView ?? undefined), why: !hasModel ? 'open a model first' : isTwoD(activeModelView ?? undefined) ? undefined : 'draw it in a plan, elevation or section', run: () => startSection() },
      ...COLOR_MODES.map((cm) => ({
        id: `colour.${cm.id}`,
        title: cm.id === 'none' ? 'Colour by: none (normal colours)' : `Colour by ${cm.label.toLowerCase()}`,
        group: 'View' as const,
        keywords: `colour color palette legend ${cm.tip}`,
        checked: colorSettings.mode === cm.id,
        enabled: hasModel,
        why: needModel,
        run: () => setColorMode(cm.id),
      })),
      ...DIMENSION_TOOLS.map((t) => ({
        id: `annotate.${t.id}`,
        title: `${t.label}${t.id.startsWith('spot') ? '' : ' dimension'}`,
        group: 'View' as const,
        keys: t.keys,
        keywords: `dimension annotate revit ${t.tip}`,
        checked: dimTool === t.id,
        enabled: hasModel && !activeDoc,
        why: activeDoc ? 'Dimensions work in 3D views, plans, sections and elevations.' : needModel,
        run: () => {
          if (sectionTool) cancelSection();
          setDimTool(t.id);
        },
      })),
      ...MEASURE_MODES.map((mm) => ({
        id: `measure.${mm.id}`,
        title: `Measure: ${mm.label}`,
        group: 'View' as const,
        keywords: `measure dimension distance tape ${mm.tip}`,
        checked: measure === mm.id,
        enabled: hasModel && !activeDoc,
        why: activeDoc ? 'Measure works in 3D views, plans, sections and elevations; the DXF view gets it next.' : needModel,
        run: () => {
          if (sectionTool) cancelSection();
          setMeasure(mm.id);
        },
      })),
      { id: 'view.shadows', title: 'Shadows', group: 'View', keywords: 'sun shadow render realistic presentation', checked: shadows, enabled: hasModel, why: needModel, run: () => setShadows((v) => !v) },
      { id: 'view.realistic', title: 'Visual style: Realistic', group: 'View', keywords: 'render sun sky concrete presentation', checked: displayStyle === 'realistic', enabled: hasModel, why: needModel, run: () => setDisplayStyle('realistic') },
      { id: 'select.byMarks', title: 'Select by marks…', group: 'Select', keywords: 'paste whatsapp list marks c1 b12 find', enabled: hasModel, why: needModel, run: () => setMarksDialog(true) },
      { id: 'views.copyLink', title: 'Copy view link', group: 'Views', keywords: 'share url whatsapp email send link token upload model encrypted', enabled: hasModel, why: needModel, run: () => void copyViewLink() },
      { id: 'views.openLink', title: 'Open a view link…', group: 'Views', keywords: 'share url paste token', enabled: hasModel, why: needModel, run: () => setLinkDialog({ mode: 'open', link: '' }) },
      { id: 'help.whatNow', title: 'What now? Common tasks', group: 'Help', keywords: 'start begin tasks help', run: () => document.querySelector<HTMLButtonElement>('.app-whatnow__button')?.click() },
      { id: 'views.templates', title: 'View templates…', group: 'Views', keywords: 'template apply', enabled: hasModel, why: needModel, run: () => setVtOpen(true) },
      // Windows
      ...(
        [
          ['properties', 'Properties'],
          ['browser', 'Project Browser'],
          ['activity', 'Activity'],
          ['console', 'Python console'],
          ['qa', 'QA checks'],
          ['colour', 'Colour panel'],
        ] as const
      ).map(([id, title]) => ({ id: `window.${id}`, title: `Show ${title}`, keywords: id === 'qa' ? 'check warnings errors health duplicate floating column mark' : undefined, group: 'Windows' as const, checked: openPanels.includes(id), keys: id === 'console' ? 'Ctrl + `' : undefined, run: () => dock.current?.toggle(id) })),
      { id: 'bridge.connect', title: 'Connect to Revit…', group: 'File', keywords: 'bridge revit link pair add-in live', checked: revit.phase === 'connected', run: () => openRevit() },
      { id: 'bridge.load', title: 'Load model from Revit', group: 'File', keywords: 'bridge revit import open live', enabled: revit.phase === 'connected' && !!revit.document && !revitLoading, why: revit.phase !== 'connected' ? 'connect to Revit first' : !revit.document ? 'open a model in Revit' : 'loading…', run: () => void loadFromRevit() },
      { id: 'bridge.sendSelection', title: 'Send selection to Revit', group: 'Select', keywords: 'bridge revit push select', enabled: revit.phase === 'connected' && !!revit.document && hasModel, why: revit.phase !== 'connected' ? 'connect to Revit first' : 'open a model', run: () => void sendSelectionToRevit() },
      { id: 'bridge.getSelection', title: 'Get selection from Revit', group: 'Select', keywords: 'bridge revit pull select', enabled: revit.phase === 'connected' && !!revit.document && hasModel, why: revit.phase !== 'connected' ? 'connect to Revit first' : 'open a model', run: () => void getSelectionFromRevit() },
      { id: 'bridge.disconnect', title: 'Disconnect from Revit', group: 'File', keywords: 'bridge revit unpair', enabled: revit.phase === 'connected' || revit.phase === 'unpaired', why: 'not connected', run: () => bridge.disconnect() },
      { id: 'bridge.update', title: 'Update from Revit', group: 'File', keywords: 'bridge revit live sync refresh changed', enabled: canLive && liveCount > 0 && !liveBusy, why: !canLive ? 'load the model from Revit (add-in 0.5.0)' : 'nothing changed in Revit', run: () => void updateFromRevit() },
      { id: 'bridge.autoUpdate', title: 'Auto-update from Revit', group: 'File', keywords: 'bridge revit live sync', checked: autoUpdate, enabled: canLive, why: 'load the model from Revit (add-in 0.5.0)', run: () => setAutoUpdate((v) => !v) },
      { id: 'bridge.exportDxf', title: 'Export DXF to Revit', group: 'File', keywords: 'bridge revit create native pipeline dxf 3d families', enabled: canExport, why: exportWhy, run: () => void exportToRevit() },
      { id: 'bridge.move', title: 'Move…', group: 'Edit', keys: 'M V', keywords: 'bridge revit move shift displace translate geometry distance', enabled: !editWhy, why: editWhy ?? undefined, run: () => openGeom('move') },
      { id: 'bridge.rotate', title: 'Rotate…', group: 'Edit', keys: 'R O', keywords: 'bridge revit rotate turn angle geometry', enabled: !editWhy, why: editWhy ?? undefined, run: () => openGeom('rotate') },
      { id: 'bridge.editType', title: 'Edit type…', group: 'Edit', keywords: 'bridge revit type properties duplicate type parameters', enabled: !!revitProps?.onEditType, why: revitProps?.onEditType ? undefined : 'select elements of one type in a model loaded from Revit', run: () => revitProps?.onEditType?.() },
      { id: 'bridge.changes', title: 'Changes for Revit…', group: 'Edit', keywords: 'bridge revit parameters pending apply review', checked: wins.changes, run: () => toggleWin('changes') },
      { id: 'bridge.check', title: 'Check changes in Revit', group: 'Edit', keywords: 'bridge revit parameters dry run validate', enabled: pending.length > 0 && canParams, why: !pending.length ? 'no changes waiting' : 'connect to the Revit model first', run: () => void runChanges(pending.map(changeKey), true) },
      { id: 'bridge.syncSelection', title: 'Sync selection with Revit', group: 'Select', keywords: 'bridge revit link', checked: revitSync, run: () => setRevitSync((v) => !v) },
      { id: 'window.boq', title: 'Bill of quantities (BOQ)', group: 'Windows', keywords: 'quantities rates excel export', checked: wins.boq, enabled: hasModel, why: needModel, run: () => toggleWin('boq') },
      { id: 'window.reset', title: 'Reset window layout', group: 'Windows', keywords: 'panels dock', run: () => dock.current?.reset() },
      // Manage
      { id: 'manage.marks', title: 'Mark rules…', group: 'Manage', keywords: 'property mark', enabled: hasModel, why: needModel, run: () => setMarkDialog(true) },
      { id: 'manage.grades', title: 'Grade rules…', group: 'Manage', keywords: 'concrete grade property', enabled: hasModel, why: needModel, run: () => setGradeDialog(true) },
      // Help
      { id: 'help.guide', title: 'Guide & FAQ', group: 'Help', keys: 'F1', keywords: 'help manual documentation', run: () => openGuide() },
      { id: 'help.keys', title: 'Keyboard shortcuts', group: 'Help', keywords: 'keys hotkeys', run: () => openGuide('keys') },
      { id: 'help.whatsNew', title: "What's new", group: 'Help', keywords: 'release changelog version', run: () => openGuide('news') },
      // 2D drawings (AutoCAD)
      ...dxt.commands(),
    ];
    return list;
  };

  /** Exploding again in the same mode collapses it; another mode switches (from assembled). */
  const toggleExplode = (mode: ExplodeMode) => {
    if (!m.model) return;
    if (isTwoD(activeModelView ?? undefined) || activeDoc) return setNotice('Exploded views are for 3D views.');
    setExplode((cur) => {
      if (!cur) return { modes: [mode], amount: 0.6 };
      const modes = cur.modes.includes(mode) ? cur.modes.filter((x) => x !== mode) : [...cur.modes, mode];
      return modes.length ? { modes, amount: cur.amount > 0 ? cur.amount : 0.6 } : null; // last one off: collapse
    });
  };

  const info = m.model?.info;
  const sel = m.selection;
  const selLabel =
    !m.model || sel.length === 0
      ? 'Nothing selected'
      : sel.length === 1
        ? (() => {
            const e = m.model.elements[sel[0]];
            return `${e.category === 'Other' ? e.ifcClass : e.category} ${e.mark || e.name || e.expressId}`;
          })()
        : `${fmtCount(sel.length)} elements`;

  const load = m.load;

  return { contextItems, dxt, dxtRef, findElement, getCommands, info, intents, load, sel, selLabel, selectCategory, selectLevel, toggleExplode };
}

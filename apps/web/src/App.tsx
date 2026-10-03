import { useEffect, useRef, useState, useMemo } from 'react';
import {
  AppShell,
  Button,
  FloatingWindow,
  ThemeIcon,
  Icon,
  IconButton,
  LocalIndicator,
  Ribbon,
  RibbonButton,
  RibbonGroup,
  RibbonStack,
  RibbonTabs,
  StatusBar,
  StatusChip,
  TitleBar,
  ViewTabs, useTheme
} from '@cad2bim/ui';
import {
  CATEGORY_PLURAL,
  DEFAULT_GRADE_RULES,
  DEFAULT_MARK_RULES,
  ENGINE_VERSION,
  EXPLODE_MODES, type Category,
  type DisplayStyle, DIMENSION_TOOLS, type DimensionKind, type MeasureMode
} from '@cad2bim/engine';
import { Browser } from './components/Browser';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport, type ViewportHandle } from './components/Viewport';
import { fmtCount } from './lib/format';
import { fileFromDrop } from './lib/openFile';
import { DrawingView } from './components/DrawingView';
import { DrawingProperties, LayersPanel } from './components/DrawingPanels';
import { MarkRulesDialog } from './components/MarkRulesDialog';
import { BoqWindow } from './components/BoqWindow';
import { ConsolePanel } from './components/ConsolePanel';
import { PipelinePanel } from './components/PipelinePanel';
import { BuildProgress } from './components/BuildProgress';
import { editSection } from './lib/views';
import { DEFAULT_CUT, DEFAULT_DEPTH_OFFSET, KIND_LABEL, isTwoD, validRange, type ModelView } from './lib/views';
import { enterFullscreen } from './lib/fullscreen';
import { QuickAccess } from './components/QuickAccess';
import { StartPage } from './components/StartPage';
import { ContextMenu, item, sep } from './components/ContextMenu';
import { ElementGraphicsDialog, VisibilityGraphicsDialog } from './components/VisibilityGraphics';
import { FiltersManager } from './components/Filters';
import { ViewTemplatesDialog } from './components/ViewTemplates';
import { templateFromView } from './lib/viewTemplates';
import { EMPTY_GRAPHICS, countOverrides, type ViewGraphics } from './lib/visibility';
import { DockWorkspace } from './components/DockWorkspace';
import { useShankuModel } from './lib/useShankuModel';
import { SHORTCUT_HELP } from './lib/shortcuts';
import { CommandPalette } from './components/CommandPalette';
import { GuidePanel } from './components/GuidePanel';
import { RevitPanel } from './components/RevitPanel';
import { RevitChanges } from './components/RevitChanges';
import { EditGeometry } from './components/EditGeometry';
import { TypeProperties } from './components/TypeProperties';
import { ExportToRevit } from './components/ExportToRevit';
import {
  changeKey
} from './lib/paramEdits';
import { QaPanel } from './components/QaPanel';
import { ColorLegendOverlay, ColorPanel } from './components/ColorPanel';
import { FileDiagnosisDialog, ProposedMarksDialog, SelectMarksDialog, ViewLinkDialog } from './components/SmallDialogs';
import { WhatNow } from './components/WhatNow';
import { FindTextPanel, QuickProperties, QuickSelectPanel } from './components/DrawingTools';
import { formatPoint } from './lib/drawingTools';
import { deleteShare, myShares } from './lib/sharedModel';
import { APP_VERSION, RIBBON_TABS, STYLES } from './app/constants';
import { useAppProgress } from './features/progress/useAppProgress';
import { useAppCommands } from './features/commands/useAppCommands';
import { useViewLinks } from './features/viewLinks/useViewLinks';
import { usePasteMarks } from './features/selection/usePasteMarks';
import { useDimensionsFeature } from './features/dimensions/useDimensionsFeature';
import { useCommandDispatch, type CommandDispatchLate } from './features/commands/useCommandDispatch';
import { useFileOpening } from './features/files/useFileOpening';
import { usePipelineFeature } from './features/pipeline/usePipelineFeature';
import { useRevitLink, type RevitLinkLate } from './features/revit/useRevitLink';
import { useViewsFeature, type ViewsFeatureLate } from './features/views/useViewsFeature';
import { useProjectFile } from './features/project/useProjectFile';
import { isProjectFile } from './lib/project';
import { projectLabel } from './features/project/projectLabel';
import { useNativeEditing } from './features/editing/useNativeEditing';
import { ModifyTool } from './components/ModifyTool';
import type { ModifyKind } from './lib/editChecks';
import { LevelsTool } from './components/LevelsTool';
import { useDatums } from './features/datums/useDatums';
import { useProjectUnits } from './features/units/useProjectUnits';
import { ProjectUnits } from './components/ProjectUnits';
import { DatumsList } from './components/DatumsList';
import { datumMarksFor } from './lib/viewMarks';
import { useModifyTools } from './features/modify/useModifyTools';
import { VisualStyleMenu } from './components/VisualStyleMenu';
import { FileMenu, type FileMenuItem } from './components/FileMenu';
import { listRecent, openRecent, forgetRecent, type RecentFile } from './lib/recent';

/** What the homepage hands to the app when it opens it (a dropped file, or the sample). */
export interface AppStart {
  file?: { name: string; bytes: ArrayBuffer };
  sample?: boolean;
}

export function App({ start }: { start?: AppStart } = {}) {
  const { preference, cycle } = useTheme();
  const m = useShankuModel();
  const viewport = useRef<ViewportHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const [ribbonTab, setRibbonTab] = useState('model');
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  /**
   * The model as opened: live updates from Revit merge into it (revision > 0) and must not look like
   * a new file (restoring views, switching to 3D, re-applying a view's saved hides).
   */
  const openedInfoRef = useRef<import('@cad2bim/engine').ParsedModel['info'] | undefined>(undefined);
  if (!m.model?.revision) openedInfoRef.current = m.model?.info;
  const openedInfo = openedInfoRef.current;
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('shaded');
  const [sectionBox, setSectionBox] = useState(false);
  /** Measure tool mode (null: closed). 3D views, plans, sections and elevations. */
  const [measure, setMeasureState] = useState<MeasureMode | null>(null);
  /** Dimension tool (Annotate → Dimension), and the selected placed dimensions of the active view. */
  const [dimTool, setDimToolState] = useState<DimensionKind | null>(null);
  const [dimSel, setDimSel] = useState<string[]>([]);
  // One tool at a time: Measure and the Dimension tools close each other.
  const setMeasure = (next: MeasureMode | null | ((cur: MeasureMode | null) => MeasureMode | null)) =>
    setMeasureState((cur) => {
      const v = typeof next === 'function' ? next(cur) : next;
      if (v) setDimToolState(null);
      return v;
    });
  const setDimTool = (next: DimensionKind | null) => {
    if (next) setMeasureState(null);
    setDimToolState(next);
  };
  // Revit's File menu: opened from the File tab; the recent files are read each time it opens
  const [fileMenu, setFileMenu] = useState(false);
  const fileTab = useRef<HTMLButtonElement>(null);
  const [recent, setRecent] = useState<RecentFile[]>([]);
  useEffect(() => {
    if (fileMenu) void listRecent().then(setRecent);
  }, [fileMenu]);
  /** Revit's Shadows On/Off (view control bar), remembered on this device. */
  const [shadows, setShadowsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('shanku.shadows') === 'true';
    } catch {
      return false;
    }
  });
  const setShadows = (next: boolean | ((v: boolean) => boolean)) =>
    setShadowsState((v) => {
      const on = typeof next === 'function' ? next(v) : next;
      try {
        localStorage.setItem('shanku.shadows', String(on));
      } catch {
        /* storage unavailable: lasts for this visit */
      }
      return on;
    });
  const [edges, setEdges] = useState(true);
  // Canvas theme is separate from the interface theme (Revit's Canvas Theme).
  const [canvasTheme, setCanvasTheme] = useState<'follow' | 'paper' | 'ink'>(() => {
    const v = localStorage.getItem('shanku.canvasTheme');
    return v === 'paper' || v === 'ink' ? v : 'follow';
  });
  const cycleCanvasTheme = () =>
    setCanvasTheme((t) => {
      const next = t === 'follow' ? 'paper' : t === 'paper' ? 'ink' : 'follow';
      try {
        localStorage.setItem('shanku.canvasTheme', next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  const [hideMenu, setHideMenu] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Full screen toggle (title bar), kept in step with F11 / Esc exits.
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void enterFullscreen();
  };
  const [browserFocus, setBrowserFocus] = useState<string | undefined>(undefined);
  // Visibility/Graphics of the 3D view (per category, and per element via Override Graphics)
  const [graphics, setGraphics] = useState<ViewGraphics>(EMPTY_GRAPHICS);
  const graphicsRef = useRef(graphics);
  graphicsRef.current = graphics;
  const [vgOpen, setVgOpen] = useState<{ focus?: string } | null>(null);
  const [elemVgOpen, setElemVgOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const viewsFeatureLate = useRef({} as ViewsFeatureLate);
  const { gridOn, setGridOn, activeModelView, activeView, annSel, applyElementGraphics, applyFilterDefs, applyMode, applyTemplateToView, applyViewGraphics, applyViewTemplate, boxStore, camStore, cancelSection, closeView, colorResult, colorSettings, curSelection, deleteModelView, dimOrigin, dock, duplicateModelView, explode, geomMode, gradeDialog, graphicsFor, gripStart, guideSection, heights, hideStore, history, lastCommand, loadedView, markDialog, marks, myShareList, openGuide, openPanels, openView, openViews, prevSelection, renameView, reveal, sectionTool, setActiveView, setAnnSel, setColorMode, setColorSettings, setExplode, setGeomMode, setGradeDialog, setLastCommand, setMarkDialog, setMyShareList, setOpenPanels, setOpenViews, setRenameView, setReveal, setShareInfoState, setTemplates, setViewMenu, setViewRange, setViews, setVtFocus, setVtMenu, setVtOpen, setZoomRegion, shareInfoState, startSection, templates, toggleWin, viewHidden, viewMenu, viewOverrides, viewState, views, viewsRef, vtFocus, vtMenu, vtOpen, wins, zY, zoomRegion } = useViewsFeature({ displayStyle, edges, graphics, graphicsRef, hidden, m, openedInfo, sectionBox, setDimSel, setDimTool, setDisplayStyle, setEdges, setGraphics, setHidden, setMeasure, setNotice, setSectionBox, start, viewport, late: viewsFeatureLate });
  const revitLinkLate = useRef({} as RevitLinkLate);
  const { activeDoc, autoUpdate, boqSelect, bridge, canExport, canLive, canParams, changeRates, changeStatus, changeWarnings, changesBusy, commitTypeDraft, confirmMarks, createInRevit, cursor, diagnose, diagnosedFor, diagnosis, downloadIfc, drawingView, dx, editWhy, elementLabel, exportOff, exportState, exportToRevit, exportWhy, getSelectionFromRevit, ifcColor, lastApplied, lastFile, liveBusy, liveCount, loadFromRevit, markBusy, markProposal, openDrawing, openDxfFromDisk, openGeom, openModelFile, openRevit, paramsCache, paramsTick, pending, qaFix, rates, refreshChanges, revit, revitLink, revitLinked, revitLoading, revitProps, revitSync, runChanges, selectedGids, sendSelectionToRevit, setAutoUpdate, setCursor, setDiagnosis, setExportOff, setIfcColor, setMarkProposal, setPending, setRevitSync, showInRevit, snapshot, stageGeometry, updateFromRevit } = useRevitLink({ activeView, boxStore, camStore, dock, graphicsFor, hideStore, history, loadedView, m, openGuide, openedInfo, setActiveView, setDisplayStyle, setEdges, setExplode, setGeomMode, setGraphics, setHidden, setNotice, setOpenViews, setSectionBox, setViews, toggleWin, viewport, wins, late: revitLinkLate });
  const { pipe, pipeline, showQa } = usePipelineFeature({ drawingView, dx, m, setActiveView, setNotice, toggleWin });
  // the project file: Save (Ctrl + S), Save As, and opening projects alongside models
  const { projectStatus, saveProject, saveProjectAs, openAnyFile } = useProjectFile({ m, openModelFile, setNotice, changes: [views, graphics, pending, colorSettings] });
  // native editing: Revit's Modify tools on cad2bim's own model (docs/design/native-editing.md)
  // datum lines by id for Align locks (kept current below, once the datums are known)
  const datumLineRef = useRef<(id: string) => { a: [number, number]; b: [number, number]; name: string } | null>(() => null);
  const { alignTo, unlock, lockCount, constraintPrompt, levelList, moveLevel, newLevel, deleteLevel, levelDeleteWhy, levelTick, nativePerform, nativeDelete, nativePin, nativeWhy, nativeEditCount } = useNativeEditing({ m, history, setNotice, revitLinked, datumLineRef });
  const [levelsOpen, setLevelsOpen] = useState(false);
  // grids and reference planes, drawn with the shared point picker; Project Units
  const { datums, datumTool, datumPick, pickStatus, startDatumTool, endDatumTool, renameDatum, deleteDatum } = useDatums({ m, history, setNotice, activeModelView, heights });
  const { units, setProjectUnits } = useProjectUnits({ m });
  datumLineRef.current = (id) => {
    const d = datums.find((x) => x.id === id);
    return d ? { a: d.a, b: d.b, name: d.name || 'reference plane' } : null;
  };
  // Move, Copy and Align on the shared point picker
  const { modifyTool, modifyPick, modifyStatus, startMove, startAlign, setMoveOption, setAlignLock, endModifyTool } = useModifyTools({ m, setNotice, activeModelView, heights, datums, revitLinked, openGeom, nativePerform, alignTo });
  // Revit's Modify button: ends whatever tool is running and goes back to selecting
  const anyTool = !!modifyTool || !!datumTool || !!measure || !!dimTool;
  const endAllTools = () => {
    endModifyTool();
    endDatumTool();
    setMeasure(null);
    setDimTool(null);
  };  // Revit's File menu: its commands and their choices, each saying what it does
  const closeModel = () => {
    if (!m.model) return;
    const unsaved = projectStatus.dirty || (!projectStatus.linked && nativeEditCount > 0);
    if (unsaved && !window.confirm(`${m.model.info.fileName} has changes not saved to a project file. Close it anyway?\n\nYour edits stay on this device and come back when you open the same file.`)) return;
    m.close();
  };
  const openRecentFile = async (r: RecentFile) => {
    try {
      const file = await openRecent(r);
      if (r.kind === 'dxf') await openDrawing(file);
      else await openAnyFile(file);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setNotice(`${r.name} could not be opened again: ${why}`);
      if (/not found|could not be found|NotFoundError/i.test(why)) void forgetRecent(r);
    }
  };
  const fileItems: FileMenuItem[] = [
    {
      id: 'new', label: 'New', icon: 'new', heading: 'Creates a model.',
      choices: [{ label: 'Model from a CH drawing', description: 'Builds an IFC model from a CH-format DXF drawing (DXF → 3D).', icon: 'column', onClick: () => (pipe ? toggleWin('pipeline', true) : void pipeline.start()) }],
    },
    {
      id: 'open', label: 'Open', icon: 'open', heading: 'Opens models, projects and drawings.',
      choices: [
        { label: 'Model or project', description: 'An IFC model (.ifc, .ifc.gz) or a cad2bim project (.c2b; Shanku’s .shkp too). Ctrl + O', icon: 'ifc', onClick: () => void openFromDisk() },
        { label: 'DXF drawing', description: 'A drawing in a 2D view, read on this device.', icon: 'dxf', onClick: () => void openDxfFromDisk() },
        {
          label: 'From Revit',
          description: revit.phase === 'connected' && revit.document ? `The model open in Revit: ${revit.document.title}.` : 'The model open in Revit — connect first (Revit tab → Connect).',
          icon: 'selectGet',
          disabled: revit.phase !== 'connected' || !revit.document || revit.document.isFamily || revitLoading,
          onClick: () => void loadFromRevit(),
        },
      ],
    },
    { id: 'save', label: 'Save', icon: 'save', disabled: !m.model, hint: m.model ? 'The project: model, views, edits, levels, grids and settings (Ctrl + S)' : 'Open a model first', onClick: () => void saveProject() },
    {
      id: 'saveas', label: 'Save As', icon: 'save', disabled: !m.model, hint: m.model ? undefined : 'Open a model first', heading: 'Saves a copy under a new name.',
      choices: [{ label: 'Project', description: 'The model with its views, edits, levels, grids and settings, as a .c2b file. Ctrl + Shift + S', icon: 'save', onClick: () => void saveProjectAs() }],
    },
    {
      id: 'export', label: 'Export', icon: 'export', disabled: !m.model, hint: m.model ? undefined : 'Open a model first', heading: 'Creates exchange files.',
      choices: [
        {
          label: 'IFC',
          description: revitLinked ? 'A fresh export from Revit, with every change since loading.' : nativeEditCount ? 'Saves the model as an IFC file — as opened: your edits are kept in the project file (IFC with edits comes with the IFC writer).' : 'Saves the model as an IFC file.',
          icon: 'downloadIfc',
          onClick: () => void downloadIfc(),
        },
        { label: 'BOQ to Excel', description: 'Opens the bill of quantities, with rates; export it to Excel from there.', icon: 'boq', onClick: () => toggleWin('boq', true) },
        { label: 'CH DXF', description: 'Creates a CH-format DXF drawing from the model.', icon: 'dxf', disabled: true, hint: 'Planned' },
      ],
    },
    { id: 'close', label: 'Close', icon: 'close', disabled: !m.model, hint: m.model ? `Closes ${m.model.info.fileName}` : 'No model open', onClick: closeModel },
  ];

  const toolStatus = modifyStatus ?? pickStatus;
  // changing views ends the tool in progress (Revit's way): its work plane belonged to the view it started in
  const toolView = useRef(activeView);
  useEffect(() => {
    if (toolView.current === activeView) return;
    toolView.current = activeView;
    endModifyTool();
    endDatumTool();
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [unitsOpen, setUnitsOpen] = useState(false);
  const datumMarks = useMemo(() => datumMarksFor(activeModelView, datums, heights, m.model?.info.bounds), [activeModelView, datums, heights, m.model]);
  const allMarks = useMemo(() => (datumMarks.length ? [...marks, ...datumMarks] : marks), [marks, datumMarks]);
  const [modifyKind, setModifyKind] = useState<ModifyKind | null>(null);
  /** One route for every Modify command: models linked to Revit keep Changes for Revit for Move and Rotate. */
  const modifyCmd = (cmd: ModifyKind | 'delete' | 'pin' | 'unpin' | 'levels' | 'grid' | 'refplane' | 'units' | 'align' | 'unlock') => {
    if (cmd === 'unlock') return unlock();
    if (cmd === 'levels') return setLevelsOpen(true);
    if (cmd === 'units') return setUnitsOpen(true);
    if (cmd === 'grid' || cmd === 'refplane') {
      endModifyTool();
      return startDatumTool(cmd);
    }
    if (cmd === 'move' || cmd === 'copy') {
      endDatumTool();
      return startMove(cmd === 'copy');
    }
    if (cmd === 'align') {
      endDatumTool();
      return startAlign();
    }
    if (revitLinked && cmd === 'rotate') return openGeom('rotate'); // Move's own tool sends linked models to it too
    const why = nativeWhy();
    if (why) return setNotice(why);
    if (cmd === 'delete') return nativeDelete();
    if (cmd === 'pin' || cmd === 'unpin') return nativePin(cmd === 'pin');
    setModifyKind(cmd);
  };
  const { openFromDisk, openSample, sampleBusy } = useFileOpening({ diagnosedFor, m, openDrawing, openModelFile: openAnyFile, start });
  const commandDispatchLate = useRef({} as CommandDispatchLate);
  const { runCommand } = useCommandDispatch({ activeDoc, activeView, annSel, curSelection, dimSel, drawingView, dx, history, m, prevSelection, sectionBox, sectionTool, setAnnSel, setDimSel, setDimTool, setDisplayStyle, setHidden, setMeasure, setNotice, setOpenViews, setReveal, setSectionBox, setVgOpen, setViews, setZoomRegion, viewport, viewsRef, zoomRegion, late: commandDispatchLate });
  const { deleteDimensions, dimPropsFor, inModel, placeDimension, qaActions, qaReport, run, setViewDims, symbolPropsFor } = useDimensionsFeature({ activeDoc, activeModelView, activeView, annSel, dimOrigin, dimSel, heights, history, m, runCommand, setActiveView, setDimSel, setHidden, setLastCommand, setNotice, setViewRange, setViews, viewport, views, viewsRef, zY });
  const { marksDialog, selectByMarks, setMarksDialog } = usePasteMarks({ inModel, m, revitLinked, revitSync, setNotice, viewport });
  const { applyViewToken, copyViewLink, linkDialog, linkFor, pendingLink, setLinkDialog, setLinkFor, shareOpenModel } = useViewLinks({ activeDoc, activeModelView, displayStyle, explode, hidden, m, openSample, openView, setActiveView, setDisplayStyle, setExplode, setHidden, setMyShareList, setNotice, setSectionBox, setShareInfoState, viewport, views });
  const { contextItems, dxt, dxtRef, findElement, getCommands, info, intents, load, sel, selLabel, selectCategory, selectLevel, toggleExplode } = useAppCommands({ saveProject, saveProjectAs, activeDoc, activeModelView, autoUpdate, bridge, canExport, canLive, canParams, cancelSection, canvasTheme, colorSettings, copyViewLink, cycle, cycleCanvasTheme, dimTool, displayStyle, dock, downloadIfc, drawingView, duplicateModelView, dx, edges, editWhy, explode, exportToRevit, exportWhy, fullscreen, getSelectionFromRevit, hidden, history, lastCommand, liveBusy, liveCount, loadFromRevit, m, measure, notice, openDxfFromDisk, openFromDisk, openGeom, openGuide, openPanels, openRevit, openSample, openView, pending, pipe, pipeline, preference, prevSelection, reveal, revit, revitLoading, revitProps, revitSync, run, runChanges, runCommand, search, sectionBox, sectionTool, sendSelectionToRevit, setAutoUpdate, setBrowserFocus, setColorMode, setDimTool, setDisplayStyle, setEdges, setElemVgOpen, setExplode, setFiltersOpen, setGradeDialog, setLinkDialog, setMarkDialog, setMarksDialog, setMeasure, setNotice, setRevitSync, setShadows, setVgOpen, setViews, setVtOpen, shadows, startSection, toggleFullscreen, toggleWin, updateFromRevit, viewHidden, viewport, views, viewsRef, wins });
  const { tasks } = useAppProgress({ bridge, dx, load, pipeline });

  commandDispatchLate.current = { dxtRef, openGeom, modifyCmd, activeModelView, cancelSection, deleteDimensions };
  revitLinkLate.current = { inModel, pipeline };
  viewsFeatureLate.current = { dx, setIfcColor, sel };
  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName={info?.fileName ?? 'No model open'}
          brandHref={import.meta.env.BASE_URL}
          quickAccess={<QuickAccess history={history} onOpen={openFromDisk} onHome={() => viewport.current?.home()} canHome={!!m.model} onMeasure={() => runCommand('measure')} measuring={!!measure} onSave={() => void saveProject()} canSave={!!m.model} onDimension={() => setDimTool(dimTool === 'aligned' ? null : 'aligned')} dimensioning={dimTool === 'aligned'} />}
          saveState={info ? projectLabel(projectStatus) : undefined}
          search={<CommandPalette inputRef={search} getCommands={getCommands} findElement={findElement} appVersion={APP_VERSION} />}
          actions={
            <>
              <WhatNow intents={intents} hasModel={!!m.model} />
              <IconButton label="Guide & FAQ (F1)" onClick={() => (wins.guide ? toggleWin('guide', false) : openGuide())} aria-pressed={wins.guide}>
                <Icon name="guide" size={18} />
              </IconButton>
              <IconButton label={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
                </svg>
              </IconButton>
              <IconButton label={`Interface theme: ${{ system: 'Auto (follows your system)', paper: 'Light', ink: 'Dark' }[preference]}. Click to change`} onClick={cycle}>
                <ThemeIcon preference={preference} />
              </IconButton>
              <Button size="sm" disabled title="Accounts arrive with cloud features. Everything here works without one.">
                Sign in
              </Button>
            </>
          }
        />
      }
      ribbonTabs={
        <RibbonTabs
          tabs={RIBBON_TABS}
          activeId={ribbonTab}
          onChange={setRibbonTab}
          leading={
            <button type="button" ref={fileTab} className="app-file-tab" aria-label="File menu" aria-haspopup="menu" aria-expanded={fileMenu} onClick={() => setFileMenu((o) => !o)}>
              File
            </button>
          }
        />
      }
      ribbon={
        <Ribbon label={RIBBON_TABS.find((t) => t.id === ribbonTab)?.label ?? 'Model'}>
          {ribbonTab === 'model' ? (
            <>
          <RibbonGroup label="Structure">
            {(['column', 'beam', 'wall', 'slab', 'footing'] as const).map((k) => (
              <RibbonButton key={k} icon={k} label={k[0].toUpperCase() + k.slice(1)} twoTone disabled shortcutHint="modelling arrives in 0.2" />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Datum">
            <RibbonButton icon="level" label="Levels" disabled={!m.model} onClick={() => modifyCmd('levels')} shortcutHint="move a level and what is hosted on it follows; add levels (LL)" />
            <RibbonButton icon="grid" label="Grid" active={datumTool === 'grid'} disabled={!m.model} onClick={() => (datumTool === 'grid' ? endDatumTool() : modifyCmd('grid'))} shortcutHint="in a plan: click two points, or type a length; one after another until Esc (GR)" />
          </RibbonGroup>
          <RibbonGroup label="Work Plane">
            <RibbonButton icon="section" label="Ref. Plane" active={datumTool === 'refplane'} disabled={!m.model} onClick={() => (datumTool === 'refplane' ? endDatumTool() : modifyCmd('refplane'))} shortcutHint="in a plan: click two points (RP)" />
          </RibbonGroup>
          <RibbonGroup label="Select">
            <RibbonButton icon="byid" label="By ID" onClick={() => search.current?.focus({ preventScroll: true })} shortcutHint="Ctrl + K" />
            <RibbonButton icon="byid" label="By marks" disabled={!m.model} onClick={() => setMarksDialog(true)} shortcutHint="paste C1, C4, B12 (or Ctrl + V on the model)" />
          </RibbonGroup>
          <RibbonGroup label="Measure">
            <RibbonButton icon="measure" label="Measure" active={!!measure} disabled={!m.model} onClick={() => runCommand('measure')} shortcutHint="ME · distance, clear and C/C, along, face area, chain · Tab cycles snaps" />
          </RibbonGroup>
          <RibbonGroup label="Quantities">
            <RibbonButton
              icon="boq"
              label="BOQ"
              disabled={!m.model}
              active={wins.boq}
              onClick={() => toggleWin('boq')}
              shortcutHint="bill of quantities with rates and Excel export"
            />
          </RibbonGroup>
            </>
          ) : ribbonTab === 'modify' ? (
            <>
              <RibbonGroup label="Select">
                <RibbonButton icon="select" label="Modify" active={!anyTool} disabled={!m.model} onClick={endAllTools} shortcutHint="ends the current tool and returns to selecting (Esc)" />
              </RibbonGroup>
              <RibbonGroup label="Properties">
                <RibbonStack>
                  <RibbonButton size="small" icon="typeProperties" label="Type Properties" disabled={!revitProps?.onEditType} onClick={() => revitProps?.onEditType?.()} shortcutHint={revitProps?.onEditType ? 'the selected type’s parameters (Edit Type)' : 'select one element of a Revit type in a model linked to Revit'} />
                  <RibbonButton size="small" icon="properties" label="Properties" active={openPanels.includes('properties')} onClick={() => dock.current?.toggle('properties')} shortcutHint="show or hide the Properties palette" />
                </RibbonStack>
              </RibbonGroup>
              <RibbonGroup label="Clipboard">
                <RibbonStack>
                  <RibbonButton size="small" icon="paste" label="Paste Aligned to Selected Levels" disabled shortcutHint="planned next: copies of the selection on other levels" />
                  <RibbonButton size="small" icon="matchType" label="Match Type Properties" disabled shortcutHint="planned next (MA)" />
                </RibbonStack>
              </RibbonGroup>
              <RibbonGroup label="Modify">
                {(
                  [
                    [
                      ['align', 'align', 'Align', 'AL', 'a grid or reference plane, then an element’s face or centreline; Lock keeps it', modifyTool?.kind === 'align'],
                      ['offset', 'offset', 'Offset', 'OF', 'beams and walls parallel by a distance', false],
                      ['mirror', 'mirror', 'Mirror', 'MM', 'a mirrored copy about an axis through the selection', false],
                    ],
                    [
                      ['move', 'move', 'Move', 'MV', 'start and end points, or a typed distance', modifyTool?.kind === 'move' && !modifyTool.copy],
                      ['copy', 'copy', 'Copy', 'CO', 'as Move, keeping the originals', modifyTool?.kind === 'move' && modifyTool.copy],
                      ['rotate', 'rotate', 'Rotate', 'RO', 'by a typed angle', false],
                    ],
                    [
                      ['trim', 'trim', 'Trim/Extend to Corner', 'TR', 'planned next', false],
                      ['split', 'split', 'Split Element', 'SL', 'planned next', false],
                      ['array', 'array', 'Array', 'AR', 'copies in a row by a spacing', false],
                    ],
                    [
                      ['scale', 'scale', 'Scale', 'RE', 'planned next', false],
                      ['pin', 'pin', 'Pin', 'PN', 'protects the selection from changes', false],
                      ['unpin', 'unpin', 'Unpin', 'UP', 'releases pinned elements', false],
                    ],
                  ] as const
                ).map((col, ci) => (
                  <RibbonStack key={ci}>
                    {col.map(([k, icon, label, keys, hint, active]) => {
                      const planned = k === 'trim' || k === 'split' || k === 'scale';
                      const linkedOnly = (k === 'pin' || k === 'unpin') && revitLinked;
                      return (
                        <RibbonButton
                          key={k}
                          size="small"
                          icon={icon}
                          label={label}
                          active={active}
                          disabled={planned || !m.model || linkedOnly}
                          onClick={() => modifyCmd(k as 'align')}
                          shortcutHint={linkedOnly ? 'models linked to Revit: in Revit for now' : `${keys} · ${hint}`}
                        />
                      );
                    })}
                  </RibbonStack>
                ))}
                <RibbonStack>
                  <RibbonButton size="small" icon="unpin" label="Unlock" disabled={!m.model || revitLinked} onClick={() => modifyCmd('unlock')} shortcutHint={`removes the selection’s Align locks${lockCount() ? ` (${lockCount()} in the model)` : ''}`} />
                  <RibbonButton size="small" icon="delete" label="Delete" disabled={!m.model || revitLinked} onClick={() => modifyCmd('delete')} shortcutHint={revitLinked ? 'models linked to Revit: delete in Revit for now' : 'DE · the selection; Ctrl + Z brings it back'} />
                </RibbonStack>
              </RibbonGroup>
              <RibbonGroup label="View">
                <RibbonStack>
                  <RibbonButton size="small" icon="hide" label="Hide Element" disabled={!m.model || !m.selection.length} onClick={() => runCommand('hideElement')} shortcutHint="HH · hides the selection in this view, temporarily" />
                  <RibbonButton size="small" icon="isolate" label="Isolate Element" disabled={!m.model || !m.selection.length} onClick={() => runCommand('isolateElement')} shortcutHint="HI · shows only the selection in this view, temporarily" />
                  <RibbonButton size="small" icon="reveal" label="Reset Temporary Hide/Isolate" disabled={!m.model} onClick={() => runCommand('resetHidden')} shortcutHint="HR" />
                </RibbonStack>
              </RibbonGroup>
              <RibbonGroup label="Measure">
                <RibbonStack>
                  <RibbonButton size="small" icon="measure" label="Measure Between Two References" active={!!measure} disabled={!m.model} onClick={() => runCommand('measure')} shortcutHint="ME" />
                  <RibbonButton size="small" icon="dimAligned" label="Aligned Dimension" active={dimTool === 'aligned'} disabled={!m.model || !!activeDoc} onClick={() => setDimTool(dimTool === 'aligned' ? null : 'aligned')} shortcutHint="DI" />
                </RibbonStack>
              </RibbonGroup>
              {nativeEditCount ? <p className="app-ribbon__note">{nativeEditCount} edited element{nativeEditCount === 1 ? '' : 's'} · kept on this device and saved with the project</p> : null}
            </>
          ) : ribbonTab === 'annotate' ? (
            <>
          <RibbonGroup label="Dimension">
            {DIMENSION_TOOLS.map((t) => (
              <RibbonButton
                key={t.id}
                icon={t.icon as 'dimAligned'}
                label={t.label}
                active={dimTool === t.id}
                disabled={!m.model || !!activeDoc}
                onClick={() => setDimTool(dimTool === t.id ? null : t.id)}
                shortcutHint={`${t.keys ? `${t.keys} · ` : ''}${t.tip}`}
              />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Measure">
            <RibbonButton icon="measure" label="Measure" active={!!measure} disabled={!m.model} onClick={() => runCommand('measure')} shortcutHint="ME · temporary, not placed" />
          </RibbonGroup>
            </>
          ) : ribbonTab === 'view' ? (
            <>
          <RibbonGroup label="Create">
            <RibbonButton icon="view3d" label="3D View" disabled={!m.model} onClick={() => openView('3d')} shortcutHint="open {3D}" />
            <RibbonButton icon="elevation" label="Section" active={sectionTool} disabled={!m.model || !isTwoD(activeModelView ?? undefined)} onClick={() => (sectionTool ? cancelSection() : startSection())} shortcutHint="two clicks in a plan, section or elevation" />
            <RibbonButton icon="plan" label="Duplicate View" disabled={!activeModelView} onClick={() => activeModelView && duplicateModelView(activeModelView.id)} shortcutHint="copy the current view with its settings" />
          </RibbonGroup>
          <RibbonGroup label="Section">
            <RibbonButton icon="section" label="Box" active={sectionBox} disabled={!m.model} onClick={() => runCommand('sectionBox')} shortcutHint="BX" />
          </RibbonGroup>
          <RibbonGroup label="Explode">
            {EXPLODE_MODES.map((md) => (
              <RibbonButton
                key={md.id}
                icon={md.id === 'storeys' ? 'explodeStoreys' : md.id === 'radial' ? 'explodeRadial' : 'explodeCategories'}
                label={md.label}
                active={!!explode?.modes.includes(md.id)}
                disabled={!m.model || !!activeDoc || isTwoD(activeModelView ?? undefined)}
                onClick={() => toggleExplode(md.id)}
                shortcutHint={`${md.hint.toLowerCase()} (3D views; combine with the others; click again to turn off)`}
              />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Graphics">
            <RibbonButton
              icon="view3d"
              label={canvasTheme === 'follow' ? 'Canvas: Auto' : canvasTheme === 'paper' ? 'Canvas: Light' : 'Canvas: Dark'}
              onClick={cycleCanvasTheme}
              shortcutHint="canvas theme, separate from the interface"
            />
            <RibbonButton icon="visibility" label="Visibility/ Graphics" active={!!vgOpen || countOverrides(graphics) > 0} disabled={!m.model} onClick={() => setVgOpen({})} shortcutHint="VG" />
            <RibbonButton
              icon="template"
              label="View Templates"
              disabled={!m.model}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setVtMenu({ x: r.left, y: r.bottom + 4 });
              }}
              shortcutHint="apply, create or manage view templates"
            />
            <RibbonButton
              icon="reveal"
              label="Hidden Lines"
              active={!!activeModelView?.hiddenLines}
              disabled={!activeModelView}
              onClick={() => activeModelView && setViews((vs) => vs.map((x) => (x.id === activeModelView.id ? { ...x, hiddenLines: !x.hiddenLines } : x)))}
              shortcutHint="Show Hidden Lines: dashed edges behind other elements, this view"
            />
            <RibbonButton icon="sun" label="Shadows" active={shadows} disabled={!m.model} onClick={() => setShadows((v) => !v)} shortcutHint="ground shadows from the sun" />
            <RibbonButton icon="view3d" label="Realistic" active={displayStyle === 'realistic'} disabled={!m.model} onClick={() => setDisplayStyle(displayStyle === 'realistic' ? 'shaded' : 'realistic')} shortcutHint="sun and sky lighting on concrete" />
            <RibbonButton icon="colour" label="Colour by" active={colorSettings.mode !== 'none' || openPanels.includes('colour')} disabled={!m.model} onClick={() => (colorSettings.mode === 'none' ? setColorMode('grade') : dock.current?.toggle('colour'))} shortcutHint="colour by grade, level, section… with a legend" />
            <RibbonButton icon="edges" label="Edges" active={edges} disabled={!m.model} onClick={() => setEdges((v) => !v)} shortcutHint="show or hide model edges" />
            <RibbonButton icon="reveal" label="Reveal" active={reveal} disabled={!m.model} onClick={() => setReveal((v) => !v)} shortcutHint="reveal hidden elements (RH)" />
          </RibbonGroup>
          <RibbonGroup label="Windows">
            {(
              [
                ['properties', 'properties', 'Properties'],
                ['browser', 'browser', 'Browser'],
                ['activity', 'activity', 'Activity'],
                ['console', 'console', 'Console'],
                ['qa', 'qa', 'QA'],
                ['colour', 'colour', 'Colour'],
              ] as const
            ).map(([id, icon, label]) => (
              <RibbonButton key={id} icon={icon} label={label} active={openPanels.includes(id)} onClick={() => dock.current?.toggle(id)} shortcutHint="show or hide" />
            ))}
            <RibbonButton icon="keyboard" label="Keys" active={wins.keys} onClick={() => toggleWin('keys')} shortcutHint="keyboard shortcuts" />
            <RibbonButton icon="guide" label="Guide" active={wins.guide} onClick={() => (wins.guide ? toggleWin('guide', false) : openGuide())} shortcutHint="Guide & FAQ (F1)" />
            <RibbonButton icon="layout" label="Reset" onClick={() => dock.current?.reset()} shortcutHint="default layout: browser left, properties right" />
          </RibbonGroup>
            </>
          ) : ribbonTab === 'manage' ? (
            <>
          <RibbonGroup label="Settings">
                <RibbonButton icon="layout" label="Project Units" onClick={() => setUnitsOpen(true)} shortcutHint="how lengths are shown and typed: mm, cm, m or feet-inches (UN)" />
            <RibbonButton icon="byid" label="Marks" disabled={!m.model} onClick={() => setMarkDialog(true)} shortcutHint="which property is the mark" />
          </RibbonGroup>
            </>
          ) : (
            <>
          {/* Revit bridge (cad2bim Bridge for Revit): the same actions as the Revit window, Revit-style */}
          <RibbonGroup label="Connection">
            <RibbonButton
              icon="link"
              label={revit.phase === 'connected' ? 'Connected' : revit.phase === 'unpaired' ? 'Pair' : 'Connect'}
              active={revit.phase === 'connected'}
              onClick={() => openRevit()}
              shortcutHint={revit.phase === 'connected' ? `Revit ${revit.revit ?? ''}: ${revit.document?.title ?? 'no model open'}` : 'find Revit and pair with the code from cad2bim → Connect'}
            />
            <RibbonButton icon="unlink" label="Disconnect" disabled={revit.phase !== 'connected' && revit.phase !== 'unpaired'} onClick={() => bridge.disconnect()} shortcutHint="forget this browser's pairing" />
          </RibbonGroup>
          <RibbonGroup label="Model">
            <RibbonButton
              icon="importModel"
              label={revitLoading ? 'Loading…' : revitLinked ? 'Reload' : 'Load from Revit'}
              disabled={revit.phase !== 'connected' || !revit.document || revit.document.isFamily || revitLoading}
              onClick={() => void loadFromRevit()}
              shortcutHint={revit.phase !== 'connected' ? 'connect to Revit first' : !revit.document ? 'open a model in Revit' : `load ${revit.document.title} (the Revit model is not changed)`}
            />
            <RibbonButton
              icon="sync"
              label={liveBusy ? 'Updating…' : liveCount ? `Update (${liveCount})` : 'Update'}
              disabled={!canLive || !liveCount || liveBusy}
              onClick={() => void updateFromRevit()}
              shortcutHint={!revitLinked ? 'load the model from Revit first' : !bridge.canLiveUpdate ? 'needs cad2bim Bridge for Revit 0.5.0' : liveCount ? `bring in the ${liveCount} element${liveCount === 1 ? '' : 's'} changed in Revit` : 'nothing changed in Revit'}
            />
            <RibbonButton icon="importModel" label="Auto-update" active={autoUpdate} disabled={!canLive} onClick={() => setAutoUpdate((v) => !v)} shortcutHint="bring in Revit's changes as they happen (Revit exports them in the background)" />
            <RibbonButton icon="downloadIfc" label="Download IFC" disabled={!revitLinked} onClick={() => void downloadIfc()} shortcutHint={revitLinked ? 'a fresh IFC export of the Revit model, with every change since loading' : 'load the model from Revit first'} />
          </RibbonGroup>
          <RibbonGroup label="Selection">
            <RibbonButton icon="sync" label="Sync" active={revitSync} onClick={() => setRevitSync((v) => !v)} shortcutHint={revitLinked ? 'selection follows Revit both ways' : 'follows Revit once the model is loaded from Revit'} />
            <RibbonButton icon="selectSend" label="Send to Revit" disabled={revit.phase !== 'connected' || !revit.document || !m.model} onClick={() => void sendSelectionToRevit()} shortcutHint="select cad2bim's selection in Revit now" />
            <RibbonButton icon="selectGet" label="Get from Revit" disabled={revit.phase !== 'connected' || !revit.document || !m.model} onClick={() => void getSelectionFromRevit()} shortcutHint="take Revit's current selection" />
          </RibbonGroup>
          <RibbonGroup label="Create">
            <RibbonButton icon="dxf" label="Export to Revit" disabled={!canExport} onClick={() => void exportToRevit()} shortcutHint={canExport ? 'build the DXF → 3D model natively in Revit (checked first, one undo)' : exportWhy} />
          </RibbonGroup>
          <RibbonGroup label="Modify">
            <RibbonButton icon="move" label="Move" disabled={!!editWhy} active={wins.editGeom && geomMode === 'move'} onClick={() => openGeom('move')} shortcutHint={editWhy ?? 'move the selection by a typed distance (MV)'} />
            <RibbonButton icon="rotate" label="Rotate" disabled={!!editWhy} active={wins.editGeom && geomMode === 'rotate'} onClick={() => openGeom('rotate')} shortcutHint={editWhy ?? 'rotate the selection by a typed angle (RO)'} />
          </RibbonGroup>
          <RibbonGroup label="Parameters">
            <RibbonButton icon="properties" label={pending.length ? `Changes (${pending.length})` : 'Changes'} active={wins.changes} onClick={() => toggleWin('changes')} shortcutHint="parameter edits waiting for Revit" />
            <RibbonButton icon="qa" label="Check" disabled={!pending.length || !canParams || !!changesBusy} onClick={() => void runChanges(pending.map(changeKey), true)} shortcutHint="Revit checks every change and keeps nothing" />
            <RibbonButton icon="selectSend" label="Apply" disabled={!pending.length || !canParams || !!changesBusy} onClick={() => toggleWin('changes', true)} shortcutHint="review and apply in the Changes window (one undo in Revit)" />
          </RibbonGroup>
          <RibbonGroup label="Help">
            <RibbonButton icon="guide" label="Bridge guide" onClick={() => openGuide('revit')} shortcutHint="install the add-in, pair, load, sync" />
          </RibbonGroup>
            </>
          )}
        </Ribbon>
      }
      workspace={
        <DockWorkspace
          ref={dock}
          onChange={setOpenPanels}
          render={(id) => {
            switch (id) {
              case 'views':
                return (
                  <div className="app-views">
                    {<ViewTabs
          tabs={[
            // {3D} is the IFC model's view: closable when a model is open, hidden when only drawings are open.
            ...(m.model
              ? openViews
                  .map((id) => views.find((v) => v.id === id))
                  .filter((v): v is ModelView => !!v)
                  .map((v) => ({
                    id: v.id,
                    label: v.name,
                    closable: true,
                    color: ifcColor ?? undefined,
                    title: v.id === '3d' ? `${info?.fileName} (close to unload the model)` : `${KIND_LABEL[v.kind]}: ${v.name}`,
                  }))
              : !dx.docs.length
                ? [{ id: '3d', label: '{3D}', closable: false }]
                : []),
            ...dx.docs.map((d) => ({ id: d.id, label: d.name.replace(/\.dxf$/i, ''), closable: true, color: d.color, title: `${d.name} (2D)` })),
          ]}
          activeId={activeView}
          onSelect={(id) => {
            setActiveView(id);
            setCursor(null);
          }}
          onClose={closeView}
        />}
                    <div className="sk-shell__viewport">{<div
          className={['app-drop', dragging && 'is-dragging', hidden.length > 0 && 'is-isolated'].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            try {
              const file = await fileFromDrop(e);
              diagnosedFor.current = '';
              if (file?.kind === 'dxf') await openDrawing(file);
              else if (file?.kind === 'ifc' || (file && isProjectFile(file.name))) await openAnyFile(file);
              else if (file) diagnose(snapshot(file)); // not IFC or DXF: say what it is and how to export
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          {dx.docs.map((d) =>
            d.id === activeView ? (
              <DrawingView
                key={d.id}
                ref={drawingView}
                doc={d}
                onCursor={(x, y) => setCursor({ x, y })}
                onSelect={(e) => dx.select(d.id, e)}
                canvasTheme={canvasTheme}
                describe={(ent) => dx.getClient().entity(d.drawing.drawingId, d.drawing.handles[ent])}
                display={dxt.display}
                tool={dxt.tool}
                onToolEnd={() => dxt.setTool(null)}
                onContextMenu={dxt.openMenu}
              >
                {d.objects ? (
                  <div className="app-temp-frame" role="status">
                    <span>
                      {d.objects.mode === 'isolate' ? 'Isolate Objects' : 'Hide Objects'}
                      <button type="button" className="app-temp-frame__end" onClick={() => dxt.act('endIsolation')}>
                        End
                      </button>
                    </span>
                  </div>
                ) : null}
                {dxt.quickProperties && d.selected ? <QuickProperties props={d.selected.props} count={d.selected.entities.length} onClose={() => dxt.setQuickProperties(false)} /> : null}
              </DrawingView>
            ) : null,
          )}
          <div className="app-view3d" hidden={activeDoc !== null}>
          {modifyTool ? (
            <div className="app-optionsbar" role="toolbar" aria-label="Options">
              {modifyTool.kind === 'move' ? (
                <>
                  <strong>{modifyTool.copy ? 'Copy' : 'Move'}</strong>
                  <label>
                    <input type="checkbox" checked={modifyTool.constrain} onChange={(e) => setMoveOption({ constrain: e.target.checked })} /> Constrain
                  </label>
                  <label>
                    <input type="checkbox" checked={modifyTool.copy} onChange={(e) => setMoveOption({ copy: e.target.checked })} /> Copy
                  </label>
                  <Button size="sm" onClick={() => { const k = modifyTool.copy ? 'copy' : 'move'; endModifyTool(); setModifyKind(k); }}>Type values…</Button>
                </>
              ) : (
                <>
                  <strong>Align</strong>
                  <label>
                    <input type="checkbox" checked={modifyTool.lock} onChange={(e) => setAlignLock(e.target.checked)} /> Lock
                  </label>
                </>
              )}
              <Button size="sm" onClick={endModifyTool}>Cancel</Button>
            </div>
          ) : null}
          <Viewport
            ref={viewport}
            model={m.model}
            selection={sel}
            hidden={viewHidden}
            temporary={hidden.length > 0}
            overrides={viewOverrides}
            displayStyle={displayStyle}
            onPick={(i, mode) => {
              if (mode === 'replace') setAnnSel([]);
              m.pick(i, mode);
            }}
            onAnnotationClick={(id, mode) => {
              setAnnSel((cur) => applyMode(cur, [id], mode));
              if (mode === 'replace') m.setSelection([]);
            }}
            annotationSelection={annSel}
            onSymbolGrip={(e) => {
              const v = viewsRef.current.find((x) => x.id === e.id);
              if (!v?.section) return;
              const label = { a: 'Resize section', b: 'Resize section', far: 'Section far clip', move: 'Move section', flip: 'Flip section' }[e.grip];
              const withSection = (vs: ModelView[], sec: NonNullable<ModelView['section']>) => vs.map((x) => (x.id === e.id ? { ...x, section: sec } : x));
              if (e.phase === 'click') {
                const before = viewsRef.current;
                history.run(`${label}: ${v.name}`, (tx) => tx.change('views', before, withSection(before, editSection(v.section!, 'flip', e.start, e.point)), setViews));
                return;
              }
              if (e.phase === 'start') {
                gripStart.current = { views: viewsRef.current, section: v.section };
                return;
              }
              const base = gripStart.current;
              if (!base) return;
              const next = editSection(base.section, e.grip, e.start, e.point);
              if (e.phase === 'move') return setViews((vs) => withSection(vs, next));
              gripStart.current = null;
              if (JSON.stringify(next) === JSON.stringify(base.section)) return setViews(base.views); // a click, not a drag
              history.run(`${label}: ${v.name}`, (tx) => tx.change('views', base.views, withSection(base.views, next), setViews));
            }}
            toolActive={sectionTool || !!measure || !!dimTool}
            measure={activeDoc ? null : measure}
            onMeasureChange={setMeasure}
            dimensions={activeModelView?.dims}
            dimensionSelection={dimSel}
            dimensionOrigin={dimOrigin}
            dimensionTool={activeDoc ? null : dimTool}
            onDimensionToolChange={setDimTool}
            onDimensionPlaced={placeDimension}
            onDimensionClick={(id, mode) => {
              setDimSel((cur) => applyMode(cur, [id], mode));
              if (mode === 'replace') {
                m.setSelection([]);
                setAnnSel([]);
              }
            }}
            onDimensionEdit={(id, _before, after) => activeView && setViewDims('Move dimension', activeView, (ds) => ds.map((d) => (d.id === id ? { ...d, at: after } : d)))}
            onBoxSelect={(ids, mode, anns) => {
              setAnnSel((cur) => applyMode(mode === 'replace' ? [] : cur, anns ?? [], mode === 'replace' ? 'add' : mode));
              m.boxSelect(ids, mode);
            }}
            edges={edges}
            canvasTheme={canvasTheme}
            twoD={isTwoD(activeModelView ?? undefined)}
            hiddenLines={!!activeModelView?.hiddenLines}
            shadows={shadows}
            annotations={allMarks}
            pick={modifyPick ?? datumPick}
            onPickEnd={() => {
              endDatumTool();
              endModifyTool();
            }}
            explode={isTwoD(activeModelView ?? undefined) ? null : explode}
            onOpenView={(id) => views.some((v) => v.id === id) && openView(id)}
            onContextMenu={(x, y) => m.model && setCtxMenu({ x, y })}
            reveal={reveal}
            onZoomRegionEnd={() => setZoomRegion(false)}
            onSectionBoxEdit={(before, after) =>
              history.run('Edit section box', (t) => t.change('section-box', before, after, (st) => viewport.current?.setSectionBoxState(st)))
            }
          />
          {m.model ? <ColorLegendOverlay settings={colorSettings} result={colorResult} onOpen={() => dock.current?.open('colour')} /> : null}
          </div>
          {!activeDoc && m.model && (sectionBox || zoomRegion) ? (
            <div className="app-viewstate" role="status">
              {sectionBox ? <span>Section box · BX removes</span> : null}
              {zoomRegion ? <span>Drag a region to zoom · Esc cancels</span> : null}
            </div>
          ) : null}
          {load.status === 'idle' && !m.model && !activeDoc && !dx.loading ? (
            <StartPage
              onChooseIfc={openFromDisk}
              onChooseDxf={openDxfFromDisk}
              onSample={(smp) => void openSample(smp)}
              onGuide={() => openGuide()}
              busy={sampleBusy}
              sharedView={linkFor ? { file: linkFor.file } : null}
              onDismissShared={() => {
                pendingLink.current = null;
                setLinkFor(null);
              }}
            />
          ) : null}
          {(() => {
            // DXF → 3D and Export to Revit show their progress inside their own windows when those are open
            const shown = tasks.filter((t) => !(t.id === 'dxf-3d' && wins.pipeline) && !(t.id === 'revit' && wins.exportRevit));
            const t = shown[shown.length - 1];
            return t ? <BuildProgress task={t} variant={m.model || activeDoc ? 'floating' : 'center'} /> : null;
          })()}
          {load.status === 'error' && !activeDoc ? (
            <div className="app-overlay" role="alert">
              <p className="app-overlay__title">That file didn’t open</p>
              <p className="app-overlay__text">{load.message}</p>
              <div className="app-overlay__actions">
                {lastFile.current ? <Button onClick={() => lastFile.current && diagnose(lastFile.current, load.status === 'error' ? load.message : undefined)}>What is wrong?</Button> : null}
                <Button variant="primary" onClick={openFromDisk}>
                  Choose another file
                </Button>
              </div>
            </div>
          ) : null}
          <FloatingWindow id="boq" title="Bill of quantities" subtitle={m.model?.info.fileName} accent={ifcColor ?? undefined} open={wins.boq} onClose={() => toggleWin('boq', false)} initial={{ w: 1080, h: 540 }} minWidth={560} minHeight={280}>
            {m.model ? (
                  <BoqWindow
                    model={m.model}
                    rates={rates}
                    onRates={changeRates}
                    selection={sel}
                    hidden={viewHidden}
                    onSelect={boqSelect}
                    markRules={m.markRules}
                    gradeRules={m.gradeRules}
                    appVersion={APP_VERSION}
                    onEditGradeRules={() => setGradeDialog(true)}
                    onLog={m.log}
                  />
                ) : (
                  <p className="app-empty-note">Open an IFC model to see its bill of quantities.</p>
                )}
          </FloatingWindow>
          <FloatingWindow id="pipeline" title="DXF → 3D" subtitle={pipe?.fileName} open={wins.pipeline} onClose={() => toggleWin('pipeline', false)} initial={{ w: 1000, h: 560 }} minWidth={560} minHeight={300}>
            {(
                  <PipelinePanel
                    state={pipe}
                    onPick={() => void pipeline.start()}
                    onName={pipeline.setName}
                    onHeight={pipeline.setHeight}
                    onBuild={() => void pipeline.build()}
                    onDownload={pipeline.download}
                    onShow={showQa}
                    onExportRevit={() => void exportToRevit()}
                    exportRevit={{ ready: canExport, why: exportWhy }}
                  />
                )}
          </FloatingWindow>
          <FloatingWindow id="exportRevit" title="Export to Revit" subtitle={exportState?.target ? `into ${exportState.target}` : undefined} open={wins.exportRevit} onClose={() => toggleWin('exportRevit', false)} initial={{ w: 640, h: 560 }} minWidth={460} minHeight={320}>
            {exportState ? (
              <ExportToRevit
                state={exportState}
                off={exportOff}
                onToggle={(keys, on) =>
                  setExportOff((cur) => {
                    const n = new Set(cur);
                    for (const k of keys) (on ? n.delete(k) : n.add(k));
                    return n;
                  })
                }
                onCheck={() => void exportToRevit()}
                onCreate={() => void createInRevit()}
                onLoad={() => void loadFromRevit().then(() => toggleWin('exportRevit', false))}
                loading={revitLoading}
                progress={tasks.find((t) => t.id === 'revit') ?? null}
              />
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="editGeom" title={geomMode === 'move' ? 'Move' : 'Rotate'} subtitle="staged for Revit" open={wins.editGeom} onClose={() => toggleWin('editGeom', false)} initial={{ w: 440, h: 330 }} minWidth={380} minHeight={260}>
            <EditGeometry mode={geomMode} count={selectedGids.length} disabledWhy={editWhy ? editWhy[0].toUpperCase() + editWhy.slice(1) + '.' : null} onMode={setGeomMode} onStage={stageGeometry} onClose={() => toggleWin('editGeom', false)} />
          </FloatingWindow>
          <FileMenu
            open={fileMenu}
            anchor={fileTab.current}
            items={fileItems}
            recent={recent}
            recentSupported={typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function'}
            onOpenRecent={(r) => void openRecentFile(r)}
            onClose={() => setFileMenu(false)}
          />
          <FloatingWindow id="constraints" title="Constraints are not satisfied" subtitle={constraintPrompt?.label ?? ''} open={!!constraintPrompt} onClose={() => constraintPrompt?.cancel()} initial={{ w: 460, h: 300 }}>
            {constraintPrompt ? (
              <div className="app-geom">
                <p className="app-geom__what">This edit would take {constraintPrompt.broken.length === 1 ? 'an element' : `${constraintPrompt.broken.length} elements`} off what {constraintPrompt.broken.length === 1 ? 'it is' : 'they are'} locked to:</p>
                <ul className="app-constraints">
                  {constraintPrompt.broken.map((b) => (
                    <li key={b.lock.id}>{b.what}</li>
                  ))}
                </ul>
                <div className="app-geom__buttons">
                  <Button size="sm" onClick={constraintPrompt.cancel}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" onClick={constraintPrompt.remove}>
                    Remove constraints
                  </Button>
                </div>
              </div>
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="units" title="Project Units" subtitle="how lengths are shown" open={unitsOpen} onClose={() => setUnitsOpen(false)} initial={{ w: 420, h: 380 }}>
            {unitsOpen ? <ProjectUnits units={units} onChange={setProjectUnits} onClose={() => setUnitsOpen(false)} /> : null}
          </FloatingWindow>
          <FloatingWindow id="levels" title="Levels" subtitle="datums" open={levelsOpen} onClose={() => setLevelsOpen(false)} initial={{ w: 460, h: 460 }}>
            {levelsOpen ? <DatumsList datums={datums} onRename={renameDatum} onDelete={deleteDatum} /> : null}
            {levelsOpen ? <LevelsTool key={levelTick} rows={levelList()} why={!m.model ? 'Open a model first.' : revitLinked ? 'This model is linked to Revit: change its levels in Revit for now (Sync with Revit comes next).' : null} deleteWhy={levelDeleteWhy} onMove={moveLevel} onNew={newLevel} onDelete={deleteLevel} /> : null}
          </FloatingWindow>
          <FloatingWindow id="modify" title={modifyKind ? modifyKind[0].toUpperCase() + modifyKind.slice(1) : 'Modify'} subtitle="cad2bim's model" open={!!modifyKind} onClose={() => setModifyKind(null)} initial={{ w: 520, h: 420 }}>
            {modifyKind ? <ModifyTool kind={modifyKind} count={m.selection.length} disabledWhy={nativeWhy()} onKind={setModifyKind} onApply={nativePerform} onClose={() => setModifyKind(null)} /> : null}
          </FloatingWindow>
          <FloatingWindow id="typeProps" title="Type Properties" open={wins.typeProps} onClose={() => toggleWin('typeProps', false)} initial={{ w: 760, h: 620 }} minWidth={480} minHeight={360}>
            {(() => {
              void paramsTick;
              const gid = selectedGids[0] ?? '';
              const idx = m.model ? m.model.elements.findIndex((e) => e.globalId === gid) : -1;
              return (
                <TypeProperties
                  element={paramsCache.current.get(gid) ?? null}
                  model={m.model}
                  index={idx >= 0 ? idx : null}
                  selection={selectedGids}
                  pending={pending}
                  canEdit={bridge.canEdit && revitLinked}
                  onCommit={commitTypeDraft}
                  onClose={() => toggleWin('typeProps', false)}
                />
              );
            })()}
          </FloatingWindow>
          <FloatingWindow id="changes" title="Changes for Revit" subtitle={revit.document?.title} open={wins.changes} onClose={() => toggleWin('changes', false)} initial={{ w: 760, h: 420 }} minWidth={520} minHeight={240}>
            <RevitChanges
              pending={pending}
              status={changeStatus}
              busy={changesBusy}
              canApply={canParams}
              why={revit.phase !== 'connected' ? 'Connect to Revit to check or apply.' : !revitLinked ? 'Revit is showing a different model.' : !bridge.canEditParams ? 'Update cad2bim Bridge for Revit to 0.2.0.' : undefined}
              lastApplied={lastApplied}
              warnings={changeWarnings}
              onReload={() => void loadFromRevit()}
              onCheck={(keys) => void runChanges(keys, true)}
              onApply={(keys) => void runChanges(keys, false)}
              onRemove={(keys) => {
                const before = pending, after = pending.filter((c) => !keys.includes(changeKey(c)));
                history.run(`Remove ${keys.length} change${keys.length === 1 ? '' : 's'}`, (tx) => tx.change('revit-pending', before, after, setPending));
              }}
              onRefresh={(keys) => void refreshChanges(keys)}
              onSelectElements={(gids) => m.model && m.setSelection(m.model.elements.flatMap((e, i) => (gids.includes(e.globalId) ? [i] : [])))}
            />
          </FloatingWindow>
          <FloatingWindow id="revit" title="Revit" subtitle="cad2bim Bridge" open={wins.revit} onClose={() => toggleWin('revit', false)} initial={{ w: 460, h: 440 }} minWidth={380} minHeight={300}>
            <RevitPanel
              state={revit}
              linkedKey={revitLink && m.model?.info.fileName === revitLink.fileName ? revitLink.key : null}
              loading={revitLoading}
              syncSelection={revitSync}
              onConnect={(port) => void bridge.connect(port)}
              onPair={(code) => void bridge.pair(code)}
              onLoad={() => void loadFromRevit()}
              onSyncSelection={setRevitSync}
              onDisconnect={() => bridge.disconnect()}
              live={canLive ? { count: liveCount, busy: liveBusy, auto: autoUpdate, onUpdate: () => void updateFromRevit(), onAuto: setAutoUpdate } : null}
            />
          </FloatingWindow>
          <FloatingWindow id="guide" title="Guide & FAQ" subtitle={`cad2bim ${APP_VERSION}`} open={wins.guide} onClose={() => toggleWin('guide', false)} initial={{ w: 900, h: 620 }} minWidth={560} minHeight={320}>
            <GuidePanel initial={guideSection} />
          </FloatingWindow>
          <FloatingWindow id="keys" title="Keyboard shortcuts" open={wins.keys} onClose={() => toggleWin('keys', false)} initial={{ w: 520, h: 560 }} minWidth={360}>
            {(
                  <table className="app-keys">
                    <tbody>
                      {SHORTCUT_HELP.map((k) => (
                        <tr key={k.keys}>
                          <th scope="row">{k.keys}</th>
                          <td>{k.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
          </FloatingWindow>
          {viewMenu && m.model ? (
            <ContextMenu
              x={viewMenu.x}
              y={viewMenu.y}
              onClose={() => setViewMenu(null)}
              items={(() => {
                const v = views.find((x) => x.id === viewMenu.id);
                if (!v) return [];
                return [
                  item('Open', () => openView(v.id)),
                  sep,
                  item('Duplicate View', () => duplicateModelView(v.id)),
                  item('Rename…', () => setRenameView({ id: v.id, name: v.name })),
                  item('Delete', () => deleteModelView(v.id), { disabled: v.id === '3d' }),
                  sep,
                  item('Apply View Template', undefined, { disabled: !templates.length, submenu: templates.map((t) => item(t.name, () => applyTemplateToView(v.id, t))) }),
                ];
              })()}
            />
          ) : null}
          {vtMenu && m.model ? (
            <ContextMenu
              x={vtMenu.x}
              y={vtMenu.y}
              onClose={() => setVtMenu(null)}
              items={[
                item('Apply Template Properties to Current View', undefined, {
                  disabled: !templates.length,
                  submenu: templates.map((t) => item(t.name, () => applyViewTemplate(t))),
                }),
                item('Create Template from Current View', () => {
                  const t = templateFromView(`Structural 3D ${templates.length + 1}`, viewState());
                  setTemplates([...templates, t]);
                  setVtFocus({ id: t.id, rename: true });
                  setVtOpen(true);
                  m.log(`Created view template ${t.name} from the current view.`);
                }),
                item('Manage View Templates…', () => setVtOpen(true)),
              ]}
            />
          ) : null}
          <FileDiagnosisDialog
            diagnosis={diagnosis}
            onClose={() => setDiagnosis(null)}
            onChooseAnother={() => {
              const dxf = /\.dxf$/i.test(lastFile.current?.name ?? '');
              setDiagnosis(null);
              void (dxf ? openDxfFromDisk() : openFromDisk());
            }}
          />
          <ProposedMarksDialog
            rows={markProposal && m.model ? markProposal.map((r) => ({ label: elementLabel(m.model!.elements[r.index].globalId), level: m.model!.elements[r.index].level, mark: r.mark })) : null}
            busy={markBusy}
            onConfirm={() => void confirmMarks()}
            onClose={() => setMarkProposal(null)}
          />
          <SelectMarksDialog
            open={marksDialog}
            onClose={() => setMarksDialog(false)}
            onSelect={(t) => {
              if (selectByMarks(t)) setMarksDialog(false);
            }}
          />
          <ViewLinkDialog
            mode={linkDialog?.mode ?? null}
            link={linkDialog?.link ?? ''}
            share={{
              why: !m.model ? 'Open a model first.' : null,
              info: shareInfoState,
              mine: myShareList,
              onShare: shareOpenModel,
              onDelete: async (sh) => {
                await deleteShare(sh);
                setMyShareList(myShares());
                m.log(`Deleted the shared copy of ${sh.file}; its link no longer opens the model.`);
              },
            }}
            onClose={() => setLinkDialog(null)}
            onApply={(t) => {
              setLinkDialog(null);
              applyViewToken(t);
            }}
          />
          {dxt.menu && activeDoc ? <ContextMenu x={dxt.menu.x} y={dxt.menu.y} onClose={dxt.closeMenu} items={dxt.menuItems()} /> : null}
          <FloatingWindow id="dxf-qselect" title="Quick Select" subtitle={activeDoc?.name} open={dxt.quickSelectOpen && !!activeDoc} onClose={() => dxt.setQuickSelectOpen(false)} initial={{ x: Math.max(16, window.innerWidth - 420), y: 150, w: 380, h: 470 }} minWidth={320} minHeight={380} accent={activeDoc?.color}>
            {activeDoc && dxt.index ? (
              <QuickSelectPanel
                drawing={activeDoc.drawing}
                index={dxt.index}
                visible={dxt.visible}
                selection={activeDoc.selected?.entities ?? []}
                onApply={(ents) => {
                  dxt.selectObjects(ents);
                  setNotice(`Quick Select: ${fmtCount(ents.length)} ${ents.length === 1 ? 'object' : 'objects'} selected.`);
                }}
              />
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="dxf-find" title="Find" subtitle={activeDoc?.name} open={dxt.findOpen && !!activeDoc} onClose={() => dxt.setFindOpen(false)} initial={{ x: Math.max(16, window.innerWidth - 500), y: 150, w: 460, h: 440 }} minWidth={340} minHeight={260} accent={activeDoc?.color}>
            {activeDoc ? <FindTextPanel drawing={activeDoc.drawing} visibleSet={dxt.visibleSet} onPick={(e) => dxt.selectObjects([e], true)} onSelectAll={(ents) => dxt.selectObjects(ents, true)} /> : null}
          </FloatingWindow>
          {ctxMenu && m.model ? (
            <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={contextItems()} />
          ) : null}
          <FloatingWindow id="vg" title="Visibility/Graphics Overrides for 3D View" subtitle={info?.fileName} open={!!vgOpen && !!m.model} onClose={() => setVgOpen(null)} initial={{ w: 760, h: 460 }} minWidth={560} minHeight={300}>
            {m.model ? (
              <VisibilityGraphicsDialog
                categories={Object.entries(m.model.info.categories).map(([id, n]) => ({ id, label: CATEGORY_PLURAL[id as Category] ?? id, count: n ?? 0 }))}
                value={graphics.categories}
                applied={graphics.applied}
                filters={graphics.filters}
                focus={vgOpen?.focus}
                onApply={applyViewGraphics}
                onEditFilters={() => setFiltersOpen(true)}
                onClose={() => setVgOpen(null)}
              />
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="filters" title="Filters" open={filtersOpen && !!m.model} onClose={() => setFiltersOpen(false)} initial={{ w: 820, h: 520 }} minWidth={640} minHeight={360}>
            {m.model ? (
              <FiltersManager
                filters={graphics.filters}
                categories={Object.entries(m.model.info.categories).map(([id, n]) => ({ id, label: CATEGORY_PLURAL[id as Category] ?? id, count: n ?? 0 }))}
                elements={m.model.elements}
                onApply={applyFilterDefs}
                onClose={() => setFiltersOpen(false)}
              />
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="view-templates" title="View Templates" open={vtOpen} onClose={() => setVtOpen(false)} initial={{ w: 820, h: 460 }} minWidth={620} minHeight={320}>
            <ViewTemplatesDialog templates={templates} current={viewState()} onChange={setTemplates} onApplyToView={applyViewTemplate} onClose={() => setVtOpen(false)} onLog={m.log} focus={vtFocus} />
          </FloatingWindow>
          <FloatingWindow id="rename-view" title="Rename View" open={!!renameView} onClose={() => setRenameView(null)} initial={{ w: 380, h: 150 }} minWidth={320} minHeight={140}>
            {renameView ? (
              <form
                className="vg vg--small"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = renameView.name.trim();
                  if (name) setViews((vs) => vs.map((x) => (x.id === renameView.id ? { ...x, name } : x)));
                  setRenameView(null);
                }}
              >
                <label className="vg-field">
                  <span>Name</span>
                  <input className="flt-input" aria-label="View name" autoFocus value={renameView.name} onChange={(e) => setRenameView({ ...renameView, name: e.target.value })} />
                </label>
                <div className="vg-actions">
                  <span className="app-spacer" />
                  <Button size="sm" variant="primary" type="submit">OK</Button>
                  <Button size="sm" type="button" onClick={() => setRenameView(null)}>Cancel</Button>
                </div>
              </form>
            ) : null}
          </FloatingWindow>
          <FloatingWindow id="vg-element" title="View-Specific Element Graphics" open={elemVgOpen && sel.length > 0} onClose={() => setElemVgOpen(false)} initial={{ w: 420, h: 260 }} minWidth={360} minHeight={220}>
            <ElementGraphicsDialog count={sel.length} value={sel.length ? graphics.elements[sel[0]] ?? {} : {}} onApply={applyElementGraphics} onClose={() => setElemVgOpen(false)} />
          </FloatingWindow>
          <MarkRulesDialog open={markDialog} rules={m.markRules} defaults={DEFAULT_MARK_RULES} elements={m.model?.elements ?? []} onSave={(r) => history.run('Mark rules', (t) => t.change('mark-rules', m.markRules, r, (x) => void m.setMarkRules(x)))} onClose={() => setMarkDialog(false)} />
          <MarkRulesDialog
            open={gradeDialog}
            title="Grade rules"
            intro="Property names read as the concrete grade, first match wins; elements with no match use their IFC material name."
            rules={m.gradeRules}
            defaults={DEFAULT_GRADE_RULES}
            sourceField="gradeSource"
            elements={m.model?.elements ?? []}
            onSave={(r) => history.run('Grade rules', (t) => t.change('grade-rules', m.gradeRules, r, (x) => void m.setGradeRules(x)))}
            onClose={() => setGradeDialog(false)}
          />
          {notice ? (
            <p className="app-notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>}</div>
                    <div className="sk-shell__viewbar">{activeDoc ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => drawingView.current?.fit()} title="Zoom extents (ZF, Home, double middle-click)">
              Fit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dxt.act('zoomWindow')} aria-pressed={dxt.tool === 'zoomWindow'} title="Zoom window: drag a rectangle (ZR)">
              Zoom window
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dxt.act('zoomPrevious')} title="Zoom previous (ZP)">
              Previous
            </Button>
            <span className="app-divider" aria-hidden="true" />
            <Button size="sm" variant="ghost" onClick={() => dxt.act('quickSelect')} title="Quick select by type, layer and colour">
              Quick select
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dxt.act('find')} title="Find text in the drawing">
              Find
            </Button>
            <span className="app-spacer" />
            <span className="app-hint">2D · Right-click for the AutoCAD menu · Middle-drag pan · Wheel zoom · Double middle-click fit</span>
          </>
        ) : (
        <>
          <Button size="sm" variant="ghost" onClick={() => viewport.current?.fit()} title="Zoom to fit (ZF)">
            Fit
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={gridOn} disabled={!m.model} onClick={() => setGridOn((g) => !g)} title="The grid under the model: in plans and elevations as in CAD, in 3D on the ±0 ground (red X, green Y)">
            Grid: {gridOn ? 'On' : 'Off'}
          </Button>
          <span className="app-divider" aria-hidden="true" />
          <VisualStyleMenu styles={STYLES} value={displayStyle} onChange={setDisplayStyle} />
          <Button size="sm" variant="ghost" aria-pressed={shadows} disabled={!m.model || isTwoD(activeModelView ?? undefined)} onClick={() => setShadows((v) => !v)} title="Ground shadows from the sun (lightweight: one extra draw)">
            Shadows: {shadows ? 'On' : 'Off'}
          </Button>
          <span className="app-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" onClick={() => runCommand('sectionBox')} disabled={!m.model || (!sectionBox && !sel.length)} title="Section box around the selection (BX)">
            Section box: {sectionBox ? 'On' : 'Off'}
          </Button>
          {explode && !isTwoD(activeModelView ?? undefined) ? (
            <span className="app-explode" role="group" aria-label="Exploded view">
              <label htmlFor="explode-spread" title={`Exploded view: ${EXPLODE_MODES.filter((md) => explode.modes.includes(md.id)).map((md) => md.label.toLowerCase()).join(' + ')}`}>Spread</label>
              <input
                id="explode-spread"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(explode.amount * 100)}
                onChange={(e) => setExplode({ modes: explode.modes, amount: Number(e.target.value) / 100 })}
              />
              <output htmlFor="explode-spread">{Math.round(explode.amount * 100)} %</output>
              <Button size="sm" variant="ghost" onClick={() => setExplode(null)} title="Put the model back together">
                Collapse
              </Button>
            </span>
          ) : null}
          <span className="app-hidemenu">
            <Button size="sm" variant="ghost" aria-expanded={hideMenu} disabled={!m.model} onClick={() => setHideMenu((o) => !o)} title="Temporary Hide/Isolate">
              <Icon name="isolate" size={16} /> Hide/Isolate
            </Button>
            {hideMenu ? (
              <span className="app-hidemenu__list" role="menu" onClick={() => setHideMenu(false)}>
                {(
                  [
                    ['isolateCategory', 'Isolate Category', 'IC'],
                    ['hideCategory', 'Hide Category', 'HC'],
                    ['isolateElement', 'Isolate Element', 'HI'],
                    ['hideElement', 'Hide Element', 'HH'],
                    ['resetHidden', 'Reset Temporary Hide/Isolate', 'HR'],
                  ] as const
                ).map(([cmd, label, key]) => (
                  <button key={cmd} type="button" role="menuitem" disabled={cmd === 'resetHidden' ? !hidden.length : !sel.length} onClick={() => runCommand(cmd)}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </button>
                ))}
              </span>
            ) : null}
          </span>
          <Button size="sm" variant="ghost" aria-pressed={reveal} disabled={!m.model} onClick={() => runCommand('revealHidden')} title="Reveal Hidden Elements (RH)">
            <Icon name="reveal" size={16} />
          </Button>
          {reveal && sel.some((i) => hidden.includes(i)) ? (
            <Button size="sm" variant="ghost" onClick={() => runCommand('unhideElement')} title="Unhide the selected elements (EU)">
              Unhide
            </Button>
          ) : null}
        </>
        )}</div>
                  </div>
                );
              case 'properties':
                return activeDoc ? (
                  <DrawingProperties doc={activeDoc} onUnits={(u) => dx.update(activeDoc.id, { units: u })} />
                ) : (
                  <PropertiesPanel
                    model={m.model}
                    selection={sel}
                    properties={m.properties}
                    onEditMarkRules={() => setMarkDialog(true)}
                    revit={revitProps}
                    view={
                      dimPropsFor(sel) ??
                      symbolPropsFor(sel) ??
                      (activeModelView
                        ? {
                            kind: KIND_LABEL[activeModelView.kind],
                            name: activeModelView.name,
                            rows: [
                              { section: 'Identity Data', label: 'View Name', value: activeModelView.name, onCommit: (s: string) => s.trim() && setViews((vs) => vs.map((x) => (x.id === activeModelView.id ? { ...x, name: s.trim() } : x))) },
                              ...(activeModelView.kind === 'plan'
                                ? [
                                    { section: 'Extents', label: 'Associated Level', value: activeModelView.level ?? '' },
                                    {
                                      section: 'View Range',
                                      label: 'Cut Plane Offset',
                                      unit: 'mm',
                                      value: Math.round((activeModelView.cutOffset ?? DEFAULT_CUT) * 1000),
                                      onCommit: (txt: string) => {
                                        const cut = Number(txt) / 1000, depth = activeModelView.depthOffset ?? DEFAULT_DEPTH_OFFSET;
                                        if (!validRange(cut, depth)) return setNotice('The cut plane must be above the view depth.');
                                        setViewRange(activeModelView.id, { cutOffset: cut });
                                      },
                                    },
                                    {
                                      section: 'View Range',
                                      label: 'View Depth Offset',
                                      unit: 'mm',
                                      value: Math.round((activeModelView.depthOffset ?? DEFAULT_DEPTH_OFFSET) * 1000),
                                      onCommit: (txt: string) => {
                                        const depth = Number(txt) / 1000, cut = activeModelView.cutOffset ?? DEFAULT_CUT;
                                        if (!validRange(cut, depth)) return setNotice('The view depth must be below the cut plane.');
                                        setViewRange(activeModelView.id, { depthOffset: depth });
                                      },
                                    },
                                  ]
                                : []),
                              ...(activeModelView.kind === 'section' && activeModelView.section
                                ? [{ section: 'Extents', label: 'Far Clip Offset', unit: 'mm', value: Math.round(activeModelView.section.depth * 1000), onCommit: (s: string) => Number(s) > 0 && setViewRange(activeModelView.id, { section: { ...activeModelView.section!, depth: Number(s) / 1000 } }) }]
                                : []),
                              { section: 'Graphics', label: 'Visual Style', value: STYLES.find((st) => st.id === displayStyle)?.label ?? displayStyle },
                              { section: 'Graphics', label: 'Edges', value: edges ? 'On' : 'Off' },
                              { section: 'Graphics', label: 'Show Hidden Lines', value: activeModelView.hiddenLines ? 'On' : 'Off' },
                            ],
                          }
                        : undefined)
                    }
                  />
                );
              case 'browser':
                return activeDoc ? (
                  <LayersPanel doc={activeDoc} onChange={(on) => dx.update(activeDoc.id, { layerOn: on })} />
                ) : (
                  <Browser
                    model={m.model}
                    onSelectLevel={selectLevel}
                    onSelectCategory={selectCategory}
                    activeId={browserFocus ?? (activeModelView ? `view:${activeModelView.id}` : undefined)}
                    views={views.map((v) => ({ id: v.id, kind: v.kind, name: v.name }))}
                    onOpenView={(id) => {
                      setBrowserFocus(undefined);
                      openView(id);
                    }}
                    onViewMenu={(id, x, y) => setViewMenu({ id, x, y })}
                    onSelectElements={(idx) => {
                      m.setSelection(idx);
                      setNotice(`${idx.length} selected.`);
                    }}
                  />
                );
              case 'activity':
                return m.activity.length ? (
                  <ol className="app-activity">
                    {m.activity.map((a) => (
                      <li key={a.id} className={a.tone === 'error' ? 'is-error' : undefined}>
                        <time>{a.time.toLocaleTimeString()}</time> {a.text}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="app-empty-note">Nothing yet. Open a model and its load times appear here.</p>
                );
              case 'colour':
                return <ColorPanel settings={colorSettings} result={colorResult} hasModel={!!m.model} onChange={setColorSettings} onSelect={(els) => inModel(() => m.setSelection(els))} />;
              case 'qa':
                return <QaPanel report={qaReport} {...qaActions} onShowInRevit={revitLinked ? showInRevit : undefined} fixFor={canParams ? qaFix : undefined} />;
              case 'console':
                return (
                  <ConsolePanel
                    model={m.model}
                    selection={sel}
                    onAction={(a) => {
                      const ids = a.indices ?? [];
                      if (a.type === 'select') m.setSelection(ids);
                      else if (a.type === 'isolate' && m.model) {
                        const keep = new Set(ids);
                        setHidden(m.model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
                      } else if (a.type === 'hide') setHidden((h) => [...new Set([...h, ...ids])]);
                      else if (a.type === 'reset') setHidden([]);
                      else if (a.type === 'fit') viewport.current?.fit(a.indices ?? undefined);
                    }}
                  />
                );
              default:
                return null;
            }
          }}
        />
      }
      statusBar={
        <StatusBar>
          {activeDoc ? (
            <>
              <span className="app-coords" aria-label={`Cursor position, ${activeDoc.units}`} title={`Cursor X, Y, Z in ${activeDoc.units}`}>
                {cursor ? formatPoint(cursor.x, cursor.y) : '—, —, 0.000'}
              </span>
              <span className="app-divider" aria-hidden="true" />
              <span className="app-model-tab" title="Model space">MODEL</span>
              <span className="app-drafting" role="group" aria-label="Drafting aids">
                <button type="button" className="app-panel-toggle" aria-pressed={dxt.display.grid} title="Grid display (F7)" onClick={() => dxt.act('grid')}>
                  Grid
                </button>
                <button type="button" className="app-panel-toggle" aria-pressed={dxt.display.ucsIcon} title="UCS icon at the origin" onClick={() => dxt.act('ucsIcon')}>
                  UCS
                </button>
                <button
                  type="button"
                  className="app-panel-toggle"
                  aria-pressed={dxt.display.crosshair !== 'off'}
                  title={`Crosshair: ${{ small: 'small', full: 'full screen', off: 'off' }[dxt.display.crosshair]}. Click to change`}
                  onClick={() => dxt.act(`crosshair:${({ small: 'full', full: 'off', off: 'small' } as const)[dxt.display.crosshair]}`)}
                >
                  Crosshair{dxt.display.crosshair === 'full' ? ' (full)' : ''}
                </button>
                <button type="button" className="app-panel-toggle" aria-pressed={dxt.quickProperties} title="Quick Properties panel for the selection" onClick={() => dxt.act('quickProperties')}>
                  QP
                </button>
              </span>
              <span className="app-divider" aria-hidden="true" />
              {activeDoc.selected ? <StatusChip>{fmtCount(activeDoc.selected.entities.length)} selected</StatusChip> : null}
              <StatusChip>Layers {fmtCount(activeDoc.layerOn.filter(Boolean).length)} / {fmtCount(activeDoc.layerOn.length)} on</StatusChip>
            </>
          ) : (
          <>
          <span className="app-sel">
            {toolStatus ? (
              <span className="app-pick-status" role="status">
                {toolStatus.prompt}
                {toolStatus.snap ? ` · ${toolStatus.snap}` : ''}
              </span>
            ) : (
              <>
                {sel.length ? <span className="app-sel__dot" aria-hidden="true" /> : null}
                {selLabel}
              </>
            )}
          </span>
          {info ? <span className="app-divider" aria-hidden="true" /> : null}
          {info
            ? Object.entries(info.categories).map(([c, n]) => (
                <StatusChip key={c}>
                  {CATEGORY_PLURAL[c as Category]} {fmtCount(n ?? 0)}
                </StatusChip>
              ))
            : null}
          </>
          )}
          <span className="app-spacer" />
          <button
            type="button"
            className={`app-panel-toggle app-revit-status app-revit-status--${revit.phase}${revitLinked ? ' is-linked' : ''}`}
            aria-pressed={wins.revit}
            title={revit.phase === 'connected' ? `Revit: ${revit.document?.title ?? 'no model open'}${revitLinked ? ' · selection in sync' : ''}` : 'Connect to Revit'}
            onClick={() => (wins.revit ? toggleWin('revit', false) : openRevit())}
          >
            <span className="app-revit__dot" aria-hidden="true" />
            {revit.phase === 'connected' ? `Revit · ${revit.document?.title ?? 'no model'}${liveCount ? ` · ${liveCount} changed` : ''}${pending.length ? ` · ${pending.length} to apply` : ''}` : revit.phase === 'unpaired' ? 'Revit · pair' : 'Revit'}
          </button>
          {qaReport ? (
            <>
              <button type="button" className="app-panel-toggle app-qa-status" aria-pressed={openPanels.includes('qa')} title="QA checks: open the QA panel" onClick={() => dock.current?.open('qa')}>
                {(() => {
                  const n = (s: string) => qaReport.findings.filter((f) => f.severity === s).length;
                  const e = n('error'), w = n('warning');
                  return e || w ? `QA: ${[e && `${fmtCount(e)} ${e === 1 ? 'error' : 'errors'}`, w && `${fmtCount(w)} ${w === 1 ? 'warning' : 'warnings'}`].filter(Boolean).join(' · ')}` : 'QA: no errors';
                })()}
              </button>
              <span className="app-divider" aria-hidden="true" />
            </>
          ) : null}
          <LocalIndicator />
          <span className="app-divider" aria-hidden="true" />
          <button
            type="button"
            className="app-panel-toggle"
            aria-pressed={openPanels.includes('console')}
            title="Show or hide the bottom panels (Ctrl + `)"
            onClick={() => dock.current?.toggleBottom()}
          >
            Panel
          </button>
          <span className="app-divider" aria-hidden="true" />
          <span className="app-faint">
            {activeDoc ? `DXF ${activeDoc.drawing.info.release} · ` : info ? `${info.schema} · ${info.units.length} · ` : ''}v{APP_VERSION} · engine {ENGINE_VERSION}
          </span>
        </StatusBar>
      }
    />
  );
}

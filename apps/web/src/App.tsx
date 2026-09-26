import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  RibbonTabs,
  StatusBar,
  StatusChip,
  TitleBar,
  ViewTabs,
  isEditableTarget,
  TOGGLE_BOTTOM_PANEL,
  useShortcut,
  useTheme,
} from '@shanku/ui';
import {
  runChecks,
  CATEGORY_PLURAL,
  DEFAULT_GRADE_RULES,
  DEFAULT_MARK_RULES,
  ENGINE_VERSION,
  EXPLODE_MODES,
  boxState,
  type ExplodeMode,
  type CameraState,
  type Category,
  type DisplayStyle,
  type PipelineQa,
  type SectionBoxState,
  projectZeroY,
  MEASURE_MODES,
  DIMENSION_TOOLS,
  dimensionSummary,
  dimensionValues,
  followModel,
  type DimensionKind,
  type PlacedDimension,
  type Vec3,
  type MeasureMode,
} from '@shanku/engine';
import { Browser } from './components/Browser';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport, type ViewportHandle } from './components/Viewport';
import { fmtCount } from './lib/format';
import { fileFromDrop, pickFile, pickIfcFile, unpack } from './lib/openFile';
import { useDrawings } from './lib/useDrawings';
import { nextDocColor } from './lib/documents';
import { DrawingView, type DrawingViewHandle } from './components/DrawingView';
import { DrawingProperties, LayersPanel } from './components/DrawingPanels';
import { MarkRulesDialog } from './components/MarkRulesDialog';
import { BoqWindow } from './components/BoqWindow';
import { ConsolePanel } from './components/ConsolePanel';
import { PipelinePanel } from './components/PipelinePanel';
import { qaFocus, usePipeline } from './lib/usePipeline';
import { useHistory } from './lib/useHistory';
import { loadDrawings, loadGraphics, loadModel, loadViews, saveViews } from './lib/session';
import { endTask, startTask, updateTask, useTasks, withTask } from './lib/progress';
import { BuildProgress } from './components/BuildProgress';
import { downloadFile } from './lib/excel';
import { marksFor } from './lib/viewMarks';
import { editSection } from './lib/views';
import { DEFAULT_CUT, DEFAULT_DEPTH_OFFSET, KIND_LABEL, defaultViews, duplicateView, isTwoD, levelHeights, nextSectionName, normalizeView, sectionFromVerticalView, validRange, viewClip, viewDirection, type ModelView } from './lib/views';
import { enterFullscreen } from './lib/fullscreen';
import { QuickAccess } from './components/QuickAccess';
import { StartPage } from './components/StartPage';
import { SAMPLES, sampleUrl, type SampleBuilding } from './lib/samples';
import { ContextMenu, item, sep, type MenuItem } from './components/ContextMenu';
import { ElementGraphicsDialog, VisibilityGraphicsDialog } from './components/VisibilityGraphics';
import { FiltersManager } from './components/Filters';
import { ViewTemplatesDialog } from './components/ViewTemplates';
import { applyTemplate, loadTemplates, saveTemplates, templateFromView, type ViewState, type ViewTemplate } from './lib/viewTemplates';
import type { AppliedFilter, ViewFilter } from './lib/filters';
import { EMPTY_GRAPHICS, countOverrides, resolveGraphics, type CategoryOverrides, type GraphicsOverride, type ViewGraphics } from './lib/visibility';
import { DockWorkspace, type DockWorkspaceHandle, type PanelId } from './components/DockWorkspace';
import { emptyRates, loadRates, saveRates, type RateBook } from './lib/rates';
import { useShankuModel } from './lib/useShankuModel';
import { SHORTCUT_HELP, createSequenceReader, type CommandId } from './lib/shortcuts';
import { sequenceKeys, type AppCommand } from './lib/commands';
import { CommandPalette, type ElementHit } from './components/CommandPalette';
import { GuidePanel } from './components/GuidePanel';
import { RevitPanel } from './components/RevitPanel';
import { RevitChanges } from './components/RevitChanges';
import { TypeProperties } from './components/TypeProperties';
import { ExportToRevit, type ExportState } from './components/ExportToRevit';
import { approvedOnly } from './lib/exportPlan';
import { afterApply, byGroup, changeKey, commonParams, effectiveCommon, stageEdit, type PendingChange, type RevitElementParams } from './lib/paramEdits';
import { RevitBridge, indicesForRevitSelection } from './lib/revitBridge';
import { NO_CHANGES, addChanges, changeCount, remapIndices, remapRecord, toExport, withoutMerged, type ChangeSet } from './lib/liveUpdate';
import { QaPanel } from './components/QaPanel';
import { ColorLegendOverlay, ColorPanel } from './components/ColorPanel';
import { COLOR_MODES, computeColors, loadColorSettings, mergeOverrides, saveColorSettings, type ColorMode, type ColorSettings } from './lib/colorBy';
import { FileDiagnosisDialog, ProposedMarksDialog, SelectMarksDialog, ViewLinkDialog } from './components/SmallDialogs';
import { looksLikeMarks, matchMarks, parseMarkList, proposeMarks } from './lib/marks';
import type { Finding } from '@shanku/engine';
import { WhatNow, type Intent } from './components/WhatNow';
import { diagnoseFile, type Diagnosis } from './lib/fileDiagnosis';
import { decodeViewToken, hiddenForLink, viewLinkUrl, type ViewToken } from './lib/viewLink';
import { useDrawingTools } from './lib/useDrawingTools';
import { FindTextPanel, QuickProperties, QuickSelectPanel } from './components/DrawingTools';
import { formatPoint } from './lib/drawingTools';

const APP_VERSION = '0.47.0';
const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent', keys: 'CO' },
  { id: 'hiddenLine', label: 'Hidden line', keys: 'HL' },
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
  { id: 'realistic', label: 'Realistic', keys: '' },
];
// Revit comes last, where Revit puts add-in tabs.
const RIBBON_TABS = ['Model', 'Annotate', 'View', 'Manage', 'Revit'].map((label) => ({ id: label.toLowerCase(), label }));


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
  const openedInfoRef = useRef<import('@shanku/engine').ParsedModel['info'] | undefined>(undefined);
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
  // ---- Views (Revit Project Browser): each keeps its graphics, style, edges, camera, hides, box
  const [views, setViews] = useState<ModelView[]>([]);
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const [openViews, setOpenViews] = useState<string[]>(['3d']);
  const loadedView = useRef('3d');
  const camStore = useRef(new Map<string, CameraState>());
  const hideStore = useRef(new Map<string, number[]>());
  const boxStore = useRef(new Map<string, SectionBoxState | null>());
  const [viewMenu, setViewMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameView, setRenameView] = useState<{ id: string; name: string } | null>(null);
  const [sectionTool, setSectionTool] = useState(false);
  const sectionA = useRef<[number, number] | null>(null);
  // Selected view symbols (levels, sections, elevation marks), Revit-style alongside element selection.
  const [annSel, setAnnSel] = useState<string[]>([]);
  // Section grips: views and the section as they were when a drag started (one undo step per drag).
  const gripStart = useRef<{ views: ModelView[]; section: NonNullable<ModelView['section']> } | null>(null);
  const applyMode = (cur: string[], ids: string[], mode: 'replace' | 'add' | 'remove' | string) =>
    mode === 'add' ? [...new Set([...cur, ...ids])] : mode === 'remove' ? cur.filter((x) => !ids.includes(x)) : ids;
  // View Templates (kept on this device, shared by export / import)
  const [templates, setTemplatesState] = useState<ViewTemplate[]>(loadTemplates);
  const setTemplates = (t: ViewTemplate[]) => {
    setTemplatesState(t);
    saveTemplates(t);
  };
  const [vtOpen, setVtOpen] = useState(false);
  const [vtFocus, setVtFocus] = useState<{ id: string; rename: boolean } | null>(null);
  const [vtMenu, setVtMenu] = useState<{ x: number; y: number } | null>(null);
  const graphicsFor = useRef<string | null>(null);
  // Save the view's graphics per file (after they were loaded for it, so a reset never overwrites them).
  useEffect(() => {
    const name = m.model?.info.fileName;
    if (!name || graphicsFor.current !== name || !views.length) return;
    void saveViews(name, views.map((v) => (v.id === loadedView.current ? { ...v, graphics, displayStyle, edges } : v)));
  }, [graphics, displayStyle, edges, views, m.model?.info.fileName]);
  // Reload: bring back the model and drawings that were open (unless the homepage handed over a file).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || start?.file || start?.sample) return;
    restored.current = true;
    void (async () => {
      const model = await loadModel();
      if (model) {
        m.log(`Restored ${model.name} from your last session.`);
        await m.open(model);
      }
      for (const d of await loadDrawings()) await dx.open(d).catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lastCommand, setLastCommand] = useState<{ id: CommandId; label: string } | null>(null);
  // Select Previous: the last non-empty selection before the current one.
  const prevSelection = useRef<number[]>([]);
  const curSelection = useRef<number[]>([]);
  const [reveal, setReveal] = useState(false);
  // Revit-style transactions: every undoable change goes through history.run(...)
  const history = useHistory();
  const [zoomRegion, setZoomRegion] = useState(false);
  const [activeView, setActiveView] = useState<string>('3d');
  const [markDialog, setMarkDialog] = useState(false);
  const [gradeDialog, setGradeDialog] = useState(false);
  const dock = useRef<DockWorkspaceHandle>(null);
  const [openPanels, setOpenPanels] = useState<PanelId[]>([]);
  // Revit-style windows (float above everything, ribbon included)
  const [wins, setWins] = useState({ boq: false, pipeline: false, keys: false, guide: false, revit: false, changes: false, typeProps: false, exportRevit: false });
  // Guide & FAQ (F1): which section to open on
  const [guideSection, setGuideSection] = useState<string | undefined>(undefined);
  const openGuide = (section?: string) => {
    setGuideSection(section);
    setWins((w) => ({ ...w, guide: true }));
  };
  // Exploded view (3D views only): mode and spread 0-1; display only, reset for every new file.
  // Exploded view: any combination of storeys, radial and categories (they add up).
  const [explode, setExplode] = useState<{ modes: ExplodeMode[]; amount: number } | null>(null);
  const toggleWin = (k: keyof typeof wins, v?: boolean) => setWins((w) => ({ ...w, [k]: v ?? !w[k] }));

  // ---- Revit bridge (docs/bridge/protocol.md): load from Revit and keep the selection in step
  const bridge = useMemo(() => new RevitBridge(), []);
  const revit = useSyncExternalStore(bridge.subscribe, bridge.getState);
  const [revitLoading, setRevitLoading] = useState(false);
  /** The Revit document the open model came from; selection syncs only with that one. */
  const [revitLink, setRevitLink] = useState<{ key: string; fileName: string } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem('shanku.revitLink') ?? 'null');
    } catch {
      return null;
    }
  });
  const [revitSync, setRevitSync] = useState(() => localStorage.getItem('shanku.revitSync') !== 'off');
  const fromRevit = useRef(false);
  useEffect(() => {
    // Paired before: reconnect quietly (no new permission prompt). Otherwise wait for the user.
    if (bridge.hasToken) void bridge.connect();
    return () => bridge.dispose();
  }, [bridge]);
  useEffect(() => {
    try {
      localStorage.setItem('shanku.revitSync', revitSync ? 'on' : 'off');
      if (revitLink) localStorage.setItem('shanku.revitLink', JSON.stringify(revitLink));
    } catch {
      /* storage unavailable */
    }
  }, [revitSync, revitLink]);
  const openRevit = () => {
    toggleWin('revit', true);
    if (revit.phase === 'idle') void bridge.connect();
  };
  /** Selects Shanku's selection in Revit now (works with sync off too). */
  const sendSelectionToRevit = async () => {
    const doc = revit.document;
    if (!doc || !m.model) return;
    const picked = m.selection.map((i) => m.model!.elements[i]).filter(Boolean);
    try {
      const r = await bridge.select(doc.key, picked.map((e) => e.globalId), picked.map((e) => Number(e.tag) || 0));
      setNotice(picked.length ? `Selected ${r.selected} in Revit${r.missing ? `; ${r.missing} not found there` : ''}.` : 'Cleared the selection in Revit.');
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    }
  };
  /** Selects these elements in Revit, whatever Shanku has selected. */
  const sendSelectionToRevitFor = async (els: number[]) => {
    const doc = revit.document;
    if (!doc || !m.model) return;
    const picked = els.map((i) => m.model!.elements[i]).filter(Boolean);
    try {
      const r = await bridge.select(doc.key, picked.map((e) => e.globalId), picked.map((e) => Number(e.tag) || 0));
      setNotice(`Selected ${r.selected} in Revit${r.missing ? `; ${r.missing} not found there` : ''}.`);
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    }
  };
  /** Takes Revit's current selection into Shanku. */
  const getSelectionFromRevit = async () => {
    if (!m.model) return;
    try {
      const r = await bridge.revitSelection();
      const found = indicesForRevitSelection(m.model.elements, r.globalIds, []);
      fromRevit.current = true;
      m.setSelection(found);
      setNotice(r.globalIds.length ? `Took ${found.length} of ${r.globalIds.length} selected in Revit${found.length < r.globalIds.length ? ' (the rest are not in this model)' : ''}.` : 'Nothing is selected in Revit.');
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    }
  };

  /** Revit exports its open model; Shanku opens it and links it for selection sync. */
  const loadFromRevit = async () => {
    setRevitLoading(true);
    try {
      const r = await withTask('revit', 'Loading from Revit', 'Revit is exporting the model as IFC4 (the Revit model is not changed)…', () => bridge.loadModel());
      const size = r.bytes.byteLength; // read before the loader takes the buffer (it is transferred to a worker)
      await m.open({ name: r.name, bytes: r.bytes });
      setRevitLink({ key: r.key, fileName: r.name });
      try {
        localStorage.removeItem(`shanku.revitUpdated.${r.name}`); // a full load is up to date
      } catch {
        /* nothing to clear */
      }
      m.log(`Loaded ${r.title} from Revit (${(size / 1e6).toFixed(1)} MB). Selection follows Revit.`);
    } catch (e) {
      setNotice(`Could not load from Revit: ${(e as Error).message}`);
    } finally {
      setRevitLoading(false);
    }
  };
  useShortcut(TOGGLE_BOTTOM_PANEL, () => dock.current?.toggleBottom(), { allowInEditable: true });
  useShortcut({ code: 'F1' }, () => (wins.guide ? toggleWin('guide', false) : openGuide()), { allowInEditable: true });
  const [rates, setRates] = useState<RateBook>(emptyRates);
  useEffect(() => {
    if (m.model) setRates(loadRates(m.model.info.fileName));
  }, [m.model?.info.fileName]); // eslint-disable-line react-hooks/exhaustive-deps
  const applyRates = useCallback(
    (book: RateBook) => {
      setRates(book);
      if (m.model) saveRates(m.model.info.fileName, book);
    },
    [m.model],
  );
  const ratesRef = useRef(rates);
  ratesRef.current = rates;
  const changeRates = useCallback(
    (book: RateBook) => history.run('Edit BOQ rates', (t) => t.change('boq-rates', ratesRef.current, book, applyRates)),
    [history, applyRates],
  );
  const boqSelect = useCallback(
    (ids: number[], mode: 'replace' | 'add' | 'remove') => {
      setActiveView('3d');
      if (mode === 'replace') m.setSelection(ids);
      else if (mode === 'add') m.setSelection([...new Set([...m.selection, ...ids])]);
      else {
        const drop = new Set(ids);
        m.setSelection(m.selection.filter((i) => !drop.has(i)));
      }
    },
    [m],
  );
  const [ifcColor, setIfcColor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drawingView = useRef<DrawingViewHandle>(null);
  const ifcColorRef = useRef<string | null>(null);
  ifcColorRef.current = ifcColor;
  const dx = useDrawings(
    useCallback(() => (ifcColorRef.current ? [ifcColorRef.current] : []), []),
    m.log,
  );
  const activeDoc = dx.docs.find((d) => d.id === activeView) ?? null;

  // A new model starts with nothing hidden and no section box.
  // Keyed on the file (info), not the model object: re-detecting marks or grades replaces the model
  // object but is the same document, and must not reset the view or the undo history.
  useEffect(() => {
    setHidden([]);
    setSectionBox(false);
    setExplode(null);
    setGraphics(EMPTY_GRAPHICS);
    graphicsFor.current = null;
    history.clear();
    camStore.current.clear();
    hideStore.current.clear();
    boxStore.current.clear();
    loadedView.current = '3d';
    setOpenViews(['3d']);
    const name = m.model?.info.fileName;
    const defaults = m.model ? defaultViews(m.model.info.levels, levelHeights(m.model.info.levels, m.model.elements, m.model.info.units.length, projectZeroY(m.model))) : [];
    setViews(defaults);
    viewport.current?.setViewMode({ nav2d: false, grips: true });
    if (name)
      void (async () => {
        const saved = await loadViews<ModelView[]>(name);
        if (saved?.length) {
          // Keep saved views (renamed, duplicated, sections), and add plans for levels they lack.
          const have = new Set(saved.map((v) => v.id));
          const merged = [...saved.map(normalizeView), ...defaults.filter((d) => !have.has(d.id))];
          setViews(merged);
          const v3 = merged.find((v) => v.id === '3d');
          if (v3) {
            setGraphics({ ...EMPTY_GRAPHICS, ...v3.graphics });
            setDisplayStyle(v3.displayStyle);
            setEdges(v3.edges);
          }
        } else {
          const g = await loadGraphics<ViewGraphics>(name); // sessions saved before views existed
          if (g) setGraphics({ ...EMPTY_GRAPHICS, ...g });
        }
        graphicsFor.current = name; // from now on, changes are saved for this file
      })();
    if (m.model) {
      setIfcColor((c) => c ?? nextDocColor(dx.docs.map((d) => d.color)));
      setActiveView('3d');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedInfo]);

  /** Why a file did not open (Structura item 13), shown in a dialog with export steps and a report. */
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  /** The first and last bytes of the last file opened: the worker takes the buffer, so keep these first. */
  const lastFile = useRef<{ name: string; size: number; head: Uint8Array; tail: Uint8Array } | null>(null);
  const snapshot = (file: { name: string; bytes: ArrayBuffer }) => {
    const n = file.bytes.byteLength;
    diagnosedFor.current = '';
    lastFile.current = { name: file.name, size: n, head: new Uint8Array(file.bytes.slice(0, 65536)), tail: new Uint8Array(file.bytes.slice(Math.max(0, n - 256))) };
    return lastFile.current;
  };
  const diagnose = (snap: NonNullable<typeof lastFile.current>, error?: string) =>
    setDiagnosis(diagnoseFile({ ...snap, error }, [`Shanku ${APP_VERSION} · engine ${ENGINE_VERSION}`, `Browser: ${navigator.userAgent}`]));
  /** Opens an IFC; a failure is diagnosed by the effect on m.load below. */
  const openModelFile = (file: { name: string; bytes: ArrayBuffer }) => {
    snapshot(file);
    return m.open(file);
  };
  const diagnosedFor = useRef('');
  useEffect(() => {
    const snap = lastFile.current;
    if (m.load.status !== 'error' || !snap || diagnosedFor.current === `${snap.name}:${snap.size}`) return;
    diagnosedFor.current = `${snap.name}:${snap.size}`;
    diagnose(snap, m.load.message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.load]);

  const openDrawing = useCallback(
    async (file: { name: string; bytes: ArrayBuffer }) => {
      const snap = snapshot(file);
      try {
        const id = await dx.open(file);
        if (id) setActiveView(id);
      } catch (e) {
        diagnose(snap, e instanceof Error ? e.message : String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dx],
  );

  const openDxfFromDisk = useCallback(async () => {
    try {
      const file = await pickFile('dxf');
      if (file) await openDrawing(file);
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m, openDrawing]);

  // ---- DXF -> 3D pipeline
  const pipeline = usePipeline({
    getClient: dx.getClient,
    openDrawing: dx.open,
    openModel: async (f) => {
      await m.open(f);
      setActiveView('3d');
    },
    log: m.log,
    showWindow: () => toggleWin('pipeline', true),
  });
  const pipe = pipeline.state;

  const showQa = useCallback(
    (q: PipelineQa) => {
      const doc = dx.docs.find((d) => d.name === pipe?.fileName);
      if (!doc) return setNotice('The drawing is still opening in 2D; try again in a moment.');
      setActiveView(doc.id);
      const b = qaFocus(q);
      if (b) setTimeout(() => drawingView.current?.zoomTo(b[0], b[1], b[2], b[3]), 80);
    },
    [dx.docs, pipe?.fileName],
  );

  const closeView = (id: string) => {
    if (id !== '3d' && viewsRef.current.some((v) => v.id === id)) {
      setOpenViews((o) => o.filter((x) => x !== id));
      if (activeView === id) setActiveView('3d');
      return;
    }
    if (id === '3d') {
      m.close();
      setIfcColor(null);
      setHidden([]);
      setSectionBox(false);
      setWins((w) => ({ ...w, boq: false }));
      m.log('Model closed.');
      if (dx.docs.length) setActiveView(dx.docs[0].id);
      return;
    }
    dx.close(id);
    if (id === activeView) setActiveView(m.model || dx.docs.length <= 1 ? '3d' : dx.docs.find((d) => d.id !== id)!.id);
  };

  const openFromDisk = useCallback(async () => {
    try {
      const file = await pickIfcFile();
      if (file) {
        diagnosedFor.current = '';
        await openModelFile(file);
      }
    } catch (e) {
      m.log(e instanceof Error ? e.message : String(e), 'error');
    }
  }, [m]);

  // Homepage hand-off: open what the visitor dropped or chose, once.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !start) return;
    started.current = true;
    const f = start.file;
    if (f && /\.dxf$/i.test(f.name)) void openDrawing(f);
    else if (f) void unpack(f).then(openModelFile); // an .ifc.gz dropped on the homepage opens too
    else if (start.sample) void openSampleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  /** Opens a sample building (the small frame by default); large ones are served gzipped and unpacked here. */
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const openSample = useCallback(async (sample: SampleBuilding = SAMPLES[0]) => {
    setSampleBusy(sample.id);
    try {
      const res = await fetch(sampleUrl(sample));
      if (!res.ok) return m.log(`The sample ${sample.title} could not be loaded.`, 'error');
      const file = await unpack({ name: sample.file, bytes: await res.arrayBuffer() });
      diagnosedFor.current = '';
      await m.open(file);
    } catch (e) {
      m.log(`The sample ${sample.title} could not be opened: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setSampleBusy(null);
    }
  }, [m]);
  const openSampleRef = useRef(openSample);
  openSampleRef.current = openSample;

  // Revit commands (two-letter sequences, Home, Esc).
  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (activeDoc) {
        if (cmd === 'fit') drawingView.current?.fit();
        else if (cmd === 'previous') dxtRef.current?.act('zoomPrevious');
        else if (cmd === 'zoomRegion') dxtRef.current?.act('zoomWindow');
        else setNotice('That command works in 3D views.');
        return;
      }
      const v = viewport.current;
      const model = m.model;
      if (!v || !model) return;
      const sel = m.selection;
      const needSelection = () => {
        setNotice('Select one or more elements first.');
        return false;
      };
      switch (cmd) {
        case 'fit':
          return v.fit();
        case 'previous':
          if (!v.previousView()) setNotice('No previous view.');
          return;
        case 'zoomRegion':
          setZoomRegion(true);
          return v.startZoomRegion();
        case 'hideElement': {
          if (!sel.length) return void needSelection();
          setHidden((h) => [...new Set([...h, ...sel])]);
          return m.setSelection([]);
        }
        case 'isolateElement': {
          if (!sel.length) return void needSelection();
          const keep = new Set(sel);
          return setHidden(model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
        }
        case 'isolateCategory': {
          if (!sel.length) return void needSelection();
          const cats = new Set(sel.map((i) => model.elements[i].category));
          return setHidden(model.elements.filter((e) => !cats.has(e.category)).map((e) => e.index));
        }
        case 'hideCategory': {
          if (!sel.length) return void needSelection();
          const cats = new Set(sel.map((i) => model.elements[i].category));
          setHidden((h) => [...new Set([...h, ...model.elements.filter((e) => cats.has(e.category)).map((e) => e.index)])]);
          return m.setSelection([]);
        }
        case 'visibilityGraphics':
          return setVgOpen({});
        case 'revealHidden':
          return setReveal((r) => !r);
        case 'unhideElement': {
          if (!sel.length) return void needSelection();
          const drop = new Set(sel);
          return setHidden((h) => h.filter((i) => !drop.has(i)));
        }
        case 'resetHidden':
          return setHidden([]);
        case 'measure':
          if (!model) return setNotice('Open a model to measure it.');
          return setMeasure((cur) => (cur ? null : 'distance'));
        case 'dimAligned':
        case 'spotElevation':
          if (!model) return setNotice('Open a model to dimension it.');
          return setDimTool(cmd === 'dimAligned' ? 'aligned' : 'spotElevation');
        case 'sectionBox': {
          if (isTwoD(activeModelView ?? undefined)) return setNotice('Section boxes are for 3D views; plans and sections have a view range (Properties).');
          if (!sectionBox && !sel.length) return void needSelection();
          const before = v.sectionBoxState();
          if (sectionBox) v.setSectionBox(null);
          else v.setSectionBox(sel);
          const after = v.sectionBoxState();
          // Revit records section box changes as undoable view edits
          history.run(sectionBox ? 'Remove section box' : 'Section box', (t) =>
            t.change('section-box', before, after, (st) => {
              viewport.current?.setSectionBoxState(st);
              setSectionBox(st !== null);
            }),
          );
          return sectionBox ? undefined : v.fit(sel);
        }
        case 'wireframe':
          return setDisplayStyle('wireframe');
        case 'hiddenLine':
          return setDisplayStyle('hiddenLine');
        case 'shaded':
          return setDisplayStyle('shaded');
        case 'consistent':
          return setDisplayStyle('consistent');
      }
    },
    [m, sectionBox, activeDoc],
  );

  useShortcut({ code: 'Escape' }, () => {
    if (sectionTool) return cancelSection();
    if (annSel.length) setAnnSel([]);
    if (dimSel.length) setDimSel([]);
    if (activeDoc) dx.select(activeDoc.id, null);
    else if (zoomRegion) viewport.current?.cancelZoomRegion();
    else m.setSelection([]);
  });
  useEffect(() => {
    if (curSelection.current.length && curSelection.current.join() !== m.selection.join()) prevSelection.current = curSelection.current;
    curSelection.current = m.selection;
  }, [m.selection]);

  // Delete: selected sections go with their views (Revit), as one undoable step.
  useShortcut({ code: 'Delete' }, () => {
    if (dimSel.length && activeView) {
      deleteDimensions(dimSel);
      return;
    }
    const ids = annSel.filter((id) => id.startsWith('section:'));
    if (!ids.length) return;
    const before = viewsRef.current, after = before.filter((v) => !ids.includes(v.id));
    history.run(ids.length > 1 ? `Delete ${ids.length} sections` : `Delete ${before.find((v) => v.id === ids[0])?.name ?? 'section'}`, (tx) => tx.change('views', before, after, setViews));
    setOpenViews((o) => o.filter((x) => !ids.includes(x)));
    setAnnSel([]);
  });

  // Errors outside a redraw (click handlers, promises) do not blank the page, but should not vanish:
  // they go to the Activity panel with their message.
  useEffect(() => {
    const onError = (e: ErrorEvent) => m.log(`Error: ${e.message}`, 'error');
    const onRejection = (e: PromiseRejectionEvent) => m.log(`Error: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`, 'error');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Revit selection sync, both ways, only for the model loaded from that Revit document
  const revitLinked = revit.phase === 'connected' && !!revitLink && !!revit.document && revit.document.key === revitLink.key && m.model?.info.fileName === revitLink.fileName;
  const revitLinkedRef = useRef(revitLinked);
  revitLinkedRef.current = revitLinked && revitSync;
  const modelRef = useRef(m.model);
  modelRef.current = m.model;
  useEffect(
    () =>
      bridge.onSelection((sel) => {
        const model = modelRef.current;
        if (!model || !revitLinkedRef.current || sel.key !== revitLink?.key) return;
        fromRevit.current = true; // do not send it back
        m.setSelection(indicesForRevitSelection(model.elements, sel.globalIds, sel.elementIds));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridge, revitLink?.key],
  );
  useEffect(() => {
    if (fromRevit.current) {
      fromRevit.current = false;
      return;
    }
    if (!revitLinked || !revitSync || !m.model || !revitLink) return;
    const els = m.model.elements;
    const picked = m.selection.map((i) => els[i]).filter(Boolean);
    const timer = setTimeout(() => {
      bridge
        .select(
          revitLink.key,
          picked.map((e) => e.globalId),
          picked.map((e) => Number(e.tag) || 0),
        )
        .catch((e) => m.log(`Revit selection: ${(e as Error).message}`, 'error'));
    }, 150); // a box selection sends once
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.selection, revitLinked, revitSync]);

  // ---- Revit parameters (milestone 2): read live for the selection, edit as pending changes,
  //      review in the Changes window, then check or apply in Revit as one undo
  const canParams = revitLinked && bridge.canEditParams;
  const paramsCache = useRef(new Map<string, RevitElementParams>());
  const [paramsTick, setParamsTick] = useState(0); // re-render when the cache fills
  const [paramsState, setParamsState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const pendingKey = revitLink ? `shanku.revitPending.${revitLink.key}` : null;
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [changeStatus, setChangeStatus] = useState(new Map<string, { ok: boolean; message?: string | null }>());
  const [changesBusy, setChangesBusy] = useState<'check' | 'apply' | null>(null);
  const [lastApplied, setLastApplied] = useState<{ undoName: string; applied: number; warnings: string[] } | null>(null);
  /** Revit's warnings from the last check or apply (duplicate marks…), shown in the Changes window. */
  const [changeWarnings, setChangeWarnings] = useState<{ dryRun: boolean; list: string[] } | null>(null);
  // pending changes survive a reload, per Revit document
  useEffect(() => {
    try {
      setPending(pendingKey ? JSON.parse(localStorage.getItem(pendingKey) ?? '[]') : []);
    } catch {
      setPending([]);
    }
    paramsCache.current.clear();
  }, [pendingKey]);
  useEffect(() => {
    if (!pendingKey) return;
    try {
      if (pending.length) localStorage.setItem(pendingKey, JSON.stringify(pending));
      else localStorage.removeItem(pendingKey);
    } catch {
      /* storage unavailable: pending lives for this session */
    }
  }, [pending, pendingKey]);
  const MAX_PARAM_SELECTION = 200;
  const selectedGids = useMemo(() => (m.model ? m.selection.map((i) => m.model!.elements[i]?.globalId).filter(Boolean) : []), [m.selection, m.model]);
  const fetchParams = useCallback(
    async (gids: string[], force = false) => {
      if (!revitLink || !gids.length) return;
      const missing = force ? gids : gids.filter((g) => !paramsCache.current.has(g));
      if (!missing.length) return;
      setParamsState({ loading: true });
      try {
        const els = await bridge.readParams(revitLink.key, missing);
        for (const e of els) paramsCache.current.set(e.globalId, e);
        setParamsState({ loading: false });
        setParamsTick((t) => t + 1);
      } catch (e) {
        setParamsState({ loading: false, error: (e as Error).message });
      }
    },
    [bridge, revitLink],
  );
  useEffect(() => {
    if (!canParams || !selectedGids.length || selectedGids.length > MAX_PARAM_SELECTION) return;
    const t = setTimeout(() => void fetchParams(selectedGids), 250);
    return () => clearTimeout(t);
  }, [canParams, selectedGids, fetchParams]);
  const elementLabel = (gid: string, fallback?: RevitElementParams) => {
    const e = m.model?.elements.find((x) => x.globalId === gid);
    return e ? `${e.category === 'Other' ? e.ifcClass : e.category} ${e.mark || e.typeName || e.name}`.trim() : `${fallback?.category ?? 'Element'} ${fallback?.typeName ?? ''}`.trim();
  };
  const stage = (els: RevitElementParams[], param: { id: number; name: string }, value: string) => {
    const before = pending;
    const after = stageEdit(before, els, param, value, (e) => elementLabel(e.globalId, e));
    if (JSON.stringify(after) === JSON.stringify(before)) return;
    history.run(`Edit ${param.name}${els.length > 1 ? ` on ${els.length} elements` : ''}`, (tx) => tx.change('revit-pending', before, after, setPending));
    setLastApplied(null);
  };
  // ---- QA → Revit: show a finding's elements in Revit; fix missing marks as reviewed changes for Revit
  const showInRevit = (els: number[]) =>
    inModel(() => {
      m.setSelection(els);
      if (!revitSync) void sendSelectionToRevitFor(els);
    });
  const [markProposal, setMarkProposal] = useState<Array<{ index: number; mark: string }> | null>(null);
  const [markBusy, setMarkBusy] = useState(false);
  const qaFix = (f: Finding): { label: string; run: () => void } | null => {
    if (f.checkId !== 'missing-mark' || !f.elements.length || !m.model) return null;
    return {
      label: 'Fix in Revit',
      run: () => {
        const model = m.model;
        if (!model) return;
        const rows = proposeMarks(model.elements, f.elements, model.info.levels.map((l) => l.name));
        if (!rows.length) return setNotice('These elements have marks now.');
        setMarkProposal(rows);
      },
    };
  };
  /** Reads each element's Mark parameter from Revit and stages the proposed values as one undoable step. */
  const confirmMarks = async () => {
    const model = m.model;
    if (!markProposal || !model || !revitLink) return;
    setMarkBusy(true);
    try {
      const gids = markProposal.map((r) => model.elements[r.index].globalId);
      for (let i = 0; i < gids.length; i += 500) {
        const els = await bridge.readParams(revitLink.key, gids.slice(i, i + 500));
        for (const e of els) paramsCache.current.set(e.globalId, e);
      }
      const before = pending;
      let after = before;
      let skipped = 0;
      let alreadyMarked = 0;
      for (const r of markProposal) {
        const gid = model.elements[r.index].globalId;
        const els = paramsCache.current.get(gid);
        const param = els?.params.find((p) => p.name === 'Mark' && !p.readOnly);
        if (!els || !param) {
          skipped++;
          continue;
        }
        // Revit is the truth: marked there since this model was exported, so leave it alone.
        if (param.display && param.display.trim()) {
          alreadyMarked++;
          continue;
        }
        after = stageEdit(after, [els], param, r.mark, (e) => elementLabel(e.globalId, e));
      }
      const staged = markProposal.length - skipped - alreadyMarked;
      if (staged) {
        history.run(`Propose ${staged} mark${staged === 1 ? '' : 's'}`, (tx) => tx.change('revit-pending', before, after, setPending));
        setLastApplied(null);
        toggleWin('changes', true);
      }
      setMarkProposal(null);
      const already = alreadyMarked ? ` ${alreadyMarked} already ${alreadyMarked === 1 ? 'has a mark' : 'have marks'} in Revit (reload from Revit to see ${alreadyMarked === 1 ? 'it' : 'them'}).` : '';
      const none = skipped ? ` ${skipped} ${skipped === 1 ? 'has' : 'have'} no editable Mark in Revit.` : '';
      setNotice(staged ? `${staged === 1 ? '1 mark is' : `${staged} marks are`} waiting in Changes for Revit: check, then apply.${already}${none}` : `Nothing to change.${already}${none}`);
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    } finally {
      setMarkBusy(false);
    }
  };

  const revitProps = (() => {
    void paramsTick;
    if (!revitLink || m.model?.info.fileName !== revitLink.fileName || !m.selection.length) return undefined;
    if (revit.phase !== 'connected') return { status: 'Connect to Revit to see and edit its parameters.', groups: [] };
    if (!revitLinked) return { status: 'Revit is showing a different model.', groups: [] };
    if (!bridge.canEditParams) return { status: `Editing needs Shanku Bridge for Revit 0.2.0 (this Revit has ${revit.addin ?? 'an older add-in'}).`, groups: [] };
    if (selectedGids.length > MAX_PARAM_SELECTION) return { status: `Select ${MAX_PARAM_SELECTION} or fewer elements to edit Revit parameters.`, groups: [] };
    const els = selectedGids.map((g) => paramsCache.current.get(g)).filter((e): e is RevitElementParams => !!e);
    if (els.length < selectedGids.length) return { status: paramsState.error ? `Could not read from Revit: ${paramsState.error}` : 'Reading parameters from Revit…', groups: [] };
    const common = commonParams(els);
    const pendingHere = pending.filter((c) => selectedGids.includes(c.globalId)).length;
    const same = <T,>(f: (e: RevitElementParams) => T) => (els.every((e) => f(e) === f(els[0])) ? f(els[0]) : null);
    const family = same((e) => e.familyName ?? '') ?? '';
    const typeName = same((e) => e.typeName) ?? '';
    const category = same((e) => e.category) ?? 'Common';
    const selKeys = pending.filter((c) => selectedGids.includes(c.globalId)).map(changeKey);
    return {
      header: { family, typeName, category, count: els.length },
      onEditType: typeName && els[0].typeParams?.length ? () => toggleWin('typeProps', true) : null,
      apply: {
        count: pendingHere,
        busy: changesBusy === 'apply',
        disabled: !canParams,
        onApply: () => void runChanges(selKeys, false),
        onReview: () => toggleWin('changes', true),
      },
      pending: pendingHere,
      status: els.length > 1 ? `${common.length} parameters shared by the ${els.length} selected elements.` : undefined,
      groups: byGroup(common).map((g) => ({
        group: g.group,
        rows: g.params.map((p) => {
          const eff = effectiveCommon(pending, els, p);
          return {
            key: `${p.id}|${p.name}`,
            label: p.name,
            value: eff.display,
            unit: p.unit && eff.display && !eff.display.trim().endsWith(p.unit) ? p.unit : undefined,
            varies: eff.varies,
            modified: eff.modified,
            readOnly: p.readOnly,
            hint: p.readOnly ? (p.why ?? 'Read-only in Revit') : p.kind === 'number' ? 'In the Revit project units, e.g. 600 or 600 mm' : undefined,
            kind: p.kind === 'yesno' ? ('yesno' as const) : ('text' as const),
            onCommit: p.readOnly ? undefined : (v: string) => stage(els, p, v),
          };
        }),
      })),
    };
  })();
  /**
   * After a conflict: re-read these changes' elements from Revit and rebase them on Revit's current
   * values. The new values stay; a change that now equals Revit's value is dropped.
   */
  const refreshChanges = async (keys: string[]) => {
    if (!revitLink) return;
    const rows = pending.filter((c) => keys.includes(changeKey(c)));
    const gids = [...new Set(rows.map((c) => c.globalId))];
    try {
      const els = await bridge.readParams(revitLink.key, gids);
      for (const e of els) paramsCache.current.set(e.globalId, e);
      setParamsTick((t) => t + 1);
      let dropped = 0;
      const next = pending.flatMap((c) => {
        if (!keys.includes(changeKey(c))) return [c];
        const cur = els.find((e) => e.globalId === c.globalId)?.params.find((x) => x.id === c.paramId && x.name === c.name)?.display ?? null;
        if (cur === null) return [c];
        if (cur === c.value) {
          dropped++;
          return [];
        }
        return [{ ...c, oldDisplay: cur }];
      });
      setPending(next);
      const st = new Map(changeStatus);
      for (const k of keys) st.delete(k);
      setChangeStatus(st);
      setNotice(`Refreshed ${rows.length} change${rows.length === 1 ? '' : 's'} from Revit${dropped ? `; ${dropped} already matched Revit and were removed` : ''}.`);
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    }
  };
  // ---- Live updates (milestone 3): Revit reports what changed; Shanku merges just those elements
  const [liveChanges, setLiveChanges] = useState<ChangeSet>(NO_CHANGES);
  const [liveBusy, setLiveBusy] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(() => localStorage.getItem('shanku.revitAutoUpdate') === 'on');
  useEffect(() => {
    try {
      localStorage.setItem('shanku.revitAutoUpdate', autoUpdate ? 'on' : 'off');
    } catch {
      /* not remembered */
    }
  }, [autoUpdate]);
  useEffect(() => {
    setLiveChanges(NO_CHANGES); // a new load starts clean
  }, [revitLink?.key, openedInfo]);
  const liveCount = changeCount(liveChanges);
  const canLive = revitLinked && bridge.canLiveUpdate;
  useEffect(
    () =>
      bridge.onChanges((c) => {
        if (!revitLink || c.key !== revitLink.key) return;
        setLiveChanges((cur) => addChanges(cur, c));
        // Revit's parameters of those elements are stale now: Properties re-reads them at once
        for (const g of [...c.modified, ...c.added, ...c.deleted]) paramsCache.current.delete(g);
        setParamsTick((t) => t + 1);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridge, revitLink?.key],
  );
  useEffect(() => {
    if (canParams && selectedGids.length && selectedGids.length <= MAX_PARAM_SELECTION) void fetchParams(selectedGids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsTick]);
  /** Exports only the changed elements from Revit and merges them into the model in place. */
  const updateFromRevit = async () => {
    if (!revitLink || !m.model || liveBusy) return;
    const batch = liveChanges;
    if (!changeCount(batch)) return;
    const ids = toExport(batch);
    if (ids.length > 2000) {
      setNotice(`${ids.length} elements changed in Revit: reload the whole model instead (Revit tab → Reload).`);
      return;
    }
    setLiveBusy(true);
    const t0 = performance.now();
    try {
      const part = ids.length ? await withTask('revit', 'Updating from Revit', `Revit is exporting ${ids.length} changed element${ids.length === 1 ? '' : 's'}…`, () => bridge.exportElements(ids)) : null;
      const r = await m.applyUpdate(`${revitLink.fileName} (update)`, part?.bytes ?? null, batch.deleted);
      if (!r) return;
      // per-element state held by position follows the elements to their new positions
      setHidden((h) => remapIndices(r.indexMap, h));
      for (const [k, v] of hideStore.current) hideStore.current.set(k, remapIndices(r.indexMap, v));
      setGraphics((g) => ({ ...g, elements: remapRecord(r.indexMap, g.elements) }));
      setViews((vs) => vs.map((v) => ({ ...v, graphics: { ...v.graphics, elements: remapRecord(r.indexMap, v.graphics.elements) } })));
      setLiveChanges((cur) => withoutMerged(cur, batch));
      try {
        localStorage.setItem(`shanku.revitUpdated.${revitLink.fileName}`, '1'); // the saved session is the file as first loaded
      } catch {
        /* not remembered */
      }
      m.log(`Updated from Revit in ${Math.round(performance.now() - t0)} ms: ${r.replaced} changed, ${r.added} new, ${r.removed} deleted.`);
      setNotice(`Updated from Revit: ${[r.replaced && `${r.replaced} changed`, r.added && `${r.added} new`, r.removed && `${r.removed} deleted`].filter(Boolean).join(', ') || 'nothing to change'}.`);
    } catch (e) {
      setNotice(`Could not update from Revit: ${(e as Error).message}`);
    } finally {
      setLiveBusy(false);
    }
  };
  // ---- Export to Revit (milestone 4): the DXF → 3D model built natively in Revit, then linked back
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [exportOff, setExportOff] = useState<Set<string>>(new Set());
  const canExport = revit.phase === 'connected' && !!revit.document && !revit.document.isFamily && bridge.canCreate;
  const exportWhy = revit.phase !== 'connected' ? 'connect to Revit first' : !revit.document ? 'open the target model in Revit' : revit.document.isFamily ? 'Revit is showing a family' : !bridge.canCreate ? 'needs Shanku Bridge for Revit 0.6.0' : '';
  /** Runs the pipeline for Revit and has Revit check the plan (a dry run), for review. */
  const exportToRevit = async () => {
    if (!canExport) {
      openRevit();
      setNotice(`Export to Revit: ${exportWhy}.`);
      return;
    }
    if (!pipeline.state?.summary) {
      setNotice('Export to Revit: pick the DXF drawing first; then press Export to Revit again.');
      void pipeline.start();
      return;
    }
    toggleWin('exportRevit', true);
    setExportOff(new Set());
    setExportState({ phase: 'preparing', target: revit.document!.title });
    try {
      const exchange = await withTask('revit', 'Export to Revit', 'Reading the drawing for Revit…', () => pipeline.exportPlan());
      const report = await withTask('revit', 'Export to Revit', 'Checking the plan in Revit: one element of each type is tried, then rolled back…', () => bridge.createModel(revit.document!.key, exchange, true));
      setExportState({ phase: 'review', exchange, report, target: revit.document!.title });
    } catch (e) {
      setExportState({ phase: 'error', message: (e as Error).message, target: revit.document?.title });
    }
  };
  /** Creates the approved sets in Revit (one undo), then offers to load the model back. */
  const createInRevit = async () => {
    const ex = exportState?.exchange;
    if (!ex || !revit.document) return;
    const approved = approvedOnly(ex, exportOff);
    setExportState({ ...exportState!, phase: 'creating' });
    try {
      const report = await withTask('revit', 'Building in Revit', 'Revit is creating the levels, types and elements (one undo)…', () => bridge.createModel(revit.document!.key, approved, false));
      setExportState({ phase: 'done', exchange: approved, report, target: revit.document.title });
      const made = report.results.filter((r) => r.ok).length;
      m.log(`Export to Revit: ${made} created in ${revit.document.title} (${report.undoName})${report.results.length - made ? `, ${report.results.length - made} not created` : ''}${report.existing.length ? `, ${report.existing.length} already there` : ''}.`);
    } catch (e) {
      setExportState({ phase: 'error', message: (e as Error).message, exchange: ex, target: revit.document.title });
    }
  };

  // After a page reload the session restores the file as first loaded: say so if Revit updates were merged.
  useEffect(() => {
    if (!m.model || m.model.revision || !revitLink || m.model.info.fileName !== revitLink.fileName) return;
    if (localStorage.getItem(`shanku.revitUpdated.${revitLink.fileName}`) === '1')
      setNotice('Shanku restored this model as it was first loaded from Revit; changes merged since then are not in it. Revit tab → Reload brings it up to date.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedInfo]);
  // ---- Download IFC: the model as a file. A model linked to the open Revit document is exported fresh
  // (it includes every change since loading); otherwise the file as opened (kept in this device's session).
  const downloadIfc = async () => {
    if (!m.model) return;
    const base = m.model.info.fileName.replace(/\.ifc$/i, '');
    try {
      if (revitLinked) {
        const r = await withTask('download', 'Download IFC', 'Revit is exporting the current model…', () => bridge.loadModel());
        downloadFile(r.bytes, `${base}.ifc`, 'application/x-step');
        m.log(`Downloaded ${base}.ifc, exported fresh from Revit (${(r.bytes.byteLength / 1e6).toFixed(1)} MB).`);
        return;
      }
      const saved = await loadModel();
      if (!saved || saved.name !== m.model.info.fileName) {
        setNotice('The file is not kept on this device any more: open it again to download it.');
        return;
      }
      downloadFile(saved.bytes, `${base}.ifc`, 'application/x-step');
      const merged = m.model.revision ?? 0;
      m.log(`Downloaded ${base}.ifc (${(saved.bytes.byteLength / 1e6).toFixed(1)} MB).`);
      if (merged > 0) setNotice(`This is the file as loaded: ${merged} update${merged === 1 ? '' : 's'} from Revit since then are not in it. Connect to Revit to download a fresh export.`);
    } catch (e) {
      setNotice(`Could not download the IFC: ${(e as Error).message}`);
    }
  };

  const updateRef = useRef(updateFromRevit);
  updateRef.current = updateFromRevit;
  useEffect(() => {
    if (!autoUpdate || !canLive || !liveCount || liveBusy) return;
    const t = setTimeout(() => void updateRef.current(), 1200); // after Revit settles
    return () => clearTimeout(t);
  }, [autoUpdate, canLive, liveCount, liveBusy]);

  /** Checks (dry run) or applies the given pending changes in Revit. */
  const runChanges = async (keys: string[], dryRun: boolean) => {
    if (!revitLink) return;
    const sent = pending.filter((c) => keys.includes(changeKey(c)));
    if (!sent.length) return;
    setChangesBusy(dryRun ? 'check' : 'apply');
    try {
      const r = await bridge.writeParams(
        revitLink.key,
        sent.map(({ globalId, paramId, name, oldDisplay, value }) => ({ globalId, paramId, name, oldDisplay, value })),
        dryRun,
      );
      const status = new Map(changeStatus);
      sent.forEach((c, i) => status.set(changeKey(c), { ok: !!r.results[i]?.ok, message: r.results[i]?.error ?? null }));
      setChangeWarnings(r.warnings.length ? { dryRun, list: r.warnings } : null);
      const warned = r.warnings.length ? ` Revit warns: ${r.warnings.join(' ')}` : '';
      if (r.warnings.length) m.log(`Revit ${dryRun ? 'would warn' : 'warned'}: ${r.warnings.join(' ')}`);
      if (r.warnings.length) toggleWin('changes', true); // Revit's warnings must be seen, after a check as after an apply
      if (dryRun) {
        setChangeStatus(status);
        const bad = r.results.filter((x) => !x.ok).length;
        setNotice((bad ? `Revit would refuse ${bad} of ${sent.length} changes; see the Changes window.` : `Revit accepts all ${sent.length} changes. Nothing was changed yet.`) + warned);
      } else {
        const done = afterApply(pending, sent, r.results);
        for (const c of sent) if (!done.failed.has(changeKey(c))) status.delete(changeKey(c));
        setChangeStatus(status);
        setPending(done.remaining); // applied in Revit: Revit's undo takes them back, not Shanku's
        setLastApplied({ undoName: r.undoName, applied: done.applied, warnings: r.warnings });
        for (const c of sent) paramsCache.current.delete(c.globalId);
        void fetchParams(selectedGids, true);
        m.log(`Revit: ${r.undoName} — ${done.applied} applied${done.failed.size ? `, ${done.failed.size} refused` : ''}.`);
        setNotice((done.applied ? `Applied ${done.applied} change${done.applied === 1 ? '' : 's'} in Revit (Edit → Undo in Revit takes them back).${done.failed.size ? ` ${done.failed.size} refused.` : ''}` : `Revit refused all ${sent.length} changes; see the Changes window.`) + warned);

      }
    } catch (e) {
      setNotice(`Revit: ${(e as Error).message}`);
    } finally {
      setChangesBusy(null);
    }
  };

  // Undo / redo, as in Revit: Ctrl + Z, Ctrl + Y (and Ctrl + Shift + Z)
  // zY: the project's ±0 in the viewer, calibrated against the geometry (engine projectZeroY). Level
  // lines sit at Elevation + zY; viewer height − zY = the elevation Revit shows.
  const zY = useMemo(() => (m.model ? projectZeroY(m.model) : 0), [m.model]);
  // Spot elevations read Revit's numbers (height − zY); spot coordinates are from the file's own origin.
  const coordination = m.model?.coordination;
  const dimOrigin = useMemo<Vec3>(() => [coordination && coordination.length === 16 ? coordination[12] : 0, zY, coordination && coordination.length === 16 ? coordination[14] : 0], [coordination, zY]);
  const heights = useMemo(() => (m.model ? levelHeights(m.model.info.levels, m.model.elements, m.model.info.units.length, zY) : new Map<string, number>()), [m.model?.info, zY]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const e of m.model?.elements ?? []) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], e.bounds[k]);
      max[k] = Math.max(max[k], e.bounds[k + 3]);
    }
    return { min, max };
  }, [m.model?.info]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeModelView = views.find((v) => v.id === activeView) ?? null;
  // Dimensions belong to their view: switching views drops the dimension selection.
  useEffect(() => {
    setDimSel([]);
  }, [activeView]);
  // A live update from Revit moves dimension references with their elements; deleted elements take theirs away (Revit).
  const lastRevision = useRef(m.model?.revision ?? 0);
  useEffect(() => {
    const rev = m.model?.revision ?? 0;
    if (!m.model || rev === lastRevision.current) {
      lastRevision.current = rev;
      return;
    }
    lastRevision.current = rev;
    let dropped = 0;
    let changed = false;
    const next = viewsRef.current.map((v) => {
      if (!v.dims?.length) return v;
      const r = followModel(v.dims, m.model!.elements);
      dropped += r.dropped;
      if (!r.moved && !r.dropped) return v;
      changed = true;
      return { ...v, dims: r.dims };
    });
    if (changed) setViews(next);
    if (dropped) setNotice(`${dropped} dimension${dropped === 1 ? '' : 's'} removed with the elements Revit deleted.`);
  }, [m.model?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  // View symbols for the active view (section / elevation marks in plans, levels in elevations).
  const marks = useMemo(() => marksFor(activeModelView, views, heights, bounds, zY), [activeModelView, views, heights, bounds, zY]);
  const resolved = useMemo(() => (m.model ? resolveGraphics(m.model.elements, graphics) : { hidden: [], overrides: [] }), [m.model, graphics]);
  // Colour by parameter (element palette): colours sit under Visibility/Graphics overrides; groups hidden in the legend hide in every view.
  const [colorSettings, setColorSettingsState] = useState<ColorSettings>(loadColorSettings);
  const setColorSettings = (s: ColorSettings) => {
    setColorSettingsState(s);
    saveColorSettings(s);
  };
  const categoryColors = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const c of ['column', 'beam', 'slab', 'wall', 'footing', 'rebar']) {
      const v = cs.getPropertyValue(`--cat-${c}`).trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) out[c[0].toUpperCase() + c.slice(1)] = v;
    }
    return out;
  }, []);
  const colorResult = useMemo(
    () => (m.model ? computeColors(m.model.elements, m.model.info.levels, colorSettings, categoryColors, zY) : computeColors([], [], { ...colorSettings, mode: 'none' })),
    [m.model, colorSettings, categoryColors, zY],
  );
  const viewOverrides = useMemo(() => mergeOverrides(colorResult.colors, resolved.overrides), [colorResult.colors, resolved.overrides]);
  const setColorMode = (mode: ColorMode) => {
    setColorSettings({ ...colorSettings, mode });
    if (mode !== 'none') dock.current?.open('colour');
  };
  const viewHidden = useMemo(() => {
    const extra = [...resolved.hidden, ...colorResult.hidden];
    return extra.length ? [...new Set([...hidden, ...extra])] : hidden;
  }, [hidden, resolved.hidden, colorResult.hidden]);
  const changeGraphics = (name: string, next: ViewGraphics) =>
    history.run(name, (t) => t.change('view-graphics', graphicsRef.current, next, setGraphics));
  const applyViewGraphics = (next: { categories: CategoryOverrides; applied: AppliedFilter[] }) =>
    changeGraphics('Visibility/Graphics', { ...graphicsRef.current, categories: next.categories, applied: next.applied });
  const applyFilterDefs = (filters: ViewFilter[]) => {
    const ids = new Set(filters.map((f) => f.id));
    // Deleting a filter also removes it from the view, as in Revit.
    changeGraphics('Filters', { ...graphicsRef.current, filters, applied: graphicsRef.current.applied.filter((a) => ids.has(a.filterId)) });
  };
  const applyElementGraphics = (o: GraphicsOverride | null) => {
    const elements = { ...graphicsRef.current.elements };
    for (const i of sel) {
      if (o) elements[i] = o;
      else delete elements[i];
    }
    changeGraphics(o ? 'Override Graphics in View' : 'Reset element graphics', { ...graphicsRef.current, elements });
  };

  const viewState = (): ViewState => ({ graphics: graphicsRef.current, displayStyle, edges });
  /** Revit: Apply Template Properties to Current View, as one undoable step named after the template. */
  const applyViewTemplate = (t: ViewTemplate) => {
    const before = viewState();
    const after = applyTemplate(before, t);
    history.run(`Apply View Template: ${t.name}`, (tx) =>
      tx.change('view-state', before, after, (v) => {
        setGraphics(v.graphics);
        setDisplayStyle(v.displayStyle);
        setEdges(v.edges);
      }),
    );
    m.log(`Applied view template ${t.name}.`);
  };

  /** Puts a view's range, navigation, box and camera on the viewer. */
  const showView = (v: ModelView) => {
    const vp = viewport.current;
    if (!vp) return;
    const two = isTwoD(v);
    vp.setViewMode({ nav2d: two, grips: !two });
    const clip = viewClip(v, heights, bounds);
    vp.setSectionBoxState(clip ? boxState(clip.center, clip.half, clip.angle) : boxStore.current.get(v.id) ?? null);
    setSectionBox(!two && !!boxStore.current.get(v.id));
    const cam = camStore.current.get(v.id);
    if (cam) vp.setCamera(cam);
    else {
      const dir = viewDirection(v);
      if (dir) vp.aimInstant(dir);
      else vp.home();
    }
  };

  /** Keeps the outgoing view's state and shows the incoming one (Revit: each view remembers its own). */
  useEffect(() => {
    const vp = viewport.current;
    const v = viewsRef.current.find((x) => x.id === activeView);
    if (!vp || !m.model || !v || loadedView.current === v.id) return;
    const out = loadedView.current;
    const cam = vp.getCamera();
    if (cam) camStore.current.set(out, cam);
    hideStore.current.set(out, hidden);
    const outView = viewsRef.current.find((x) => x.id === out);
    if (outView && !isTwoD(outView)) boxStore.current.set(out, sectionBox ? vp.sectionBoxState() : null);
    // Capture now: a deferred updater would run after the incoming view's graphics replaced these.
    const keep = { graphics: graphicsRef.current, displayStyle, edges };
    setViews((vs) => vs.map((x) => (x.id === out ? { ...x, ...keep } : x)));
    loadedView.current = v.id;
    setAnnSel([]);
    setGraphics(v.graphics);
    setDisplayStyle(v.displayStyle);
    setEdges(v.edges);
    setHidden(hideStore.current.get(v.id) ?? []);
    showView(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, openedInfo]);

  const openView = (id: string) => {
    setOpenViews((o) => (o.includes(id) ? o : [...o, id]));
    setActiveView(id);
  };
  const setViewRange = (id: string, patch: Partial<ModelView>) => {
    setViews((vs) => vs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const v = viewsRef.current.find((x) => x.id === id);
    if (v && id === loadedView.current) {
      const clip = viewClip({ ...v, ...patch }, heights, bounds);
      if (clip) viewport.current?.setSectionBoxState(boxState(clip.center, clip.half, clip.angle));
    }
  };
  const duplicateModelView = (id: string) => {
    const v = viewsRef.current.find((x) => x.id === id);
    if (!v) return;
    const live = id === loadedView.current ? { ...v, graphics: graphicsRef.current, displayStyle, edges } : v;
    const d = duplicateView(live, viewsRef.current);
    const cam = id === loadedView.current ? viewport.current?.getCamera() : camStore.current.get(id);
    if (cam) camStore.current.set(d.id, cam);
    if (boxStore.current.has(id) || (id === loadedView.current && sectionBox)) boxStore.current.set(d.id, id === loadedView.current ? viewport.current?.sectionBoxState() ?? null : boxStore.current.get(id) ?? null);
    setViews((vs) => [...vs, d]);
    openView(d.id);
    m.log(`Duplicated ${v.name} as ${d.name}.`);
  };
  const deleteModelView = (id: string) => {
    if (id === '3d') return;
    setViews((vs) => vs.filter((x) => x.id !== id));
    setOpenViews((o) => o.filter((x) => x !== id));
    if (activeView === id) setActiveView('3d');
  };
  const applyTemplateToView = (id: string, t: ViewTemplate) => {
    if (id === loadedView.current) return applyViewTemplate(t);
    const before = viewsRef.current;
    const after = before.map((v) => (v.id === id ? { ...v, ...applyTemplate({ graphics: v.graphics, displayStyle: v.displayStyle, edges: v.edges }, t) } : v));
    history.run(`Apply View Template: ${t.name}`, (tx) => tx.change('views', before, after, setViews));
  };
  /** Revit's Section tool: two clicks in a plan, section or elevation (not in 3D views). */
  const startSection = () => {
    setMeasure(null); // one tool at a time
    setDimTool(null);
    const v = activeModelView;
    if (!v || !isTwoD(v)) return setNotice('Draw sections in a plan, section or elevation view.');
    const create = (a: [number, number], b: [number, number]) => {
      viewport.current?.stopPointPick();
      setSectionTool(false);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2) return setNotice('That section line is too short.');
      const sv: ModelView = { id: `section:${Date.now().toString(36)}`, kind: 'section', name: nextSectionName(viewsRef.current), section: { a, b, depth: 5 }, graphics: structuredClone(EMPTY_GRAPHICS), displayStyle, edges: true };
      setViews((vs) => [...vs, sv]);
      openView(sv.id);
      setNotice(`${sv.name} created. Far clip is 5 m; change it in Properties.`);
    };
    sectionA.current = null;
    setSectionTool(true);
    if (v.kind === 'plan') {
      setNotice('Section: click the start, then the end. It snaps to 15°; drawn left to right it looks up the screen. Esc cancels.');
      const y = v.level ? heights.get(v.level) ?? 0 : 0;
      viewport.current?.startLinePick([0, 1, 0], [0, y, 0], (p, q) => create([p[0], p[2]], [q[0], q[2]]));
      return;
    }
    // Elevation or section: a vertical cut across the view, picked on the view plane.
    setNotice('Section: click two points up or down the view where it should cut (snaps to 15°). Drawn upward it looks to the right. Esc cancels.');
    const dir = viewDirection(v)!;
    const through: [number, number, number] = v.kind === 'section' && v.section ? [(v.section.a[0] + v.section.b[0]) / 2, 0, (v.section.a[1] + v.section.b[1]) / 2] : [(bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2];
    const span = Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) + 2;
    viewport.current?.startLinePick(dir, through, (p, q) => {
      const { a, b } = sectionFromVerticalView(p, q, dir, span);
      create(a, b);
    });
  };
  const cancelSection = () => {
    viewport.current?.stopPointPick();
    setSectionTool(false);
    sectionA.current = null;
  };

  /** Properties of a selected view symbol (Revit shows a level's or section's properties when picked). */
  // ---- Dimensions (Annotate → Dimension): kept with their view, every change one undo step
  const setViewDims = (label: string, viewId: string, change: (dims: PlacedDimension[]) => PlacedDimension[]) => {
    const before = viewsRef.current;
    const after = before.map((v) => (v.id === viewId ? { ...v, dims: change(v.dims ?? []) } : v));
    history.run(label, (tx) => tx.change('views', before, after, setViews));
  };
  const dimName = (k: DimensionKind) => DIMENSION_TOOLS.find((t) => t.id === k)?.label ?? 'Dimension';
  const placeDimension = (d: PlacedDimension) => {
    if (!activeView) return;
    setViewDims(`Place ${dimName(d.kind).toLowerCase()}${d.kind.startsWith('spot') ? '' : ' dimension'}`, activeView, (ds) => [...ds, d]);
    setNotice(dimensionSummary(d, dimOrigin));
  };
  const deleteDimensions = (ids: string[]) => {
    if (!activeView) return;
    setViewDims(ids.length > 1 ? `Delete ${ids.length} dimensions` : 'Delete dimension', activeView, (ds) => ds.filter((d) => !ids.includes(d.id)));
    setDimSel([]);
  };
  const dimPropsFor = (sel: number[]) => {
    if (!dimSel.length || sel.length || annSel.length) return undefined;
    const dims = (activeModelView?.dims ?? []).filter((d) => dimSel.includes(d.id));
    if (!dims.length) return undefined;
    if (dims.length > 1) return { kind: 'Dimensions', name: `${dims.length} selected`, rows: [{ section: 'Dimensions', label: 'Delete', value: 'Press Delete' }] };
    const d = dims[0];
    const edit = (field: 'prefix' | 'suffix' | 'below' | 'replace') => (txt: string) =>
      activeView && setViewDims('Edit dimension text', activeView, (ds) => ds.map((x) => (x.id === d.id ? { ...x, text: { ...x.text, [field]: txt.trim() || undefined } } : x)));
    return {
      kind: d.kind.startsWith('spot') ? 'Spot Dimension' : 'Dimension',
      name: dimName(d.kind),
      rows: [
        { section: 'Value', label: d.kind === 'spotCoordinate' ? 'Coordinates' : 'Value', value: dimensionValues(d, dimOrigin).join(d.kind === 'spotCoordinate' ? ', ' : ' + ') },
        ...(d.kind === 'aligned' || d.kind === 'linear' ? [{ section: 'Value', label: 'Segments', value: Math.max(1, d.points.length - 1) }] : []),
        { section: 'Dimension Text', label: 'Prefix', value: d.text?.prefix ?? '', onCommit: edit('prefix') },
        { section: 'Dimension Text', label: 'Suffix', value: d.text?.suffix ?? '', onCommit: edit('suffix') },
        { section: 'Dimension Text', label: 'Below', value: d.text?.below ?? '', onCommit: edit('below') },
        { section: 'Dimension Text', label: 'Replace With Text', value: d.text?.replace ?? '', onCommit: edit('replace') },
      ],
    };
  };
  const symbolPropsFor = (sel: number[]) => {
    if (!annSel.length || sel.length) return undefined;
    if (annSel.length > 1) return { kind: 'View symbols', name: `${annSel.length} selected`, rows: [] };
    const id = annSel[0];
    const mm = (m: number) => Math.round(m * 1000);
    if (id.startsWith('plan:')) {
      const name = id.slice(5);
      const h = heights.get(name);
      const above = [...heights.values()].filter((x) => h !== undefined && x > h + 1e-6).sort((a, b) => a - b)[0];
      return {
        kind: 'Level',
        icon: 'level' as const,
        name,
        rows: [
          { section: 'Constraints', label: 'Elevation', unit: 'mm', value: h !== undefined ? mm(h - zY) : '—' },
          { section: 'Constraints', label: 'Height to level above', unit: 'mm', value: h !== undefined && above !== undefined ? mm(above - h) : '—' },
          { section: 'Identity Data', label: 'Name', value: name },
          { section: 'Identity Data', label: 'Plan view', value: views.some((v) => v.id === id) ? name : '—' },
        ],
      };
    }
    const v = views.find((x) => x.id === id);
    if (!v) return undefined;
    if (v.kind === 'section' && v.section) {
      const { a, b } = v.section;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const look = [(b[1] - a[1]) / (len || 1), -(b[0] - a[0]) / (len || 1)];
      const bearing = ((Math.atan2(look[0], -look[1]) * 180) / Math.PI + 360) % 360; // 0 = north, clockwise
      return {
        kind: 'Section',
        icon: 'section' as const,
        name: v.name,
        rows: [
          { section: 'Identity Data', label: 'View Name', value: v.name, onCommit: (t: string) => t.trim() && setViews((vs) => vs.map((x) => (x.id === v.id ? { ...x, name: t.trim() } : x))) },
          { section: 'Extents', label: 'Far Clip Offset', unit: 'mm', value: mm(v.section.depth), onCommit: (t: string) => Number(t) > 0 && setViewRange(v.id, { section: { ...v.section!, depth: Number(t) / 1000 } }) },
          { section: 'Extents', label: 'Length', unit: 'mm', value: mm(len) },
          { section: 'Extents', label: 'Looks toward', value: `${bearing.toFixed(1)}° (0° = north)` },
        ],
      };
    }
    if (v.kind === 'elevation') {
      return { kind: 'Elevation', icon: 'elevation' as const, name: v.name, rows: [{ section: 'Identity Data', label: 'View Name', value: v.name }] };
    }
    return undefined;
  };

  /** Commands the right-click menu can repeat (Revit's Repeat Last Command). */
  const run = (id: CommandId, label: string) => {
    setLastCommand({ id, label });
    runCommand(id);
  };

  /**
   * QA (actionable QA, phase 1): model-health and mark checks run on this device whenever the model
   * or its mark and grade rules change. Pure functions, a few milliseconds for typical models.
   */
  const qaReport = useMemo(() => (m.model ? runChecks({ elements: m.model.elements, levels: m.model.info.levels }) : null), [m.model]);
  /** QA actions work in 3D: leave a drawing tab first, then act once the view is showing. */
  const inModel = (fn: () => void) => {
    if (!activeDoc) return fn();
    setActiveView('3d');
    setTimeout(fn, 80);
  };
  const qaActions = {
    onSelect: (els: number[]) => inModel(() => m.setSelection(els)),
    onZoom: (els: number[]) => inModel(() => viewport.current?.fit(els)),
    onIsolate: (els: number[]) =>
      inModel(() => {
        if (!m.model) return;
        const keep = new Set(els);
        m.setSelection(els);
        setHidden(m.model.elements.filter((e) => !keep.has(e.index)).map((e) => e.index));
        viewport.current?.fit(els);
      }),
    onStep: (el: number) =>
      inModel(() => {
        m.setSelection([el]);
        viewport.current?.fit([el]);
      }),
  };

  // ---- Paste marks to select (quick-wins B2): Ctrl + V on the model with "C1, C4, B12" copied ----
  const [marksDialog, setMarksDialog] = useState(false);
  const selectByMarks = (text: string): boolean => {
    const model = m.model;
    if (!model) return false;
    const list = parseMarkList(text);
    const r = matchMarks(model.elements, list);
    if (!r.indices.length) {
      setNotice(`None of those marks are in this model${list.length ? ` (${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''})` : ''}.`);
      return false;
    }
    inModel(() => {
      m.setSelection(r.indices);
      viewport.current?.fit(r.indices);
    });
    // Words from the message ("please", "check") are not marks: only report tokens that look like one.
    const missing = r.unknown.filter((u) => /^[A-Z]{1,4}-?\d{1,4}$/.test(u));
    const inRevit = revitLinked && revitSync ? ' Revit selects them too.' : '';
    setNotice(`Selected ${r.indices.length} elements for ${r.found.join(', ')}.${missing.length ? ` Not in this model: ${missing.join(', ')}.` : ''}${inRevit}`);
    return true;
  };
  const selectByMarksRef = useRef(selectByMarks);
  selectByMarksRef.current = selectByMarks;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target) || document.querySelector('dialog[open]')) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!looksLikeMarks(text)) return;
      if (selectByMarksRef.current(text)) e.preventDefault();
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // ---- View links (Structura item 14) ----
  const [linkDialog, setLinkDialog] = useState<{ mode: 'copy' | 'open'; link: string } | null>(null);
  /** A link opened before its model: applied once that model loads. */
  const pendingLink = useRef<ViewToken | null>(null);

  /** The current view as a link token: view, camera, section box, style, selection, temporary hide/isolate, explode. */
  const currentViewToken = (): ViewToken | null => {
    const model = m.model;
    const vp = viewport.current;
    if (!model || !vp) return null;
    const cam = vp.getCamera();
    const box = isTwoD(activeModelView ?? undefined) ? null : vp.sectionBoxState();
    const hid = new Set(hidden);
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4; // 0.1 mm and plenty for angles: keeps links short
    return {
      v: 1,
      file: model.info.fileName,
      view: activeModelView?.id,
      camera: cam ? [cam.position.x, cam.position.y, cam.position.z, cam.target.x, cam.target.y, cam.target.z, cam.zoom, cam.frameHeight, cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w].map(r4) : undefined,
      box: box ? [box.center.x, box.center.y, box.center.z, box.half.x, box.half.y, box.half.z, box.angle].map(r4) : undefined,
      style: displayStyle,
      select: m.selection.length ? m.selection.map((i) => model.elements[i].globalId) : undefined,
      hide: hiddenForLink(
        hidden.map((i) => model.elements[i].globalId),
        model.elements.filter((e) => !hid.has(e.index)).map((e) => e.globalId),
      ),
      explode: explode ? { modes: explode.modes, amount: explode.amount } : undefined,
    };
  };

  const copyViewLink = async () => {
    const t = currentViewToken();
    if (!t) return setNotice('Open a model first; a view link needs a view.');
    const link = viewLinkUrl(window.location.href, t);
    try {
      await navigator.clipboard.writeText(link);
      setNotice(`View link copied. Anyone who opens it with ${t.file} sees this view.`);
    } catch {
      setLinkDialog({ mode: 'copy', link }); // clipboard blocked: show it to copy by hand
    }
  };

  /** Applies a link to the open model; elements are matched by GlobalId, so a re-export still works. */
  const applyViewToken = (t: ViewToken) => {
    const model = m.model;
    if (!model) {
      pendingLink.current = t;
      return setNotice(`This link shows a view of ${t.file}. Open that file to see it.`);
    }
    pendingLink.current = null;
    const byId = new Map(model.elements.map((e) => [e.globalId, e.index]));
    const indices = (ids: readonly string[] = []) => ids.map((g) => byId.get(g)).filter((i): i is number => i !== undefined);
    const wanted = [...(t.select ?? []), ...(t.hide?.ids ?? [])];
    const found = indices(wanted).length;
    if (t.view && t.view !== activeModelView?.id && views.some((v) => v.id === t.view)) openView(t.view);
    else if (activeDoc) setActiveView('3d');
    setTimeout(() => {
      const vp = viewport.current;
      if (!vp) return;
      if (t.style && STYLES.some((st) => st.id === t.style)) setDisplayStyle(t.style as DisplayStyle);
      if (t.hide) {
        const ids = new Set(indices(t.hide.ids));
        setHidden(t.hide.mode === 'isolate' ? model.elements.filter((e) => !ids.has(e.index)).map((e) => e.index) : [...ids]);
      } else setHidden([]);
      m.setSelection(indices(t.select));
      if (t.box && !isTwoD(activeModelView ?? undefined)) {
        const [cx, cy, cz, hx, hy, hz, angle] = t.box;
        vp.setSectionBoxState(boxState([cx, cy, cz], [hx, hy, hz], angle));
        setSectionBox(true);
      }
      if (t.camera) {
        const c = t.camera;
        vp.setCamera({ position: { x: c[0], y: c[1], z: c[2] }, target: { x: c[3], y: c[4], z: c[5] }, zoom: c[6], frameHeight: c[7], quaternion: { x: c[8], y: c[9], z: c[10], w: c[11] } } as unknown as CameraState);
      }
      const modes = (t.explode?.modes ?? []).filter((md): md is ExplodeMode => EXPLODE_MODES.some((x) => x.id === md));
      setExplode(modes.length && t.explode ? { modes, amount: t.explode.amount } : null);
      const other = t.file !== model.info.fileName ? ` It was made on ${t.file}.` : '';
      setNotice(
        wanted.length && !found
          ? `None of the link's elements are in ${model.info.fileName}; only the camera was applied.${other}`
          : `Showing the shared view.${other}${t.partial ? ' The link held only part of the selection or hidden elements.' : ''}`,
      );
    }, 120);
  };

  // A link opened in the address bar: read it once, then apply it when (or if) its model is open.
  useEffect(() => {
    const t = decodeViewToken(window.location.hash);
    if (!t) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#app`); // the link is used; keep the address clean
    pendingLink.current = t;
    setNotice(`This link shows a view of ${t.file}. Open that file to see it.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (m.model && pendingLink.current) {
      const t = pendingLink.current;
      setTimeout(() => applyViewToken(t), 300); // after the default view is set up
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.model]);

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
    { id: 'share', title: 'Share this view', detail: 'Copy a link that opens this camera, selection and isolation for someone with the same file.', needsModel: true, run: withModel(() => void copyViewLink()) },
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
      { id: 'views.copyLink', title: 'Copy view link', group: 'Views', keywords: 'share url whatsapp email send link token', enabled: hasModel, why: needModel, run: () => void copyViewLink() },
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
  // ---- Revit's own progress (Export to Revit): the rising frame fills in as Revit builds
  useEffect(
    () =>
      bridge.onProgress((p) => {
        if (p.total <= 0) return;
        const fraction = typeof p.fraction === 'number' ? p.fraction : Math.min(1, p.done / p.total);
        const busy = !!p.busy;
        updateTask('revit', {
          phase: p.phase,
          fraction,
          busy,
          detail: busy ? undefined : p.task === 'create' ? `${fmtCount(p.done)} of ${fmtCount(p.total)} elements` : `${fmtCount(p.done)} of ${fmtCount(p.total)} types tried`,
        });
      }),
    [bridge],
  );
  // ---- Long operations report to the progress store (lib/progress → BuildProgress)
  useEffect(() => {
    if (load.status !== 'loading') return void endTask('open-ifc');
    const known = load.total > 0;
    const patch = {
      title: `Opening ${load.fileName}`,
      phase: known ? 'Building the 3D geometry' : 'Reading the file and its properties',
      fraction: known ? load.done / load.total : null,
      detail: known ? `${fmtCount(load.done)} of ${fmtCount(load.total)} elements` : undefined,
    };
    if (!tasksNow().some((t) => t.id === 'open-ifc')) startTask('open-ifc', patch.title, patch.phase, patch.fraction);
    updateTask('open-ifc', patch);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dx.loading) return void endTask('open-dxf');
    if (!tasksNow().some((t) => t.id === 'open-dxf')) startTask('open-dxf', `Opening ${dx.loading.name}`, dx.loading.phase);
    else updateTask('open-dxf', { phase: dx.loading.phase });
  }, [dx.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const phase = pipeline.state?.phase;
    if (!phase) return void endTask('dxf-3d');
    const title = `DXF → 3D${pipeline.state?.fileName ? `: ${pipeline.state.fileName}` : ''}`;
    if (!tasksNow().some((t) => t.id === 'dxf-3d')) startTask('dxf-3d', title, phase);
    else updateTask('dxf-3d', { title, phase });
  }, [pipeline.state?.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const tasks = useTasks();
  const tasksNow = () => tasksRef.current;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName={info?.fileName ?? 'No model open'}
          brandHref={import.meta.env.BASE_URL}
          quickAccess={<QuickAccess history={history} onOpen={openFromDisk} onHome={() => viewport.current?.home()} canHome={!!m.model} onMeasure={() => runCommand('measure')} measuring={!!measure} />}
          saveState={info ? 'Opened from this device' : undefined}
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
      ribbonTabs={<RibbonTabs tabs={RIBBON_TABS} activeId={ribbonTab} onChange={setRibbonTab} />}
      ribbon={
        <Ribbon label={RIBBON_TABS.find((t) => t.id === ribbonTab)?.label ?? 'Model'}>
          {ribbonTab === 'model' ? (
            <>
          <RibbonGroup label="Open">
            <RibbonButton icon="ifc" label="IFC" onClick={openFromDisk} shortcutHint="opens from this device" />
            <RibbonButton icon="dxf" label="DXF" onClick={openDxfFromDisk} shortcutHint="2D view, opens from this device" />
            <RibbonButton icon="column" label="DXF → 3D" active={wins.pipeline} onClick={() => (pipe ? toggleWin('pipeline') : void pipeline.start())} shortcutHint="build an IFC model from a CH-format drawing" />
            <RibbonButton icon="downloadIfc" label="Download IFC" disabled={!m.model} onClick={() => void downloadIfc()} shortcutHint={!m.model ? 'open a model first' : revitLinked ? 'a fresh export from Revit, with every change since loading' : 'the model as an IFC file'} />
          </RibbonGroup>
          <RibbonGroup label="Structure">
            {(['column', 'beam', 'wall', 'slab', 'footing'] as const).map((k) => (
              <RibbonButton key={k} icon={k} label={k[0].toUpperCase() + k.slice(1)} twoTone disabled shortcutHint="modelling arrives in 0.2" />
            ))}
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
            <RibbonButton icon="byid" label="Marks" disabled={!m.model} onClick={() => setMarkDialog(true)} shortcutHint="which property is the mark" />
          </RibbonGroup>
            </>
          ) : (
            <>
          {/* Revit bridge (Shanku Bridge for Revit): the same actions as the Revit window, Revit-style */}
          <RibbonGroup label="Connection">
            <RibbonButton
              icon="link"
              label={revit.phase === 'connected' ? 'Connected' : revit.phase === 'unpaired' ? 'Pair' : 'Connect'}
              active={revit.phase === 'connected'}
              onClick={() => openRevit()}
              shortcutHint={revit.phase === 'connected' ? `Revit ${revit.revit ?? ''}: ${revit.document?.title ?? 'no model open'}` : 'find Revit and pair with the code from Shanku → Connect'}
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
              shortcutHint={!revitLinked ? 'load the model from Revit first' : !bridge.canLiveUpdate ? 'needs Shanku Bridge for Revit 0.5.0' : liveCount ? `bring in the ${liveCount} element${liveCount === 1 ? '' : 's'} changed in Revit` : 'nothing changed in Revit'}
            />
            <RibbonButton icon="importModel" label="Auto-update" active={autoUpdate} disabled={!canLive} onClick={() => setAutoUpdate((v) => !v)} shortcutHint="bring in Revit's changes as they happen (Revit exports them in the background)" />
            <RibbonButton icon="downloadIfc" label="Download IFC" disabled={!revitLinked} onClick={() => void downloadIfc()} shortcutHint={revitLinked ? 'a fresh IFC export of the Revit model, with every change since loading' : 'load the model from Revit first'} />
          </RibbonGroup>
          <RibbonGroup label="Selection">
            <RibbonButton icon="sync" label="Sync" active={revitSync} onClick={() => setRevitSync((v) => !v)} shortcutHint={revitLinked ? 'selection follows Revit both ways' : 'follows Revit once the model is loaded from Revit'} />
            <RibbonButton icon="selectSend" label="Send to Revit" disabled={revit.phase !== 'connected' || !revit.document || !m.model} onClick={() => void sendSelectionToRevit()} shortcutHint="select Shanku's selection in Revit now" />
            <RibbonButton icon="selectGet" label="Get from Revit" disabled={revit.phase !== 'connected' || !revit.document || !m.model} onClick={() => void getSelectionFromRevit()} shortcutHint="take Revit's current selection" />
          </RibbonGroup>
          <RibbonGroup label="Create">
            <RibbonButton icon="dxf" label="Export to Revit" disabled={!canExport} onClick={() => void exportToRevit()} shortcutHint={canExport ? 'build the DXF → 3D model natively in Revit (checked first, one undo)' : exportWhy} />
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
              else if (file?.kind === 'ifc') await openModelFile(file);
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
            annotations={marks}
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
            <StartPage onChooseIfc={openFromDisk} onChooseDxf={openDxfFromDisk} onSample={(smp) => void openSample(smp)} onGuide={() => openGuide()} busy={sampleBusy} />
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
          <FloatingWindow id="typeProps" title="Type Properties" open={wins.typeProps} onClose={() => toggleWin('typeProps', false)} initial={{ w: 760, h: 620 }} minWidth={480} minHeight={360}>
            {(() => {
              void paramsTick;
              const gid = selectedGids[0] ?? '';
              const idx = m.model ? m.model.elements.findIndex((e) => e.globalId === gid) : -1;
              return <TypeProperties element={paramsCache.current.get(gid) ?? null} model={m.model} index={idx >= 0 ? idx : null} onClose={() => toggleWin('typeProps', false)} />;
            })()}
          </FloatingWindow>
          <FloatingWindow id="changes" title="Changes for Revit" subtitle={revit.document?.title} open={wins.changes} onClose={() => toggleWin('changes', false)} initial={{ w: 760, h: 420 }} minWidth={520} minHeight={240}>
            <RevitChanges
              pending={pending}
              status={changeStatus}
              busy={changesBusy}
              canApply={canParams}
              why={revit.phase !== 'connected' ? 'Connect to Revit to check or apply.' : !revitLinked ? 'Revit is showing a different model.' : !bridge.canEditParams ? 'Update Shanku Bridge for Revit to 0.2.0.' : undefined}
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
          <FloatingWindow id="revit" title="Revit" subtitle="Shanku Bridge" open={wins.revit} onClose={() => toggleWin('revit', false)} initial={{ w: 460, h: 440 }} minWidth={380} minHeight={300}>
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
          <FloatingWindow id="guide" title="Guide & FAQ" subtitle={`Shanku ${APP_VERSION}`} open={wins.guide} onClose={() => toggleWin('guide', false)} initial={{ w: 900, h: 620 }} minWidth={560} minHeight={320}>
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
          <span className="app-divider" aria-hidden="true" />
          <div className="app-segmented" role="radiogroup" aria-label="Visual style">
            {STYLES.map((st) => (
              <button
                key={st.id}
                type="button"
                role="radio"
                aria-checked={displayStyle === st.id}
                className={displayStyle === st.id ? 'is-active' : undefined}
                title={st.keys ? `${st.label} (${st.keys})` : st.id === 'realistic' ? 'Realistic: sun and sky light on concrete (try with Shadows)' : st.label}
                onClick={() => setDisplayStyle(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
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
            {sel.length ? <span className="app-sel__dot" aria-hidden="true" /> : null}
            {selLabel}
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

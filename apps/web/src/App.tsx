import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { CATEGORY_PLURAL, DEFAULT_GRADE_RULES, DEFAULT_MARK_RULES, ENGINE_VERSION, EXPLODE_MODES, boxState, type ExplodeMode, type CameraState, type Category, type DisplayStyle, type PipelineQa, type SectionBoxState } from '@shanku/engine';
import { Browser } from './components/Browser';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport, type ViewportHandle } from './components/Viewport';
import { fmtCount } from './lib/format';
import { fileFromDrop, pickFile, pickIfcFile } from './lib/openFile';
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
import { marksFor } from './lib/viewMarks';
import { DEFAULT_CUT, DEFAULT_DEPTH_OFFSET, KIND_LABEL, defaultViews, duplicateView, isTwoD, levelHeights, nextSectionName, normalizeView, sectionFromVerticalView, validRange, viewClip, viewDirection, type ModelView } from './lib/views';
import { enterFullscreen } from './lib/fullscreen';
import { QuickAccess } from './components/QuickAccess';
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

const APP_VERSION = '0.24.0';
const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent', keys: 'CO' },
  { id: 'hiddenLine', label: 'Hidden line', keys: 'HL' },
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
];
const RIBBON_TABS = ['Model', 'View', 'Manage'].map((label) => ({ id: label.toLowerCase(), label }));


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
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('shaded');
  const [sectionBox, setSectionBox] = useState(false);
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
  const [wins, setWins] = useState({ boq: false, pipeline: false, keys: false, guide: false });
  // Guide & FAQ (F1): which section to open on
  const [guideSection, setGuideSection] = useState<string | undefined>(undefined);
  const openGuide = (section?: string) => {
    setGuideSection(section);
    setWins((w) => ({ ...w, guide: true }));
  };
  // Exploded view (3D views only): mode and spread 0-1; display only, reset for every new file.
  const [explode, setExplode] = useState<{ mode: ExplodeMode; amount: number } | null>(null);
  const toggleWin = (k: keyof typeof wins, v?: boolean) => setWins((w) => ({ ...w, [k]: v ?? !w[k] }));
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
    const defaults = m.model ? defaultViews(m.model.info.levels, levelHeights(m.model.info.levels, m.model.elements, m.model.info.units.length)) : [];
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
  }, [m.model?.info]);

  const openDrawing = useCallback(
    async (file: { name: string; bytes: ArrayBuffer }) => {
      try {
        const id = await dx.open(file);
        if (id) setActiveView(id);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      }
    },
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
      if (file) await m.open(file);
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
    else if (f) void m.open(f);
    else if (start.sample) void openSampleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const openSample = useCallback(async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-frame.ifc`);
    if (!res.ok) return m.log('The sample model could not be loaded.', 'error');
    await m.open({ name: 'sample-frame.ifc', bytes: await res.arrayBuffer() });
  }, [m]);
  const openSampleRef = useRef(openSample);
  openSampleRef.current = openSample;

  // Revit commands (two-letter sequences, Home, Esc).
  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (activeDoc) {
        if (cmd === 'fit') drawingView.current?.fit();
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
    const ids = annSel.filter((id) => id.startsWith('section:'));
    if (!ids.length) return;
    const before = viewsRef.current, after = before.filter((v) => !ids.includes(v.id));
    history.run(ids.length > 1 ? `Delete ${ids.length} sections` : `Delete ${before.find((v) => v.id === ids[0])?.name ?? 'section'}`, (tx) => tx.change('views', before, after, setViews));
    setOpenViews((o) => o.filter((x) => !ids.includes(x)));
    setAnnSel([]);
  });

  // Undo / redo, as in Revit: Ctrl + Z, Ctrl + Y (and Ctrl + Shift + Z)
  const heights = useMemo(() => (m.model ? levelHeights(m.model.info.levels, m.model.elements, m.model.info.units.length) : new Map<string, number>()), [m.model?.info]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => {
    const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const e of m.model?.elements ?? []) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], e.bounds[k]);
      max[k] = Math.max(max[k], e.bounds[k + 3]);
    }
    return { min, max };
  }, [m.model?.info]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeModelView = views.find((v) => v.id === activeView) ?? null;
  // View symbols for the active view (section / elevation marks in plans, levels in elevations).
  const marks = useMemo(() => marksFor(activeModelView, views, heights, bounds), [activeModelView, views, heights, bounds]);
  const resolved = useMemo(() => (m.model ? resolveGraphics(m.model.elements, graphics) : { hidden: [], overrides: [] }), [m.model, graphics]);
  const viewHidden = useMemo(() => (resolved.hidden.length ? [...new Set([...hidden, ...resolved.hidden])] : hidden), [hidden, resolved.hidden]);
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
  }, [activeView, m.model]);

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
          { section: 'Constraints', label: 'Elevation', unit: 'mm', value: h !== undefined ? mm(h) : '—' },
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
      { id: 'file.dxfTo3d', title: 'DXF → 3D: build an IFC model from a drawing', group: 'File', keywords: 'pipeline convert computer help', run: () => (pipe ? toggleWin('pipeline', true) : void pipeline.start()) },
      { id: 'file.sample', title: 'Open the sample model', group: 'File', keywords: 'demo example frame', run: () => void openSample() },
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
      ...STYLES.map((st) =>
        legacy(({ shaded: 'shaded', consistent: 'consistent', hiddenLine: 'hiddenLine', wireframe: 'wireframe' } as const)[st.id], `Visual style: ${st.label}`, 'View', needModel, { checked: displayStyle === st.id }),
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
        checked: explode?.mode === md.id,
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
      { id: 'views.templates', title: 'View templates…', group: 'Views', keywords: 'template apply', enabled: hasModel, why: needModel, run: () => setVtOpen(true) },
      // Windows
      ...(
        [
          ['properties', 'Properties'],
          ['browser', 'Project Browser'],
          ['activity', 'Activity'],
          ['console', 'Python console'],
        ] as const
      ).map(([id, title]) => ({ id: `window.${id}`, title: `Show ${title}`, group: 'Windows' as const, checked: openPanels.includes(id), keys: id === 'console' ? 'Ctrl + `' : undefined, run: () => dock.current?.toggle(id) })),
      { id: 'window.boq', title: 'Bill of quantities (BOQ)', group: 'Windows', keywords: 'quantities rates excel export', checked: wins.boq, enabled: hasModel, why: needModel, run: () => toggleWin('boq') },
      { id: 'window.reset', title: 'Reset window layout', group: 'Windows', keywords: 'panels dock', run: () => dock.current?.reset() },
      // Manage
      { id: 'manage.marks', title: 'Mark rules…', group: 'Manage', keywords: 'property mark', enabled: hasModel, why: needModel, run: () => setMarkDialog(true) },
      { id: 'manage.grades', title: 'Grade rules…', group: 'Manage', keywords: 'concrete grade property', enabled: hasModel, why: needModel, run: () => setGradeDialog(true) },
      // Help
      { id: 'help.guide', title: 'Guide & FAQ', group: 'Help', keys: 'F1', keywords: 'help manual documentation', run: () => openGuide() },
      { id: 'help.keys', title: 'Keyboard shortcuts', group: 'Help', keywords: 'keys hotkeys', run: () => openGuide('keys') },
      { id: 'help.whatsNew', title: "What's new", group: 'Help', keywords: 'release changelog version', run: () => openGuide('news') },
    ];
    return list;
  };

  /** Exploding again in the same mode collapses it; another mode switches (from assembled). */
  const toggleExplode = (mode: ExplodeMode) => {
    if (!m.model) return;
    if (isTwoD(activeModelView ?? undefined) || activeDoc) return setNotice('Exploded views are for 3D views.');
    setExplode((cur) => (cur?.mode === mode ? null : { mode, amount: cur?.amount && cur.amount > 0 ? cur.amount : 0.6 }));
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
  return (
    <AppShell
      titleBar={
        <TitleBar
          fileName={info?.fileName ?? 'No model open'}
          brandHref={import.meta.env.BASE_URL}
          quickAccess={<QuickAccess history={history} onOpen={openFromDisk} onHome={() => viewport.current?.home()} canHome={!!m.model} />}
          saveState={info ? 'Opened from this device' : undefined}
          search={<CommandPalette inputRef={search} getCommands={getCommands} findElement={findElement} />}
          actions={
            <>
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
          </RibbonGroup>
          <RibbonGroup label="Structure">
            {(['column', 'beam', 'wall', 'slab', 'footing'] as const).map((k) => (
              <RibbonButton key={k} icon={k} label={k[0].toUpperCase() + k.slice(1)} twoTone disabled shortcutHint="modelling arrives in 0.2" />
            ))}
          </RibbonGroup>
          <RibbonGroup label="Select">
            <RibbonButton icon="byid" label="By ID" onClick={() => search.current?.focus({ preventScroll: true })} shortcutHint="Ctrl + K" />
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
                active={explode?.mode === md.id}
                disabled={!m.model || !!activeDoc || isTwoD(activeModelView ?? undefined)}
                onClick={() => toggleExplode(md.id)}
                shortcutHint={`${md.hint.toLowerCase()} (3D views; click again to collapse)`}
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
              ] as const
            ).map(([id, icon, label]) => (
              <RibbonButton key={id} icon={icon} label={label} active={openPanels.includes(id)} onClick={() => dock.current?.toggle(id)} shortcutHint="show or hide" />
            ))}
            <RibbonButton icon="keyboard" label="Keys" active={wins.keys} onClick={() => toggleWin('keys')} shortcutHint="keyboard shortcuts" />
            <RibbonButton icon="guide" label="Guide" active={wins.guide} onClick={() => (wins.guide ? toggleWin('guide', false) : openGuide())} shortcutHint="Guide & FAQ (F1)" />
            <RibbonButton icon="layout" label="Reset" onClick={() => dock.current?.reset()} shortcutHint="default layout: browser left, properties right" />
          </RibbonGroup>
            </>
          ) : (
            <>
          <RibbonGroup label="Settings">
            <RibbonButton icon="byid" label="Marks" disabled={!m.model} onClick={() => setMarkDialog(true)} shortcutHint="which property is the mark" />
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
              if (file?.kind === 'dxf') await openDrawing(file);
              else if (file) await m.open(file);
            } catch (err) {
              setNotice(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          {dx.docs.map((d) =>
            d.id === activeView ? <DrawingView key={d.id} ref={drawingView} doc={d} onCursor={(x, y) => setCursor({ x, y })} onSelect={(e) => dx.select(d.id, e)} canvasTheme={canvasTheme} describe={(ent) => dx.getClient().entity(d.drawing.drawingId, d.drawing.handles[ent])} /> : null,
          )}
          <div className="app-view3d" hidden={activeDoc !== null}>
          <Viewport
            ref={viewport}
            model={m.model}
            selection={sel}
            hidden={viewHidden}
            temporary={hidden.length > 0}
            overrides={resolved.overrides}
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
            toolActive={sectionTool}
            onBoxSelect={(ids, mode, anns) => {
              setAnnSel((cur) => applyMode(mode === 'replace' ? [] : cur, anns ?? [], mode === 'replace' ? 'add' : mode));
              m.boxSelect(ids, mode);
            }}
            edges={edges}
            canvasTheme={canvasTheme}
            twoD={isTwoD(activeModelView ?? undefined)}
            hiddenLines={!!activeModelView?.hiddenLines}
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
          </div>
          {!activeDoc && m.model && (sectionBox || zoomRegion) ? (
            <div className="app-viewstate" role="status">
              {sectionBox ? <span>Section box · BX removes</span> : null}
              {zoomRegion ? <span>Drag a region to zoom · Esc cancels</span> : null}
            </div>
          ) : null}
          {load.status === 'idle' && !m.model && !activeDoc && !dx.loading ? (
            <div className="app-overlay">
              <p className="app-overlay__title">Open an IFC model or a DXF drawing</p>
              <p className="app-overlay__text">Drop an .ifc or .dxf file here, or choose one. Files are read on this device and never uploaded.</p>
              <div className="app-overlay__actions">
                <Button variant="primary" onClick={openFromDisk}>
                  Open IFC file
                </Button>
                <Button onClick={openDxfFromDisk}>Open DXF drawing</Button>
                <Button onClick={openSample}>Try the sample frame</Button>
              </div>
            </div>
          ) : null}
          {load.status === 'loading' ? (
            <div className="app-overlay" role="status" aria-live="polite">
              <p className="app-overlay__title">Opening {load.fileName}</p>
              <p className="app-overlay__text">
                {load.total ? `${fmtCount(load.done)} of ${fmtCount(load.total)} elements` : 'Reading the file…'}
              </p>
              <div className="app-progress" aria-hidden="true">
                <div className="app-progress__bar" style={{ width: `${load.total ? (100 * load.done) / load.total : 5}%` }} />
              </div>
            </div>
          ) : null}
          {dx.loading ? (
            <div className="app-overlay" role="status" aria-live="polite">
              <p className="app-overlay__title">Opening {dx.loading.name}</p>
              <p className="app-overlay__text">{dx.loading.phase}</p>
              <div className="app-progress app-progress--busy" aria-hidden="true">
                <div className="app-progress__bar" />
              </div>
            </div>
          ) : null}
          {load.status === 'error' && !activeDoc ? (
            <div className="app-overlay" role="alert">
              <p className="app-overlay__title">That file didn’t open</p>
              <p className="app-overlay__text">{load.message}</p>
              <div className="app-overlay__actions">
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
                  />
                )}
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
            <span className="app-spacer" />
            <span className="app-hint">2D · Middle-drag pan · Wheel zoom · Double middle-click fit · Alt + drag on a trackpad</span>
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
                title={`${st.label} (${st.keys})`}
                onClick={() => setDisplayStyle(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
          <span className="app-divider" aria-hidden="true" />
          <Button size="sm" variant="ghost" onClick={() => runCommand('sectionBox')} disabled={!m.model || (!sectionBox && !sel.length)} title="Section box around the selection (BX)">
            Section box: {sectionBox ? 'On' : 'Off'}
          </Button>
          {explode && !isTwoD(activeModelView ?? undefined) ? (
            <span className="app-explode" role="group" aria-label="Exploded view">
              <label htmlFor="explode-spread" title={`Exploded view: ${EXPLODE_MODES.find((md) => md.id === explode.mode)?.label.toLowerCase()}`}>Spread</label>
              <input
                id="explode-spread"
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(explode.amount * 100)}
                onChange={(e) => setExplode({ mode: explode.mode, amount: Number(e.target.value) / 100 })}
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
                    view={
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
              <span className="app-coords" aria-label="Cursor position">
                {cursor ? `X ${cursor.x.toFixed(1)}   Y ${cursor.y.toFixed(1)}` : 'X —   Y —'} {activeDoc.units}
              </span>
              <span className="app-divider" aria-hidden="true" />
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

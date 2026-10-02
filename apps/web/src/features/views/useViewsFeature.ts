import { type DockWorkspaceHandle, type PanelId } from '../../components/DockWorkspace';
import { type ColorSettings, loadColorSettings, saveColorSettings, computeColors, mergeOverrides, type ColorMode } from '../../lib/colorBy';
import { type AppliedFilter, type ViewFilter } from '../../lib/filters';
import { saveViews, loadModel, loadDrawings } from '../../lib/session';
import { type ShareInfo, type MyShare } from '../../lib/sharedModel';
import { type CommandId } from '../../lib/shortcuts';
import { useHistory } from '../../lib/useHistory';
import { type useShankuModel } from '../../lib/useShankuModel';
import { marksFor } from '../../lib/viewMarks';
import { type ModelView, levelHeights, isTwoD, viewClip, viewDirection, duplicateView, nextSectionName, sectionFromVerticalView } from '../../lib/views';
import { type ViewTemplate, loadTemplates, saveTemplates, type ViewState, applyTemplate } from '../../lib/viewTemplates';
import { resolveGraphics, type ViewGraphics, type CategoryOverrides, type GraphicsOverride, EMPTY_GRAPHICS } from '../../lib/visibility';
import { type CameraState, type GridSpec, type SectionBoxState, type ExplodeMode, projectZeroY, type Vec3, followModel, boxState } from '@shanku/engine';
import { useState, useRef, useEffect, useMemo } from 'react';

/** Values App declares after this feature: read through a ref, in callbacks and effects only. */
export interface ViewsFeatureLate {
  dx: { docs: import('../../lib/useDrawings').DrawingDoc[]; loading: { name: string; phase: string; } | null; open: (file: import('../../lib/openFile').PickedFile) => Promise<string | null>; close: (id: string) => void; update: (id: string, patch: Partial<Pick<import('../../lib/useDrawings').DrawingDoc, "layerOn" | "units" | "objects">>) => void; select: (id: string, entities: number[] | null) => void; getClient: () => import('../../../../../packages/engine/src/dxf/client').DxfClient; };
  setIfcColor: React.Dispatch<React.SetStateAction<string | null>>;
  sel: number[];
}

export interface ViewsFeatureDeps {
  displayStyle: import('../../../../../packages/engine/src/render/Viewer').DisplayStyle;
  edges: boolean;
  graphics: import('../../lib/visibility').ViewGraphics;
  graphicsRef: React.MutableRefObject<import('../../lib/visibility').ViewGraphics>;
  hidden: number[];
  m: ReturnType<typeof useShankuModel>;
  openedInfo: import('../../../../../packages/engine/src/model/types').ModelInfo | undefined;
  sectionBox: boolean;
  setDimSel: React.Dispatch<React.SetStateAction<string[]>>;
  setDimTool: (next: import('../../../../../packages/engine/src/render/dimensions').DimensionKind | null) => void;
  setDisplayStyle: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/Viewer').DisplayStyle>>;
  setEdges: React.Dispatch<React.SetStateAction<boolean>>;
  setGraphics: React.Dispatch<React.SetStateAction<import('../../lib/visibility').ViewGraphics>>;
  setHidden: React.Dispatch<React.SetStateAction<number[]>>;
  setMeasure: (next: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | ((cur: import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) => import('../../../../../packages/engine/src/render/measureTool').MeasureMode | null) | null) => void;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setSectionBox: React.Dispatch<React.SetStateAction<boolean>>;
  start: import('../../App').AppStart | undefined;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  late: { current: ViewsFeatureLate };
}

export function useViewsFeature(deps: ViewsFeatureDeps) {
  const { displayStyle, edges, graphics, graphicsRef, hidden, m, openedInfo, sectionBox, setDimSel, setDimTool, setDisplayStyle, setEdges, setGraphics, setHidden, setMeasure, setNotice, setSectionBox, start, viewport, late } = deps;
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
      for (const d of await loadDrawings()) await late.current.dx.open(d).catch(() => undefined);
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
  const [shareInfoState, setShareInfoState] = useState<ShareInfo | null>(null);
  const [myShareList, setMyShareList] = useState<MyShare[]>([]);
  const [wins, setWins] = useState({ boq: false, pipeline: false, keys: false, guide: false, revit: false, changes: false, typeProps: false, exportRevit: false, editGeom: false });
  /** The Move / Rotate tool's mode. */
  const [geomMode, setGeomMode] = useState<'move' | 'rotate'>('move');
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

  const closeView = (id: string) => {
    if (id !== '3d' && viewsRef.current.some((v) => v.id === id)) {
      setOpenViews((o) => o.filter((x) => x !== id));
      if (activeView === id) setActiveView('3d');
      return;
    }
    if (id === '3d') {
      m.close();
      late.current.setIfcColor(null);
      setHidden([]);
      setSectionBox(false);
      setWins((w) => ({ ...w, boq: false }));
      m.log('Model closed.');
      if (late.current.dx.docs.length) setActiveView(late.current.dx.docs[0].id);
      return;
    }
    late.current.dx.close(id);
    if (id === activeView) setActiveView(m.model || late.current.dx.docs.length <= 1 ? '3d' : late.current.dx.docs.find((d) => d.id !== id)!.id);
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
    for (const i of late.current.sel) {
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

  // The model's extent or its levels changed (a move, a copy, a level moved): the active view's range follows, the
  // camera stays. Found: an element moved ~10 m away vanished from a plan, and Fit kept to the old extent, until
  // the view was opened again.
  // The grid under the model (the view bar's Grid; remembered, on by default): CAD-style on a plan's level or an
  // elevation's plane (its zero lines: the model's origin and the project's ±0), Blender-style on the ±0 ground in 3D.
  const [gridOn, setGridOn] = useState(() => {
    try {
      return localStorage.getItem('shanku.grid') !== 'off';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('shanku.grid', gridOn ? 'on' : 'off');
    } catch {
      // private browsing: the grid simply isn't remembered
    }
  }, [gridOn]);
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const v = activeModelView;
    let spec: GridSpec | null = null;
    if (m.model) {
      if (!v || v.kind === '3d') spec = { mode: '3d', origin: [0, zY, 0], u: [1, 0, 0], v: [0, 0, -1] };
      else if (v.kind === 'plan') {
        const y = v.level !== undefined ? heights.get(v.level) : undefined;
        if (y !== undefined) spec = { mode: '2d', origin: [0, y, 0], u: [1, 0, 0], v: [0, 0, -1] };
      } else {
        const look = viewDirection(v);
        if (look) {
          const l = Math.hypot(look[0], look[2]) || 1;
          spec = { mode: '2d', origin: [0, zY, 0], u: [-look[2] / l, 0, look[0] / l], v: [0, 1, 0] };
        }
      }
    }
    vp.setGrid(spec);
    vp.setGridVisible(gridOn);
  }, [activeModelView, heights, zY, gridOn, m.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const appliedClip = useRef('');
  useEffect(() => {
    const vp = viewport.current;
    if (!vp || !activeModelView) return;
    const clip = viewClip(activeModelView, heights, bounds);
    if (!clip) return;
    const key = JSON.stringify(clip);
    if (key === appliedClip.current) return;
    appliedClip.current = key;
    vp.setSectionBoxState(boxState(clip.center, clip.half, clip.angle));
  }, [bounds, heights]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return { gridOn, setGridOn, activeModelView, activeView, annSel, applyElementGraphics, applyFilterDefs, applyMode, applyTemplateToView, applyViewGraphics, applyViewTemplate, boxStore, camStore, cancelSection, closeView, colorResult, colorSettings, curSelection, deleteModelView, dimOrigin, dock, duplicateModelView, explode, geomMode, gradeDialog, graphicsFor, gripStart, guideSection, heights, hideStore, history, lastCommand, loadedView, markDialog, marks, myShareList, openGuide, openPanels, openView, openViews, prevSelection, renameView, reveal, sectionTool, setActiveView, setAnnSel, setColorMode, setColorSettings, setExplode, setGeomMode, setGradeDialog, setLastCommand, setMarkDialog, setMyShareList, setOpenPanels, setOpenViews, setRenameView, setReveal, setShareInfoState, setTemplates, setViewMenu, setViewRange, setViews, setVtFocus, setVtMenu, setVtOpen, setZoomRegion, shareInfoState, startSection, templates, toggleWin, viewHidden, viewMenu, viewOverrides, viewState, views, viewsRef, vtFocus, vtMenu, vtOpen, wins, zY, zoomRegion };
}

import { APP_VERSION } from '../../app/constants';
import { type DrawingViewHandle } from '../../components/DrawingView';
import { type ExportState } from '../../components/ExportToRevit';
import { nextDocColor } from '../../lib/documents';
import { downloadFile } from '../../lib/excel';
import { approvedOnly } from '../../lib/exportPlan';
import { type Diagnosis, diagnoseFile } from '../../lib/fileDiagnosis';
import { fmtCount } from '../../lib/format';
import { type ChangeSet, NO_CHANGES, changeCount, addChanges, toExport, remapIndices, remapRecord, withoutMerged } from '../../lib/liveUpdate';
import { proposeMarks } from '../../lib/marks';
import { pickFile } from '../../lib/openFile';
import { type RevitElementParams, type PendingChange, type TypeChoice, stageOp, stageEdit, commonParams, changeKey, byGroup, effectiveCommon, toEditOp, afterApply, changesGeometry } from '../../lib/paramEdits';
import { withTask } from '../../lib/progress';
import { type RateBook, emptyRates, loadRates, saveRates } from '../../lib/rates';
import { RevitBridge, indicesForRevitSelection } from '../../lib/revitBridge';
import { loadViews, loadGraphics, loadModel } from '../../lib/session';
import { useDrawings } from '../../lib/useDrawings';
import { type useHistory } from '../../lib/useHistory';
import { type useShankuModel } from '../../lib/useShankuModel';
import { defaultViews, levelHeights, type ModelView, normalizeView } from '../../lib/views';
import { EMPTY_GRAPHICS, type ViewGraphics } from '../../lib/visibility';
import { projectZeroY, ENGINE_VERSION, type Finding } from '@shanku/engine';
import { useShortcut, TOGGLE_BOTTOM_PANEL } from '@shanku/ui';
import { useMemo, useSyncExternalStore, useState, useRef, useEffect, useCallback } from 'react';

/** Values App declares after this feature: read through a ref, in callbacks and effects only. */
export interface RevitLinkLate {
  inModel: (fn: () => void) => void;
  pipeline: { state: import('../../components/PipelinePanel').PipelineState | null; start: () => Promise<void>; build: () => Promise<void>; exportPlan: () => Promise<import('../../../../../packages/engine/src/pipeline/types').RevitExchange>; download: () => void; setName: (n: number, name: string) => void; setHeight: (n: number, h: number) => void; };
}

export interface RevitLinkDeps {
  activeView: string;
  boxStore: React.MutableRefObject<Map<string, import('../../../../../packages/engine/src/render/sectionBox').SectionBoxState | null>>;
  camStore: React.MutableRefObject<Map<string, import('../../../../../packages/engine/src/render/Viewer').CameraState>>;
  dock: React.RefObject<import('../../components/DockWorkspace').DockWorkspaceHandle>;
  graphicsFor: React.MutableRefObject<string | null>;
  hideStore: React.MutableRefObject<Map<string, number[]>>;
  history: ReturnType<typeof useHistory>;
  loadedView: React.MutableRefObject<string>;
  m: ReturnType<typeof useShankuModel>;
  openGuide: (section?: string | undefined) => void;
  openedInfo: import('../../../../../packages/engine/src/model/types').ModelInfo | undefined;
  setActiveView: React.Dispatch<React.SetStateAction<string>>;
  setDisplayStyle: React.Dispatch<React.SetStateAction<import('../../../../../packages/engine/src/render/Viewer').DisplayStyle>>;
  setEdges: React.Dispatch<React.SetStateAction<boolean>>;
  setExplode: React.Dispatch<React.SetStateAction<{ modes: import('../../../../../packages/engine/src/render/explode').ExplodeMode[]; amount: number; } | null>>;
  setGeomMode: React.Dispatch<React.SetStateAction<"move" | "rotate">>;
  setGraphics: React.Dispatch<React.SetStateAction<import('../../lib/visibility').ViewGraphics>>;
  setHidden: React.Dispatch<React.SetStateAction<number[]>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenViews: React.Dispatch<React.SetStateAction<string[]>>;
  setSectionBox: React.Dispatch<React.SetStateAction<boolean>>;
  setViews: React.Dispatch<React.SetStateAction<import('../../lib/views').ModelView[]>>;
  toggleWin: (k: "keys" | "revit" | "boq" | "pipeline" | "guide" | "changes" | "typeProps" | "exportRevit" | "editGeom", v?: boolean | undefined) => void;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  wins: { boq: boolean; pipeline: boolean; keys: boolean; guide: boolean; revit: boolean; changes: boolean; typeProps: boolean; exportRevit: boolean; editGeom: boolean; };
  late: { current: RevitLinkLate };
}

export function useRevitLink(deps: RevitLinkDeps) {
  const { activeView, boxStore, camStore, dock, graphicsFor, hideStore, history, loadedView, m, openGuide, openedInfo, setActiveView, setDisplayStyle, setEdges, setExplode, setGeomMode, setGraphics, setHidden, setNotice, setOpenViews, setSectionBox, setViews, toggleWin, viewport, wins, late } = deps;

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
  /** "Structural Columns C-1", or "12 elements" for a larger selection. */
  const selectionLabel = (gids: readonly string[]) => (gids.length === 1 ? elementLabel(gids[0], paramsCache.current.get(gids[0])) : `${fmtCount(gids.length)} elements`);
  const stageChange = (title: string, after: PendingChange[]) => {
    const before = pending;
    history.run(title, (tx) => tx.change('revit-pending', before, after, setPending));
    setLastApplied(null);
  };
  /** The selection to another type of its category (Revit's type selector). */
  const stageTypeSwitch = (t: TypeChoice) => {
    const gids = [...selectedGids];
    stageChange(`Change type to ${t.name}`, stageOp(pending, { kind: 'setType', globalIds: gids, typeId: t.id, familyName: t.family, typeName: t.name, name: 'Type', value: `${t.family}: ${t.name}`, element: selectionLabel(gids) }));
    setNotice(`${gids.length === 1 ? 'Its type change is' : `The type change for ${gids.length} elements is`} waiting in Changes for Revit: check, then apply.`);
  };
  /** Edits from the Type Properties dialog (OK or Apply): type parameters and duplicated types. */
  const commitTypeDraft = (draft: PendingChange[]) => {
    if (!draft.length) return;
    let after = [...pending];
    for (const c of draft) {
      if (c.kind === 'typeParam') after = after.filter((x) => !(x.globalId === c.globalId && x.paramId === c.paramId && x.name === c.name));
      after.push(c);
    }
    stageChange(`Edit type (${draft.length} change${draft.length === 1 ? '' : 's'})`, after);
    toggleWin('changes', true);
  };
  /** Why Move / Rotate cannot be used now, or null. */
  const editWhy: string | null = !revitLinked
    ? 'load the model from Revit first: Revit makes the edit'
    : !bridge.canEdit
      ? `moving and rotating needs Shanku Bridge for Revit 0.12.0 (this Revit has ${revit.addin ?? 'an older add-in'})`
      : !selectedGids.length
        ? 'select elements first'
        : null;
  const openGeom = (mode: 'move' | 'rotate') => {
    if (editWhy) return setNotice(editWhy[0].toUpperCase() + editWhy.slice(1) + '.');
    setGeomMode(mode);
    toggleWin('editGeom', true);
  };
  /** A move or rotation of the selection, from the Move and Rotate tools. */
  const stageGeometry = (g: { kind: 'move'; dx: number; dy: number; dz: number } | { kind: 'rotate'; angle: number; about: 'each' | 'group' }) => {
    const gids = [...selectedGids];
    const mm = (v: number) => `${v >= 0 ? '' : '−'}${Math.abs(v).toLocaleString('en-IN')}`;
    const value = g.kind === 'move' ? `ΔX ${mm(g.dx)}, ΔY ${mm(g.dy)}, ΔZ ${mm(g.dz)} mm` : `${g.angle}° about ${g.about === 'each' ? 'each element’s centre' : 'the selection’s centre'}`;
    stageChange(`${g.kind === 'move' ? 'Move' : 'Rotate'} ${gids.length} element${gids.length === 1 ? '' : 's'}`, stageOp(pending, { ...g, globalIds: gids, name: g.kind === 'move' ? 'Move' : 'Rotate', value, element: selectionLabel(gids) }));
    toggleWin('changes', true);
    setNotice(`${g.kind === 'move' ? 'The move' : 'The rotation'} is waiting in Changes for Revit: check, then apply. Shanku shows the result once Revit has it.`);
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
    late.current.inModel(() => {
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
      header: (() => {
        // Revit's type selector: the category's types, and a staged switch shown as the value
        const sameCat = els.every((e) => e.category === els[0].category);
        const staged = [...pending].reverse().find((c) => c.kind === 'setType' && c.globalIds?.length === selectedGids.length && selectedGids.every((g) => c.globalIds!.includes(g)));
        return {
          family,
          typeName,
          category,
          count: els.length,
          types: sameCat && bridge.canEdit ? els[0].types : undefined,
          typeId: staged?.typeId ?? same((e) => e.typeId ?? null),
          typeModified: !!staged,
          onChangeType: bridge.canEdit ? stageTypeSwitch : undefined,
        };
      })(),
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
    if (!late.current.pipeline.state?.summary) {
      setNotice('Export to Revit: pick the DXF drawing first; then press Export to Revit again.');
      void late.current.pipeline.start();
      return;
    }
    toggleWin('exportRevit', true);
    setExportOff(new Set());
    setExportState({ phase: 'preparing', target: revit.document!.title });
    try {
      const exchange = await withTask('revit', 'Export to Revit', 'Reading the drawing for Revit…', () => late.current.pipeline.exportPlan());
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
      // add-in 0.12.0+: every kind of change (parameters, types, moves, rotations) in one Revit undo
      const r = bridge.canEdit
        ? await bridge.editElements(revitLink.key, sent.map(toEditOp), dryRun)
        : await bridge.writeParams(
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
        // moved, turned or retyped elements (and a type's new values on all its instances): read again,
        // and bring their geometry over from Revit
        const reshaped = sent.filter((c, i) => changesGeometry(c) && r.results[i]?.ok);
        if (reshaped.length) {
          paramsCache.current.clear();
          if (canLive) setTimeout(() => void updateRef.current(), 600);
        }
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

  return { activeDoc, autoUpdate, boqSelect, bridge, canExport, canLive, canParams, changeRates, changeStatus, changeWarnings, changesBusy, commitTypeDraft, confirmMarks, createInRevit, cursor, diagnose, diagnosedFor, diagnosis, downloadIfc, drawingView, dx, editWhy, elementLabel, exportOff, exportState, exportToRevit, exportWhy, getSelectionFromRevit, ifcColor, lastApplied, lastFile, liveBusy, liveCount, loadFromRevit, markBusy, markProposal, openDrawing, openDxfFromDisk, openGeom, openModelFile, openRevit, paramsCache, paramsTick, pending, qaFix, rates, refreshChanges, revit, revitLink, revitLinked, revitLoading, revitProps, revitSync, runChanges, selectedGids, sendSelectionToRevit, setAutoUpdate, setCursor, setDiagnosis, setExportOff, setIfcColor, setMarkProposal, setPending, setRevitSync, showInRevit, snapshot, stageGeometry, updateFromRevit };
}

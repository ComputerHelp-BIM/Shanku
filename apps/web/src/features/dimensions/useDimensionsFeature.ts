import { type CommandId } from '../../lib/shortcuts';
import { type useHistory } from '../../lib/useHistory';
import { type useShankuModel } from '../../lib/useShankuModel';
import { type PlacedDimension, type DimensionKind, DIMENSION_TOOLS, dimensionSummary, dimensionValues, runChecks } from '@shanku/engine';
import { useMemo } from 'react';

export interface DimensionsFeatureDeps {
  activeDoc: import('../../lib/useDrawings').DrawingDoc | null;
  activeModelView: import('../../lib/views').ModelView | null;
  activeView: string;
  annSel: string[];
  dimOrigin: import('../../../../../packages/engine/src/render/dimensions').Vec3;
  dimSel: string[];
  heights: Map<string, number>;
  history: ReturnType<typeof useHistory>;
  m: ReturnType<typeof useShankuModel>;
  runCommand: (cmd: import('../../lib/shortcuts').CommandId) => void;
  setActiveView: React.Dispatch<React.SetStateAction<string>>;
  setDimSel: React.Dispatch<React.SetStateAction<string[]>>;
  setHidden: React.Dispatch<React.SetStateAction<number[]>>;
  setLastCommand: React.Dispatch<React.SetStateAction<{ id: import('../../lib/shortcuts').CommandId; label: string; } | null>>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setViewRange: (id: string, patch: Partial<import('../../lib/views').ModelView>) => void;
  setViews: React.Dispatch<React.SetStateAction<import('../../lib/views').ModelView[]>>;
  viewport: React.RefObject<import('../../components/Viewport').ViewportHandle>;
  views: import('../../lib/views').ModelView[];
  viewsRef: React.MutableRefObject<import('../../lib/views').ModelView[]>;
  zY: number;
}

export function useDimensionsFeature(deps: DimensionsFeatureDeps) {
  const { activeDoc, activeModelView, activeView, annSel, dimOrigin, dimSel, heights, history, m, runCommand, setActiveView, setDimSel, setHidden, setLastCommand, setNotice, setViewRange, setViews, viewport, views, viewsRef, zY } = deps;

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

  return { deleteDimensions, dimPropsFor, inModel, placeDimension, qaActions, qaReport, run, setViewDims, symbolPropsFor };
}

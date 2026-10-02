/**
 * Move and Align Revit's way (docs/design/datums-and-constraints.md): Move (MV) and Copy (CO) select before or
 * after starting (Enter ends selecting), then a start point and an end point with snaps, or a typed distance;
 * Constrain and Copy in the options bar. Plans move in plan; elevations and sections move in the view's plane,
 * so a vertical move changes offsets. Align (AL): click a grid or reference plane, then an element's face or
 * centreline; Lock keeps it there. All on the shared point picker.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { planWorkPlane, type P2, type PickOptions, type PickStatus, type WorkPlane } from '@shanku/engine';
import type { ModifyRequest } from '../../lib/editChecks';
import { viewDirection, type ModelView } from '../../lib/views';
import type { useShankuModel } from '../../lib/useShankuModel';
import type { Datum } from '../datums/useDatums';

export type ModifyTool =
  | { kind: 'move'; copy: boolean; constrain: boolean; phase: 'select' | 'pick' }
  | { kind: 'align'; lock: boolean; phase: 'reference' | 'element'; ref?: { id: string; name: string } };

export interface ModifyToolsDeps {
  m: ReturnType<typeof useShankuModel>;
  setNotice: (n: string | null) => void;
  activeModelView: ModelView | null;
  heights: Map<string, number>;
  datums: Datum[];
  revitLinked: boolean;
  openGeom: (mode: 'move' | 'rotate') => void;
  nativePerform: (r: ModifyRequest) => void;
  alignTo: (gid: string, datumId: string, to: 'center' | 'face', lock: boolean) => void;
}

const BIG = 1e7; // datum lines in elevations: long enough to cross any model

export function useModifyTools(d: ModifyToolsDeps) {
  const [tool, setTool] = useState<ModifyTool | null>(null);
  const [pick, setPick] = useState<PickOptions | null>(null);
  const [status, setStatus] = useState<PickStatus | null>(null);
  const deps = useRef(d);
  deps.current = d;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  const end = useCallback(() => {
    setTool(null);
    setPick(null);
    setStatus(null);
  }, []);

  /** The active view's work plane and the datum lines in it ((u, v) mm). */
  const plane = (): { plane: WorkPlane; datums: Array<{ name: string; a: P2; b: P2 }> } | null => {
    const { activeModelView: v, heights, datums, m } = deps.current;
    const model = m.model;
    if (!model) return null;
    const planLines = datums.map((x) => ({ name: x.name || 'Reference plane', a: x.a, b: x.b }));
    if (!v || v.kind === '3d') {
      // 3D: the plan plane at the selection's base
      const sel = m.selection.map((i) => model.elements[i]).filter(Boolean);
      const y = sel.length ? Math.min(...sel.map((e) => e.bounds[1])) : 0;
      return { plane: planWorkPlane(y), datums: planLines };
    }
    if (v.kind === 'plan') {
      const y = v.level !== undefined ? heights.get(v.level) : undefined;
      return y === undefined ? null : { plane: planWorkPlane(y), datums: planLines };
    }
    const look = viewDirection(v);
    const b = model.info.bounds;
    if (!look || !b) return null;
    const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2;
    const len = Math.hypot(look[0], look[2]) || 1;
    const u: [number, number, number] = [-look[2] / len, 0, look[0] / len];
    const lines: Array<{ name: string; a: P2; b: P2 }> = [...heights].map(([name, y]) => ({ name, a: [-BIG, y * 1000], b: [BIG, y * 1000] }));
    for (const x of datums) {
      if (x.kind !== 'grid') continue;
      const gx = (x.b[0] - x.a[0]) / 1000, gz = -(x.b[1] - x.a[1]) / 1000;
      const gl = Math.hypot(gx, gz) || 1;
      if (Math.abs((gx / gl) * (look[0] / len) + (gz / gl) * (look[2] / len)) < Math.cos((10 * Math.PI) / 180)) continue;
      const at = ((x.a[0] / 1000 - cx) * u[0] + (-x.a[1] / 1000 - cz) * u[2]) * 1000;
      lines.push({ name: x.name, a: [at, -BIG], b: [at, BIG] });
    }
    return { plane: { origin: [cx, 0, cz], u, v: [0, 1, 0] }, datums: lines };
  };

  // ---- Move / Copy
  const beginMovePick = (t: Extract<ModifyTool, { kind: 'move' }>) => {
    const wp = plane();
    if (!wp) {
      deps.current.setNotice('Move picks points in a plan, an elevation, a section or 3D: this view has no work plane.');
      return end();
    }
    setTool({ ...t, phase: 'pick' });
    setPick({
      prompts: [`${t.copy ? 'Copy' : 'Move'}: click the start point`, 'Click the end point, or type a distance and press Enter'],
      plane: wp.plane,
      datums: () => wp.datums,
      ortho: t.constrain,
      onStatus: setStatus,
      onPick: (a, b) => {
        const { u, v } = wp.plane;
        const du = b[0] - a[0], dv = b[1] - a[1];
        const w = [u[0] * du + v[0] * dv, u[1] * du + v[1] * dv, u[2] * du + v[2] * dv];
        const r = (n: number) => Math.round(n * 1000) / 1000;
        deps.current.nativePerform({ kind: t.copy ? 'copy' : 'move', dx: r(w[0]), dy: r(-w[2]), dz: r(w[1]) });
        end(); // Revit's Move ends after one move
      },
    });
  };
  const startMove = (copy: boolean) => {
    const { m, revitLinked, openGeom, setNotice } = deps.current;
    if (!m.model) return setNotice('Open a model first.');
    if (revitLinked) return openGeom('move'); // models linked to Revit: staged for Revit (Sync with Revit comes next)
    const t: Extract<ModifyTool, { kind: 'move' }> = { kind: 'move', copy, constrain: false, phase: 'select' };
    if (m.selection.length) return beginMovePick(t);
    setTool(t);
    setPick(null);
    setStatus({ prompt: `${copy ? 'Copy' : 'Move'}: select the elements, then press Enter`, snap: null, length: null, typed: '' });
  };
  // selecting after starting: Enter goes on to picking (Revit's Finish)
  useEffect(() => {
    if (tool?.kind !== 'move' || tool.phase !== 'select') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (deps.current.m.selection.length) beginMovePick(tool);
        else deps.current.setNotice('Select the elements to move first (Esc to cancel).');
      } else if (e.key === 'Escape') end();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps
  const setMoveOption = (o: { copy?: boolean; constrain?: boolean }) => {
    const t = toolRef.current;
    if (t?.kind !== 'move') return;
    const next = { ...t, ...o };
    if (t.phase === 'pick') beginMovePick(next);
    else setTool(next);
  };

  // ---- Align
  const beginAlignReference = (t: Extract<ModifyTool, { kind: 'align' }>) => {
    const wp = plane();
    if (!wp) return end();
    setTool({ ...t, phase: 'reference', ref: undefined });
    setPick({
      prompts: ['Align: click a grid or reference plane to align to', ''],
      plane: wp.plane,
      datums: () => wp.datums,
      onStatus: setStatus,
      onPick: () => undefined,
      single: {
        elements: false,
        onPickOne: (p, hit) => {
          if (hit.kind !== 'datum' && hit.kind !== 'intersection') return deps.current.setNotice('Click a grid or reference plane (its line) to align to.');
          // the datum nearest the click
          const near = deps.current.datums
            .map((x) => {
              const dx = x.b[0] - x.a[0], dy = x.b[1] - x.a[1];
              return { x, d: Math.abs((p[0] - x.a[0]) * dy - (p[1] - x.a[1]) * dx) / (Math.hypot(dx, dy) || 1) };
            })
            .sort((a, b) => a.d - b.d)[0];
          if (!near) return;
          beginAlignElement({ ...(toolRef.current as Extract<ModifyTool, { kind: 'align' }>), ref: { id: near.x.id, name: near.x.name || 'reference plane' } });
        },
      },
    });
  };
  const beginAlignElement = (t: Extract<ModifyTool, { kind: 'align' }>) => {
    const wp = plane();
    if (!wp || !t.ref) return end();
    setTool({ ...t, phase: 'element' });
    setPick({
      prompts: [`Align to ${t.ref.name}: click the element’s face or centreline`, ''],
      plane: wp.plane,
      datums: () => wp.datums,
      onStatus: setStatus,
      onPick: () => undefined,
      single: {
        elements: true,
        onPickOne: (_p, hit) => {
          const model = deps.current.m.model;
          if (hit.element === null || !model) return deps.current.setNotice('Click an element’s face (an edge in the plan) or its centreline.');
          const e = model.elements[hit.element];
          const to = ['axis', 'axisEnd', 'axisMid', 'centre'].includes(hit.kind) ? 'center' : 'face';
          const cur = toolRef.current as Extract<ModifyTool, { kind: 'align' }>;
          deps.current.alignTo(e.globalId, t.ref!.id, to, cur.lock);
          beginAlignReference(cur); // Revit: the next click picks a new reference
        },
      },
    });
  };
  const startAlign = () => {
    const { m, revitLinked, activeModelView, datums, setNotice } = deps.current;
    if (!m.model) return setNotice('Open a model first.');
    if (revitLinked) return setNotice('This model is linked to Revit: align in Revit for now (Sync with Revit comes next).');
    if (activeModelView?.kind !== 'plan') return setNotice('Align works in a plan view for now: open one (Project Browser → Structural Plans).');
    if (!datums.length) return setNotice('Align aligns to grids and reference planes: draw one first (GR, RP).');
    beginAlignReference({ kind: 'align', lock: false, phase: 'reference' });
  };
  const setAlignLock = (lock: boolean) => {
    const t = toolRef.current;
    if (t?.kind === 'align') setTool({ ...t, lock });
  };

  return { modifyTool: tool, modifyPick: pick, modifyStatus: status, startMove, startAlign, setMoveOption, setAlignLock, endModifyTool: end };
}

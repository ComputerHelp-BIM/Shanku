/**
 * Grids and reference planes as datums (docs/design/datums-and-constraints.md, part 3): drawn in a plan with the
 * shared point picker (snaps, angle locks, a listening dimension, typed lengths), one undo step each, kept on
 * this device and in the project file. Grids are named as Revit names them (1, 2, 3 or A, B, C, from the last).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { nextDatumName, planWorkPlane, type History, type P2, type PickOptions, type PickStatus } from '@cad2bim/engine';
import { loadDatums, saveDatums } from '../../lib/session';
import type { ModelView } from '../../lib/views';
import type { useShankuModel } from '../../lib/useShankuModel';

export interface Datum {
  id: string;
  kind: 'grid' | 'refplane';
  name: string;
  /** Plan mm (X east, Y north), as the parametric model. */
  a: P2;
  b: P2;
}

export interface DatumsDeps {
  m: ReturnType<typeof useShankuModel>;
  history: History;
  setNotice: (n: string | null) => void;
  activeModelView: ModelView | null;
  /** Level heights in the viewer (m). */
  heights: Map<string, number>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function useDatums({ m, history, setNotice, activeModelView, heights }: DatumsDeps) {
  const [datums, setDatums] = useState<Datum[]>([]);
  const ref = useRef<Datum[]>([]);
  ref.current = datums;
  const [tool, setTool] = useState<Datum['kind'] | null>(null);
  const [pick, setPick] = useState<PickOptions | null>(null);
  const [status, setStatus] = useState<PickStatus | null>(null);
  const loadedFor = useRef<string | null>(null);
  const fileName = m.model?.info.fileName ?? null;

  // a model opened: its datums come back
  useEffect(() => {
    loadedFor.current = null;
    setDatums([]);
    if (!fileName) return;
    void loadDatums<Datum[]>(fileName).then((d) => {
      setDatums(Array.isArray(d) ? d : []);
      loadedFor.current = fileName;
    });
  }, [fileName]);
  // kept as they change
  useEffect(() => {
    if (fileName && loadedFor.current === fileName) void saveDatums(fileName, datums);
  }, [datums, fileName]);

  const change = useCallback(
    (label: string, after: Datum[]) => {
      const before = ref.current;
      history.run(label, (t) => t.change('datums', before, after, (s: Datum[]) => setDatums(s)));
    },
    [history],
  );

  const endTool = useCallback(() => {
    setTool(null);
    setPick(null);
    setStatus(null);
  }, []);

  /** Grid (GR) or Reference Plane (RP): picking two points in a plan, one datum after another until Esc. */
  const startTool = (kind: Datum['kind']) => {
    if (!m.model) return setNotice('Open a model first.');
    if (activeModelView?.kind !== 'plan' || !activeModelView.level) return setNotice(`${kind === 'grid' ? 'Grids' : 'Reference planes'} are drawn in a plan view: open one (Project Browser → Structural Plans).`);
    const planeY = heights.get(activeModelView.level);
    if (planeY === undefined) return setNotice('This plan’s level has no height.');
    setTool(kind);
    setPick({
      prompts: kind === 'grid' ? ['Grid: click its start point', 'Click its end point, or type a length and press Enter'] : ['Reference plane: click its start point', 'Click its end point, or type a length and press Enter'],
      plane: planWorkPlane(planeY),
      datums: () => ref.current.map((d) => ({ name: d.name || 'Reference plane', a: d.a, b: d.b })),
      continuous: true,
      onStatus: setStatus,
      onPick: (a, b) => {
        const cur = ref.current;
        const grids = cur.filter((d) => d.kind === 'grid');
        const name = kind === 'grid' ? nextDatumName(grids[grids.length - 1]?.name, grids.map((g) => g.name)) : '';
        const d: Datum = { id: `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, kind, name, a: [r1(a[0]), r1(a[1])], b: [r1(b[0]), r1(b[1])] };
        change(kind === 'grid' ? `New grid ${name}` : 'New reference plane', [...cur, d]);
        m.log(kind === 'grid' ? `Grid ${name} drawn.` : 'Reference plane drawn.');
      },
    });
  };

  const rename = (id: string, name: string) => {
    const d = ref.current.find((x) => x.id === id);
    const n = name.trim();
    if (!d || n === d.name) return;
    if (d.kind === 'grid' && !n) return setNotice('A grid needs a name.');
    if (d.kind === 'grid' && ref.current.some((x) => x.kind === 'grid' && x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return setNotice(`There is already a grid named "${n}".`);
    change(`Rename ${d.name || 'reference plane'} → ${n}`, ref.current.map((x) => (x.id === id ? { ...x, name: n } : x)));
  };
  const remove = (id: string) => {
    const d = ref.current.find((x) => x.id === id);
    if (!d) return;
    change(d.kind === 'grid' ? `Delete grid ${d.name}` : 'Delete reference plane', ref.current.filter((x) => x.id !== id));
  };

  return { datums, datumTool: tool, datumPick: pick, pickStatus: status, startDatumTool: startTool, endDatumTool: endTool, renameDatum: rename, deleteDatum: remove };
}

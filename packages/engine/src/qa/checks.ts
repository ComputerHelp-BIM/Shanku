import type { Category, ElementRecord } from '../model/types';
import type { Finding, QaCheck, QaContext, QaGroup, QaReport, Severity } from './types';

/**
 * Named tolerances, in metres (viewer units). Each one is quoted in the "Measured" line of the
 * findings it produces, so a reader always knows how strict a check was. Adapted from the Structura
 * viewer's field-tested values (docs/design/structura-lessons.md).
 */
export const QA_TOLERANCE = {
  /** Two elements are duplicates when all six bounds agree within this. */
  duplicate: 0.005,
  /** Two columns overlap when their boxes overlap by more than this on every axis. */
  overlap: 0.001,
  /** A column is supported when something is within this below its bottom. */
  support: 0.05,
  /** Smallest dimension that is not a modelling slip. */
  tiny: 0.01,
  /** Beam, column and member length band. */
  lengthMin: 0.15,
  lengthMax: 25,
} as const;

const PLURAL: Record<Category, string> = {
  Column: 'columns',
  Beam: 'beams',
  Slab: 'slabs',
  Wall: 'walls',
  Footing: 'footings',
  Pile: 'piles',
  Rebar: 'rebar',
  Stair: 'stairs',
  Member: 'members',
  Plate: 'plates',
  Other: 'other elements',
};
const SINGULAR: Record<Category, string> = {
  Column: 'column',
  Beam: 'beam',
  Slab: 'slab',
  Wall: 'wall',
  Footing: 'footing',
  Pile: 'pile',
  Rebar: 'rebar',
  Stair: 'stair',
  Member: 'member',
  Plate: 'plate',
  Other: 'element',
};
const noun = (c: Category, n: number) => (n === 1 ? SINGULAR[c] : PLURAL[c]);
/** "has" or "have", "is" or "are" to agree with a count. */
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const count = (n: number) => n.toLocaleString('en-IN');
const mm = (m: number) => `${Math.round(m * 1000).toLocaleString('en-IN')} mm`;

/** "Column C12", "Beam B4", or the Element ID when there is no mark or name. */
export function elementLabel(e: ElementRecord): string {
  const what = e.category === 'Other' ? e.ifcClass.replace(/^Ifc/, '') : e.category;
  return `${what} ${e.mark || e.name || `#${e.expressId}`}`;
}
const onLevel = (e: ElementRecord) => (e.level ? ` on ${e.level}` : '');

/** A few examples for a grouped finding: "C1, C4, C9 and 12 more". */
function examples(els: readonly ElementRecord[], max = 3): string {
  const names = els.slice(0, max).map((e) => e.mark || e.name || `#${e.expressId}`);
  return els.length > max ? `${names.join(', ')} and ${count(els.length - max)} more` : names.join(', ');
}

/** FNV-1a over the sorted GlobalIds: the same elements give the same finding id in every run. */
export function findingId(checkId: string, els: readonly ElementRecord[]): string {
  let h = 0x811c9dc5;
  for (const id of els.map((e) => e.globalId || `#${e.expressId}`).sort()) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x2c;
  }
  return `${checkId}:${h.toString(16).padStart(8, '0')}`;
}

function finding(check: { id: string; group: QaGroup }, severity: Severity, els: readonly ElementRecord[], text: Pick<Finding, 'title' | 'detail' | 'measured' | 'limits'> & { clause?: string }): Finding {
  return { id: findingId(check.id, els), checkId: check.id, group: check.group, severity, elements: els.map((e) => e.index), ...text };
}

/** Groups elements by category, in a stable order. */
function byCategory(els: readonly ElementRecord[]): Array<[Category, ElementRecord[]]> {
  const m = new Map<Category, ElementRecord[]>();
  for (const e of els) {
    const list = m.get(e.category);
    if (list) list.push(e);
    else m.set(e.category, [e]);
  }
  return [...m];
}

/** Union-find over element indices, for turning pairs into clusters. */
function clusters(pairs: Array<[number, number]>): number[][] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  for (const [a, b] of pairs) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const out = new Map<number, number[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    const list = out.get(r);
    if (list) list.push(x);
    else out.set(r, [x]);
  }
  return [...out.values()].map((c) => c.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}

/** Plan (X, Z) spatial hash, so pairwise checks stay near-linear on 50,000 elements. */
class PlanGrid {
  private cells = new Map<string, number[]>();
  constructor(private size: number) {}
  private range(b: ElementRecord['bounds']): [number, number, number, number] {
    const s = this.size;
    return [Math.floor(b[0] / s), Math.floor(b[2] / s), Math.floor(b[3] / s), Math.floor(b[5] / s)];
  }
  add(i: number, b: ElementRecord['bounds']): void {
    const [x0, z0, x1, z1] = this.range(b);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const k = `${x},${z}`;
        const list = this.cells.get(k);
        if (list) list.push(i);
        else this.cells.set(k, [i]);
      }
  }
  near(b: ElementRecord['bounds']): Set<number> {
    const out = new Set<number>();
    const [x0, z0, x1, z1] = this.range(b);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const i of this.cells.get(`${x},${z}`) ?? []) out.add(i);
    return out;
  }
}

const planOverlap = (a: ElementRecord['bounds'], b: ElementRecord['bounds'], tol: number) =>
  Math.min(a[3], b[3]) - Math.max(a[0], b[0]) > tol && Math.min(a[5], b[5]) - Math.max(a[2], b[2]) > tol;

const STRUCTURAL: Category[] = ['Column', 'Beam', 'Slab', 'Wall', 'Footing', 'Pile', 'Stair', 'Member'];
const CONCRETE: Category[] = ['Column', 'Beam', 'Slab', 'Wall', 'Footing', 'Pile', 'Stair'];
const MARKED: Category[] = ['Column', 'Beam', 'Slab', 'Wall', 'Footing'];

/** Pairs of same-category elements whose bounds agree within the duplicate tolerance. */
export function duplicatePairs(els: readonly ElementRecord[], tol: number = QA_TOLERANCE.duplicate): Array<[number, number]> {
  const grid = new PlanGrid(0.5);
  const pairs: Array<[number, number]> = [];
  // The grid stores positions in `els` (which may be a filtered list); pairs report element indices.
  els.forEach((e, p) => {
    if (e.category === 'Other') return;
    for (const j of grid.near(e.bounds)) {
      const o = els[j];
      if (o.category !== e.category) continue;
      if (e.bounds.every((v, k) => Math.abs(v - o.bounds[k]) <= tol)) pairs.push([o.index, e.index]);
    }
    grid.add(p, e.bounds);
  });
  return pairs;
}

const duplicates: QaCheck = {
  id: 'duplicates',
  group: 'model',
  title: 'Duplicate elements',
  run({ elements }) {
    return clusters(duplicatePairs(elements)).map((c) => {
      const els = c.map((i) => elements[i]);
      const e = els[0];
      return finding(this, 'error', els, {
        title: 'Duplicate elements',
        detail: `${count(els.length)} ${noun(e.category, els.length)}${onLevel(e)} occupy the same place (${examples(els)}). Only one should stay; the BOQ counts each copy.`,
        measured: `Same category, all bounds equal within ${mm(QA_TOLERANCE.duplicate)}.`,
        limits: 'Does not compare properties: the copies may differ in mark or grade.',
      });
    });
  },
};

const overlappingColumns: QaCheck = {
  id: 'overlapping-columns',
  group: 'model',
  title: 'Overlapping columns',
  run({ elements }) {
    const cols = elements.filter((e) => e.category === 'Column');
    const dup = new Set(duplicatePairs(cols).map(([a, b]) => `${a},${b}`));
    const grid = new PlanGrid(2);
    const pairs: Array<[number, number]> = [];
    const t = QA_TOLERANCE.overlap;
    for (const c of cols) {
      for (const j of grid.near(c.bounds)) {
        const o = elements[j];
        if (dup.has(`${o.index},${c.index}`)) continue; // reported as duplicates
        const vertical = Math.min(c.bounds[4], o.bounds[4]) - Math.max(c.bounds[1], o.bounds[1]);
        if (vertical > t && planOverlap(c.bounds, o.bounds, t)) pairs.push([o.index, c.index]);
      }
      grid.add(c.index, c.bounds);
    }
    return clusters(pairs).map((cl) => {
      const els = cl.map((i) => elements[i]);
      return finding(this, 'error', els, {
        title: 'Overlapping columns',
        detail: `${els.map(elementLabel).join(' and ')}${onLevel(els[0])} overlap in plan. One is probably misplaced or a leftover.`,
        measured: `Column boxes overlapping by more than ${mm(t)} in plan and in height. Exact duplicates are reported separately.`,
        limits: 'Uses bounding boxes, so rotated or L-shaped columns can overlap in their boxes without touching.',
      });
    });
  },
};

const discontinuousColumns: QaCheck = {
  id: 'discontinuous-columns',
  group: 'model',
  title: 'Discontinuous columns',
  run({ elements }) {
    const t = QA_TOLERANCE.support;
    const structural = elements.filter((e) => e.category !== 'Other' && e.category !== 'Rebar');
    if (!structural.length) return [];
    const base = structural.reduce((m, e) => Math.min(m, e.bounds[1]), Infinity);
    const supports = elements.filter((e) => e.category === 'Column' || e.category === 'Wall' || e.category === 'Footing' || e.category === 'Beam' || e.category === 'Pile' || e.category === 'Slab');
    const grid = new PlanGrid(2);
    for (const s of supports) grid.add(s.index, s.bounds);
    /**
     * Is something structural under `bottom` within the column's footprint? A slab counts only as a
     * pass-through: many models stop columns under the slab and give the joint to the slab, so the
     * search continues from the slab's underside (a column standing on a slab alone still fails).
     */
    const supportedAt = (c: ElementRecord, bottom: number, depth: number): { ok: boolean; below: number; onSlab: boolean } => {
      let below = -Infinity;
      let onSlab = false;
      for (const j of grid.near(c.bounds)) {
        const s = elements[j];
        if (s.index === c.index || !planOverlap(c.bounds, s.bounds, 0)) continue;
        const touches = s.bounds[4] >= bottom - t && s.bounds[1] <= bottom + t;
        if (touches && s.category !== 'Slab') return { ok: true, below, onSlab };
        if (touches && depth < 3 && s.bounds[1] < bottom - t) {
          onSlab = true;
          const through = supportedAt(c, s.bounds[1], depth + 1);
          if (through.ok) return { ...through, onSlab };
          below = Math.max(below, through.below);
        }
        if (s.bounds[4] < bottom - t) below = Math.max(below, s.bounds[4]);
      }
      return { ok: false, below, onSlab };
    };
    const out: Finding[] = [];
    for (const c of elements) {
      if (c.category !== 'Column') continue;
      const bottom = c.bounds[1];
      if (bottom <= base + t) continue; // stands on the model base
      const { ok: supported, below: highestBelow, onSlab } = supportedAt(c, bottom, 0);
      if (supported) continue;
      const gap = onSlab
        ? 'stands on a slab with no column, wall or beam under it'
        : Number.isFinite(highestBelow)
          ? `starts ${mm(bottom - highestBelow)} above the nearest element below it`
          : 'has nothing below it';
      out.push(
        finding(this, 'error', [c], {
          title: 'Discontinuous column',
          detail: `${elementLabel(c)}${onLevel(c)} ${gap}. A floating column needs a transfer beam or a column below.`,
          clause: 'IS 1893 (Part 1): 2016, Table 6(d)',
          measured: `Column bottom against the top of columns, walls, beams, piles and footings below it in plan, ${mm(t)} tolerance, looking through slabs the column sits on. Columns at the model base are skipped.`,
          limits: 'Does not check that a supporting beam is strong enough, or load paths through slabs.',
        }),
      );
    }
    return out;
  },
};

const tinyElements: QaCheck = {
  id: 'tiny-elements',
  group: 'model',
  title: 'Zero or tiny size',
  run({ elements }) {
    const t = QA_TOLERANCE.tiny;
    const bad = elements.filter((e) => STRUCTURAL.includes(e.category) && (e.volume <= 0 || Object.values(e.dims).some((d) => d !== null && d < t)));
    return byCategory(bad).map(([c, els]) =>
      finding(this, 'error', els, {
        title: `${cap(noun(c, els.length))} with no size`,
        detail: `${count(els.length)} ${noun(c, els.length)} ${verb(els.length, 'has', 'have')} a dimension under ${mm(t)} or no volume (${examples(els)}). ${verb(els.length, 'It is usually a modelling slip and distorts', 'They are usually modelling slips and distort')} the BOQ.`,
        measured: `Any length, width, depth or height under ${mm(t)}, or a volume of zero. Rebar and plates are skipped.`,
        limits: 'Uses the dimensions Shanku reads from the IFC; an element with a wrong quantity set but correct geometry is reported too.',
      }),
    );
  },
};

const unusualLength: QaCheck = {
  id: 'unusual-length',
  group: 'model',
  title: 'Unusual length',
  run({ elements }) {
    const { lengthMin: lo, lengthMax: hi } = QA_TOLERANCE;
    const out: Finding[] = [];
    for (const [c, els] of byCategory(elements.filter((e) => (e.category === 'Beam' || e.category === 'Column' || e.category === 'Member') && e.length !== null && e.length > 0))) {
      const long = els.filter((e) => e.length! > hi).sort((a, b) => b.length! - a.length!);
      const short = els.filter((e) => e.length! < lo).sort((a, b) => a.length! - b.length!);
      if (long.length)
        out.push(
          finding(this, 'warning', long, {
            title: `Very long ${noun(c, long.length)}`,
            detail: `${count(long.length)} ${noun(c, long.length)} ${verb(long.length, 'is', 'are')} longer than ${hi} m, up to ${(long[0].length ?? 0).toFixed(2)} m (${examples(long)}). Check ${verb(long.length, 'it is', 'they are')} not several spans modelled as one.`,
            measured: `Length over ${hi} m.`,
            limits: 'Long members can be intended (transfer girders, tall columns).',
          }),
        );
      if (short.length)
        out.push(
          finding(this, 'warning', short, {
            title: `Very short ${noun(c, short.length)}`,
            detail: `${count(short.length)} ${noun(c, short.length)} ${verb(short.length, 'is', 'are')} shorter than ${mm(lo)}, down to ${mm(short[0].length ?? 0)} (${examples(short)}). ${verb(short.length, 'It is', 'They are')} often stubs left after edits.`,
            measured: `Length under ${mm(lo)}.`,
            limits: 'Short members can be intended (corbels, stubs at openings).',
          }),
        );
    }
    return out;
  },
};

const noLevel: QaCheck = {
  id: 'no-level',
  group: 'model',
  title: 'No level',
  run({ elements }) {
    return byCategory(elements.filter((e) => e.category !== 'Other' && !e.level)).map(([c, els]) =>
      finding(this, 'warning', els, {
        title: `${cap(noun(c, els.length))} without a level`,
        detail: `${count(els.length)} ${noun(c, els.length)} ${verb(els.length, 'is', 'are')} not on any level (${examples(els)}). Plans, the Project Browser and the BOQ by level leave them out.`,
        measured: 'Each element’s level by Shanku’s definition (the lowest level at or above its top), else the IFC storey it is filed under.',
        limits: 'An element without geometry or levels to judge by keeps the storey its file gives it.',
      }),
    );
  },
};

/** CH-LEVEL is a label: after copying floors in Revit it can go stale. Shanku's level follows the top. */
const levelLabel: QaCheck = {
  id: 'level-label',
  group: 'model',
  title: 'CH-LEVEL differs from the level',
  run({ elements }) {
    const groups = new Map<string, ElementRecord[]>();
    for (const e of elements) {
      if (!e.chLevel || !e.level || e.chLevel === e.level) continue;
      const k = `${e.chLevel}\u0001${e.level}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    return [...groups.entries()].map(([k, els]) => {
      const [label, level] = k.split('\u0001');
      return finding(this, 'warning', els, {
        title: `CH-LEVEL says ${label}, the top is at ${level}`,
        detail: `${count(els.length)} element${els.length === 1 ? '' : 's'} (${examples(els)}) carry CH-LEVEL “${label}” but finish at ${level}. Shanku puts ${els.length === 1 ? 'it' : 'them'} on ${level}; update CH-LEVEL in Revit if the label is stale (for example after copying a floor).`,
        measured: 'CH-LEVEL against the level by Shanku’s definition: the lowest level at or above the element’s top (beams, slabs and footings may rise 600 mm above it).',
        limits: 'Only elements that have a CH-LEVEL parameter.',
      });
    });
  },
};

const noGrade: QaCheck = {
  id: 'no-grade',
  group: 'model',
  title: 'No grade',
  run({ elements }) {
    return byCategory(elements.filter((e) => CONCRETE.includes(e.category) && !e.grade)).map(([c, els]) =>
      finding(this, 'warning', els, {
        title: `${cap(noun(c, els.length))} without a grade`,
        detail: `${count(els.length)} ${noun(c, els.length)} ${verb(els.length, 'has', 'have')} no concrete grade (${examples(els)}). The BOQ cannot price them by grade. Add a grade rule in Manage → Grade rules.`,
        measured: 'The grade found by the grade rules (property sets or IfcMaterial).',
        limits: 'Does not check that the grade is right for the element.',
      }),
    );
  },
};

const lateralGap: QaCheck = {
  id: 'lateral-gap',
  group: 'model',
  title: 'Lateral system gap',
  run({ elements }) {
    const lateral = elements.filter((e) => e.category === 'Wall' || (e.category === 'Member' && /brac/i.test(`${e.ifcClass} ${e.typeName} ${e.name}`)));
    if (!lateral.length) return [];
    const storeys = new Map<string, { bottom: number; cols: ElementRecord[] }>();
    for (const e of elements) {
      if (e.category !== 'Column' || !e.level) continue;
      const s = storeys.get(e.level) ?? { bottom: Infinity, cols: [] };
      s.bottom = Math.min(s.bottom, e.bounds[1]);
      s.cols.push(e);
      storeys.set(e.level, s);
    }
    const ordered = [...storeys].sort((a, b) => a[1].bottom - b[1].bottom).slice(1); // the lowest storey is the base
    const withLateral = new Set(lateral.map((e) => e.level));
    const gaps = ordered.filter(([name]) => !withLateral.has(name));
    if (!gaps.length) return [];
    const els = gaps.flatMap(([, s]) => s.cols);
    return [
      finding(this, 'info', els, {
        title: 'Storeys without walls or bracing',
        detail: `The model has ${count(lateral.length)} walls or braces, but ${gaps.map(([n]) => n).join(', ')} ${gaps.length === 1 ? 'has' : 'have'} none. Check the lateral system is continuous; the columns on ${gaps.length === 1 ? 'that storey' : 'those storeys'} are selected.`,
        measured: 'Walls and members named as braces, per level with columns, above the lowest storey.',
        limits: 'Does not know which walls are structural or check stiffness; a moment frame can be intended.',
      }),
    ];
  },
};

const sectionOf = (e: ElementRecord): string | null => {
  const w = e.dims.width, d = e.dims.depth;
  if (w === null || d === null) return null;
  const a = Math.round(w * 1000), b = Math.round(d * 1000);
  return e.category === 'Column' ? [a, b].sort((x, y) => x - y).join(' × ') : `${a} × ${b}`;
};

const missingMark: QaCheck = {
  id: 'missing-mark',
  group: 'marks',
  title: 'Missing mark',
  run({ elements }) {
    const candidates = elements.filter((e) => MARKED.includes(e.category));
    if (!candidates.length) return [];
    if (!candidates.some((e) => e.mark))
      return [
        finding(this, 'info', [], {
          title: 'No marks found',
          detail: 'None of the columns, beams, slabs, walls or footings has a mark. If the file stores marks in a property, add it in Manage → Mark rules.',
          measured: 'Marks found by the mark rules.',
          limits: 'Some models do not use marks at all.',
        }),
      ];
    return byCategory(candidates.filter((e) => !e.mark)).map(([c, els]) =>
      finding(this, 'warning', els, {
        title: `${cap(noun(c, els.length))} without a mark`,
        detail: `${count(els.length)} ${noun(c, els.length)} ${verb(els.length, 'has', 'have')} no mark (${examples(els)}), while others do. Drawings and schedules will miss them.`,
        measured: 'Marks found by the mark rules.',
        limits: 'Does not check that marks follow your office numbering.',
      }),
    );
  },
};

const markConflicts: QaCheck = {
  id: 'mark-conflict',
  group: 'marks',
  title: 'Mark used for different sizes',
  run({ elements }) {
    const out: Finding[] = [];
    const groups = new Map<string, ElementRecord[]>();
    for (const e of elements) {
      if ((e.category !== 'Column' && e.category !== 'Beam') || !e.mark) continue;
      const k = `${e.category}|${e.mark}`;
      const list = groups.get(k);
      if (list) list.push(e);
      else groups.set(k, [e]);
    }
    const describe = (els: ElementRecord[]) => {
      const n = new Map<string, number>();
      for (const e of els) {
        const k = `${sectionOf(e) ?? 'unknown size'}${e.grade ? ` ${e.grade}` : ''}`;
        n.set(k, (n.get(k) ?? 0) + 1);
      }
      return [...n].sort((a, b) => b[1] - a[1]);
    };
    for (const els of groups.values()) {
      const c = els[0].category;
      const byLevel = new Map<string, ElementRecord[]>();
      for (const e of els) byLevel.set(e.level, [...(byLevel.get(e.level) ?? []), e]);
      let conflictOnALevel = false;
      for (const [level, list] of byLevel) {
        const kinds = describe(list);
        if (kinds.length < 2) continue;
        conflictOnALevel = true;
        out.push(
          finding(this, 'warning', list, {
            title: 'Same mark, different sizes',
            detail: `${cap(SINGULAR[c])} mark ${list[0].mark}${level ? ` on ${level}` : ''} is used for ${kinds.length} sizes: ${kinds.map(([k, n]) => `${k} (${n})`).join(', ')}. One mark should mean one size and grade.`,
            measured: 'Cross-section (width × depth, to the millimetre) and grade of elements that share a mark on the same level.',
            limits: 'Does not check reinforcement, which can also differ under one mark.',
          }),
        );
      }
      if (conflictOnALevel) continue;
      const kinds = describe(els);
      if (kinds.length > 1 && byLevel.size > 1)
        out.push(
          finding({ id: 'mark-by-storey', group: 'marks' }, 'info', els, {
            title: 'Mark changes size between storeys',
            detail: `${cap(SINGULAR[c])} mark ${els[0].mark} has ${kinds.length} sizes across ${byLevel.size} levels: ${kinds.map(([k, n]) => `${k} (${n})`).join(', ')}. Fine if the schedule is by storey.`,
            measured: 'Cross-section and grade of every element with this mark.',
            limits: 'Columns often reduce up the building under one mark by design.',
          }),
        );
    }
    return out;
  },
};

/** The first set of checks (actionable-QA phase 1): model health and marks. */
export const DEFAULT_CHECKS: readonly QaCheck[] = [duplicates, overlappingColumns, discontinuousColumns, tinyElements, unusualLength, noLevel, levelLabel, noGrade, lateralGap, missingMark, markConflicts];

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Runs checks and returns findings, most severe first (check order within a severity). */
export function runChecks(ctx: QaContext, checks: readonly QaCheck[] = DEFAULT_CHECKS): QaReport {
  const t0 = performance.now();
  const report: QaReport = { findings: [], checks: [], ms: 0 };
  checks.forEach((check) => {
    const found = check.run(ctx);
    report.checks.push({ id: check.id, title: check.title, group: check.group, findings: found.length });
    report.findings.push(...found);
  });
  const order = new Map(checks.map((c, i) => [c.id, i]));
  report.findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (order.get(a.checkId) ?? 99) - (order.get(b.checkId) ?? 99));
  report.ms = performance.now() - t0;
  return report;
}

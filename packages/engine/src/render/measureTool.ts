import { Vector3 } from 'three';
import type { ElementRecord } from '../model/types';
import { elementLabel } from '../qa/checks';
import {
  axisDistance,
  clearDistance,
  connectedChain,
  faceOrientation,
  fmtMm,
  measureBetween,
  raycastAll,
  snapCandidates,
  toRevitAxes,
  type MeasurePick,
  type MeasureScene,
  type MemberAxis,
  type PlanarFace,
  type RayHit,
  type SnapCandidate,
} from './measure';

/**
 * The Measure tool (Revit's Measure Between Two References and Measure Along an Element, plus
 * Shanku's clear distance, face area and chain): hover shows what a click would take, Tab steps
 * through the other choices under the cursor, Shift+Tab steps back. Results stay on the view until
 * cleared or the tool closes.
 *
 * - distance: two points with snaps; perpendicular distance too when the references are parallel
 *   faces, parallel edges or centrelines (centre to centre).
 * - clear: two elements; the clear gap between them and, for members, centre to centre.
 * - along: one element's centreline, an edge, or a chain of joined elements (Tab).
 * - face: one flat face: area, perimeter and which way it faces.
 * - chain: points one after another with a running total; Enter or double-click finishes.
 */
export type MeasureMode = 'distance' | 'clear' | 'along' | 'face' | 'chain';

export const MEASURE_MODES: ReadonlyArray<{ id: MeasureMode; label: string; tip: string }> = [
  { id: 'distance', label: 'Distance', tip: 'Between two points: snaps to endpoints, midpoints, face centres and centrelines (Tab cycles)' },
  { id: 'clear', label: 'Clear & C/C', tip: 'Between two elements: the clear gap and, for columns, beams and walls, centre to centre' },
  { id: 'along', label: 'Along', tip: 'Along an element: its centreline, an edge, or a chain of joined elements (Tab cycles)' },
  { id: 'face', label: 'Face area', tip: 'One flat face: area, perimeter and which way it faces' },
  { id: 'chain', label: 'Chain', tip: 'Point after point with a running total; Enter or double-click finishes, Backspace removes the last point' },
];

export interface MeasureResultView {
  id: number;
  mode: MeasureMode;
  /** "Distance", "Clear, Column C1 → Column C2" … */
  title: string;
  /** Headline value, e.g. "4,500 mm". */
  value: string;
  /** Detail rows (label, value). */
  rows: Array<[string, string]>;
  /** Plain text for the clipboard. */
  copy: string;
}

export interface MeasureReadout {
  mode: MeasureMode;
  /** What to do next. */
  prompt: string;
  /** What a click takes now, and its place in the Tab cycle. */
  hover: { label: string; position: number; total: number } | null;
  /** Rubber band length while placing a point. */
  live: string | null;
  /** Newest first. */
  results: MeasureResultView[];
}

export interface MeasureContext {
  scene: () => MeasureScene | null;
  /** Orthographic pick ray for a client point (unit direction). */
  ray: (clientX: number, clientY: number) => { origin: Vector3; dir: Vector3 } | null;
  /** World → container pixels (null when behind the camera). */
  project: (p: Vector3) => [number, number] | null;
  /** Client → container pixels. */
  toLocal: (clientX: number, clientY: number) => [number, number];
  /** Metres per pixel at the current zoom. */
  pixel: () => number;
  /** View direction in 2D views (plans, elevations, sections), else null. */
  viewDir: () => Vector3 | null;
  axisOf: (i: number) => MemberAxis | null;
  faceOf: (i: number, tri: number) => PlanarFace;
  /** Highlights elements (hover glow) while choosing. */
  highlight: (elements: readonly number[]) => void;
  emit: (r: MeasureReadout | null) => void;
  render: () => void;
}

type Line = { a: Vector3; b: Vector3; style: 'main' | 'aux' | 'guide' };
type Label = { at: Vector3; text: string; strong?: boolean };
interface Drawing {
  lines: Line[];
  labels: Label[];
  points: Vector3[];
}

interface Option {
  label: string;
  pick?: SnapCandidate;
  element?: number;
  face?: PlanarFace;
  along?: { length: number; segments: Array<[Vector3, Vector3]>; title: string; count: number; exact: boolean };
  /** Elements to glow while this option is current. */
  glow: number[];
}

interface Result {
  view: MeasureResultView;
  drawing: Drawing;
}

const mm = (m: number) => `${fmtMm(m)} mm`;
const signed = (m: number) => `${m > 0.0005 ? '+' : m < -0.0005 ? '−' : ''}${fmtMm(Math.abs(m))} mm`;
const m2 = (a: number) => `${a.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;

export class MeasureTool {
  mode: MeasureMode;
  private options: Option[] = [];
  private cycle = 0;
  private anchor: [number, number] | null = null;
  private picks: MeasurePick[] = [];
  private firstElement: number | null = null;
  private results: Result[] = [];
  private nextId = 1;
  private cursor: Vector3 | null = null;

  constructor(private ctx: MeasureContext, mode: MeasureMode = 'distance') {
    this.mode = mode;
    this.publish();
  }

  setMode(mode: MeasureMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.cancelPending();
    this.options = [];
    this.publish();
  }

  /** Drops the half-made measurement; true if there was one. */
  cancelPending(): boolean {
    const had = this.picks.length > 0 || this.firstElement !== null;
    this.picks = [];
    this.firstElement = null;
    this.cursor = null;
    this.publish();
    return had;
  }

  clearResults(): void {
    this.results = [];
    this.publish();
  }

  get hasResults(): boolean {
    return this.results.length > 0;
  }

  dispose(): void {
    this.ctx.highlight([]);
    this.ctx.emit(null);
  }

  // ------------------------------------------------------------- hover

  /** The pointer moved: work out the choices under it (keeps the Tab position while the pointer stays put). */
  hover(clientX: number, clientY: number): void {
    const local = this.ctx.toLocal(clientX, clientY);
    if (this.anchor && Math.hypot(local[0] - this.anchor[0], local[1] - this.anchor[1]) <= 3 && this.options.length) return;
    this.anchor = local;
    this.cycle = 0;
    this.options = this.optionsAt(clientX, clientY, local);
    this.applyOption();
  }

  /** Tab / Shift+Tab. */
  step(dir: 1 | -1): boolean {
    if (this.options.length < 2) return this.options.length === 1;
    this.cycle = (this.cycle + dir + this.options.length) % this.options.length;
    this.applyOption();
    return true;
  }

  leave(): void {
    this.options = [];
    this.anchor = null;
    this.cursor = null;
    this.ctx.highlight([]);
    this.publish();
  }

  private get current(): Option | null {
    return this.options[this.cycle] ?? null;
  }

  private applyOption(): void {
    const o = this.current;
    this.cursor = o?.pick?.point ?? null;
    this.ctx.highlight(o?.glow ?? []);
    this.publish();
  }

  private optionsAt(clientX: number, clientY: number, local: [number, number]): Option[] {
    const s = this.ctx.scene();
    const ray = this.ctx.ray(clientX, clientY);
    if (!s || !ray) return [];
    const els = s.elements;
    if (this.mode === 'distance' || this.mode === 'chain') {
      const { candidates } = snapCandidates(s, {
        origin: ray.origin, dir: ray.dir, cursor: local, radius: 12, pixel: this.ctx.pixel(),
        project: (p) => this.ctx.project(p) ?? [1e9, 1e9], axisOf: this.ctx.axisOf, faceOf: this.ctx.faceOf,
      });
      return candidates.map((c) => ({ label: `${c.label}${c.index !== null && els[c.index] ? ` · ${elementLabel(els[c.index])}` : ''}`, pick: c, glow: c.index !== null ? [c.index] : [] }));
    }
    const hits = raycastAll(s, ray.origin, ray.dir);
    if (this.mode === 'clear') return hits.map((h) => ({ label: elementLabel(els[h.index]), element: h.index, glow: [h.index] }));
    if (this.mode === 'face') {
      return hits.map((h) => {
        const face = this.ctx.faceOf(h.index, h.tri);
        return { label: `${faceOrientation(face.normal)} · ${elementLabel(els[h.index])}`, face, glow: [h.index] };
      });
    }
    return this.alongOptions(s, hits, ray, local);
  }

  /** Along: the front element's centreline, the edge under the cursor, then the chain of joined elements. */
  private alongOptions(s: MeasureScene, hits: RayHit[], ray: { origin: Vector3; dir: Vector3 }, local: [number, number]): Option[] {
    const out: Option[] = [];
    const front = hits[0];
    const { candidates } = snapCandidates(s, {
      origin: ray.origin, dir: ray.dir, cursor: local, radius: 10, pixel: this.ctx.pixel(),
      project: (p) => this.ctx.project(p) ?? [1e9, 1e9], axisOf: () => null, faceOf: this.ctx.faceOf,
    });
    const edge = candidates.find((c) => c.ref.kind === 'edge');
    const el = front ? s.elements[front.index] : null;
    const ax = front ? this.ctx.axisOf(front.index) : null;
    if (front && ax && el) {
      out.push({ label: `Centreline · ${elementLabel(el)}`, along: { length: ax.length, segments: [[ax.a, ax.b]], title: `Along ${elementLabel(el)} (centreline)`, count: 1, exact: ax.exact }, glow: [front.index] });
    }
    if (edge && edge.ref.kind === 'edge' && edge.index !== null) {
      const { a, b } = edge.ref;
      const who = elementLabel(s.elements[edge.index]);
      out.push({ label: `Edge · ${who}`, along: { length: a.distanceTo(b), segments: [[a, b]], title: `Along an edge of ${who}`, count: 1, exact: true }, glow: [edge.index] });
    }
    if (front && ax && el) {
      const chain = connectedChain(s, front.index, this.ctx.axisOf);
      if (chain.length > 1) {
        const axes = chain.map((i) => this.ctx.axisOf(i)).filter((x): x is MemberAxis => !!x);
        const length = axes.reduce((t, x) => t + x.length, 0);
        out.push({
          label: `Chain of ${chain.length} joined ${el.category === 'Wall' ? 'walls' : `${el.category.toLowerCase()}s`}`,
          along: { length, segments: axes.map((x) => [x.a, x.b] as [Vector3, Vector3]), title: `Along ${chain.length} joined ${el.category.toLowerCase()}s (centrelines)`, count: chain.length, exact: axes.every((x) => x.exact) },
          glow: chain,
        });
      }
    }
    if (!out.length && front && el) {
      // No centreline (a slab, a footing): the longest edge of the face under the cursor.
      const face = this.ctx.faceOf(front.index, front.tri);
      const longest = [...face.outline].sort((p, q) => q[0].distanceTo(q[1]) - p[0].distanceTo(p[1]))[0];
      if (longest) out.push({ label: `Longest edge · ${elementLabel(el)}`, along: { length: longest[0].distanceTo(longest[1]), segments: [longest], title: `Along ${elementLabel(el)} (longest edge)`, count: 1, exact: true }, glow: [front.index] });
    }
    return out;
  }

  // ------------------------------------------------------------- clicks and keys

  click(clientX: number, clientY: number, double: boolean): void {
    if (!this.options.length || this.anchor === null) this.hover(clientX, clientY);
    const o = this.current;
    const s = this.ctx.scene();
    if (!s) return;
    if (this.mode === 'chain' && double) {
      this.finishChain();
      return;
    }
    if (!o) return;
    switch (this.mode) {
      case 'distance': {
        if (!o.pick) return;
        if (!this.picks.length) this.picks = [o.pick];
        else {
          this.add(this.distanceResult(this.picks[0], o.pick, s.elements));
          this.picks = [];
        }
        break;
      }
      case 'chain': {
        if (!o.pick) return;
        const last = this.picks[this.picks.length - 1];
        if (last && last.point.distanceTo(o.pick.point) < 1e-6) {
          this.finishChain(); // clicking the last point again finishes, like a double-click
          return;
        }
        this.picks.push(o.pick);
        break;
      }
      case 'clear': {
        if (o.element === undefined) return;
        if (this.firstElement === null) this.firstElement = o.element;
        else if (o.element !== this.firstElement) {
          this.add(this.clearResult(s, this.firstElement, o.element));
          this.firstElement = null;
        }
        break;
      }
      case 'face':
        if (o.face) this.add(this.faceResult(o.face, s.elements));
        break;
      case 'along':
        if (o.along) this.add(this.alongResult(o.along));
        break;
    }
    this.publish();
  }

  /** Esc, Enter, Backspace. Returns true when the key was used. Esc with nothing pending is left to the caller (close the tool). */
  key(key: string): boolean {
    if (key === 'Escape') return this.cancelPending();
    if (key === 'Enter' && this.mode === 'chain' && this.picks.length) {
      this.finishChain();
      return true;
    }
    if (key === 'Backspace' && this.mode === 'chain' && this.picks.length) {
      this.picks.pop();
      this.publish();
      return true;
    }
    return false;
  }

  private finishChain(): void {
    if (this.picks.length >= 2) this.add(this.chainResult(this.picks));
    this.picks = [];
    this.publish();
  }

  private add(r: Result): void {
    this.results.unshift(r);
    if (this.results.length > 20) this.results.length = 20;
    this.ctx.render();
  }

  // ------------------------------------------------------------- results

  private distanceResult(p: MeasurePick, q: MeasurePick, els: readonly ElementRecord[]): Result {
    const r = measureBetween(p, q, this.ctx.viewDir());
    const id = this.nextId++;
    const [dx, dy, dz] = r.delta;
    const rows: Array<[string, string]> = [['ΔX (east)', signed(dx)], ['ΔY (north)', signed(dy)], ['ΔZ (up)', signed(dz)]];
    if (r.planar && Math.abs(r.length3d - r.total) > 5e-4) rows.push(['True 3D length', mm(r.length3d)]);
    if (r.perpendicular) rows.push([r.perpendicular.label, mm(r.perpendicular.value)]);
    const name = (m: MeasurePick) => `${m.kind === 'face' ? 'a face' : m.kind === 'edge' ? 'an edge' : m.kind === 'axis' ? 'a centreline' : m.kind === 'axisEnd' ? 'a centreline end' : m.kind === 'centre' ? 'a face centre' : `a${m.kind === 'endpoint' ? 'n' : ''} ${m.kind}`}${m.index !== null && els[m.index] ? ` of ${elementLabel(els[m.index])}` : ''}`;
    const title = r.planar ? 'Distance in the view plane' : 'Distance';
    const drawing: Drawing = { lines: [{ a: r.a, b: r.b, style: 'main' }], labels: [{ at: r.a.clone().lerp(r.b, 0.5), text: fmtMm(r.total), strong: true }], points: [r.a, r.b] };
    if (r.perpendicular && r.perpendicular.value >= 5e-4) {
      drawing.lines.push({ a: r.perpendicular.a, b: r.perpendicular.b, style: 'aux' });
      drawing.labels.push({ at: r.perpendicular.a.clone().lerp(r.perpendicular.b, 0.5), text: `⊥ ${fmtMm(r.perpendicular.value)}` });
    }
    const copy = [`${title}: ${mm(r.total)}`, ...rows.map(([k, v]) => `${k}: ${v}`), `From ${name(p)} to ${name(q)}`].join('\n');
    return { view: { id, mode: 'distance', title, value: mm(r.total), rows: [...rows, ['From', name(p)], ['To', name(q)]], copy }, drawing };
  }

  private clearResult(s: MeasureScene, i: number, j: number): Result {
    const els = s.elements;
    const c = clearDistance(s, i, j);
    const ai = this.ctx.axisOf(i), aj = this.ctx.axisOf(j);
    const cc = ai && aj ? axisDistance(ai, aj) : null;
    const id = this.nextId++;
    const title = `${elementLabel(els[i])} → ${elementLabel(els[j])}`;
    const [dx, dy, dz] = toRevitAxes(new Vector3().subVectors(c.b, c.a));
    const rows: Array<[string, string]> = [];
    if (c.overlapping) rows.push(['Clear', 'Touching or overlapping (0 mm)']);
    else {
      rows.push(['Clear distance', mm(c.distance)]);
      if (Math.abs(dz) > 5e-4 && (Math.abs(dx) > 5e-4 || Math.abs(dy) > 5e-4)) rows.push(['Clear, horizontal', mm(Math.hypot(dx, dy))], ['Clear, vertical', mm(Math.abs(dz))]);
    }
    if (cc) rows.push([cc.parallel ? 'Centre to centre' : 'Closest between centrelines', mm(cc.distance)]);
    const drawing: Drawing = { lines: [], labels: [], points: [] };
    if (!c.overlapping) {
      drawing.lines.push({ a: c.a, b: c.b, style: 'main' });
      drawing.labels.push({ at: c.a.clone().lerp(c.b, 0.5), text: `Clear ${fmtMm(c.distance)}`, strong: true });
      drawing.points.push(c.a, c.b);
    }
    if (cc) {
      drawing.lines.push({ a: cc.a, b: cc.b, style: 'aux' });
      drawing.labels.push({ at: cc.a.clone().lerp(cc.b, 0.5), text: `C/C ${fmtMm(cc.distance)}` });
      if (ai) drawing.lines.push({ a: ai.a, b: ai.b, style: 'guide' });
      if (aj) drawing.lines.push({ a: aj.a, b: aj.b, style: 'guide' });
    }
    const value = c.overlapping ? '0 mm' : mm(c.distance);
    return { view: { id, mode: 'clear', title: `Clear, ${title}`, value, rows, copy: [`Clear, ${title}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n') }, drawing };
  }

  private faceResult(f: PlanarFace, els: readonly ElementRecord[]): Result {
    const id = this.nextId++;
    const who = elementLabel(els[f.index]);
    const orient = faceOrientation(f.normal);
    const rows: Array<[string, string]> = [['Area', m2(f.area)], ['Perimeter', mm(f.perimeter)], ['Face', orient]];
    const drawing: Drawing = { lines: f.outline.map(([a, b]) => ({ a, b, style: 'main' as const })), labels: [{ at: f.centroid, text: m2(f.area), strong: true }], points: [] };
    return { view: { id, mode: 'face', title: `${orient}, ${who}`, value: m2(f.area), rows, copy: [`${orient}, ${who}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n') }, drawing };
  }

  private alongResult(a: NonNullable<Option['along']>): Result {
    const id = this.nextId++;
    const rows: Array<[string, string]> = [['Length', mm(a.length)]];
    if (a.count > 1) rows.push(['Elements', String(a.count)]);
    if (!a.exact) rows.push(['Note', 'Centreline fitted to a sloped or shaped member: close, not exact']);
    const drawing: Drawing = { lines: a.segments.map(([p, q]) => ({ a: p, b: q, style: 'main' as const })), labels: [], points: a.segments.flat() };
    const mid = a.segments[Math.floor(a.segments.length / 2)];
    drawing.labels.push({ at: mid[0].clone().lerp(mid[1], 0.5), text: `L ${fmtMm(a.length)}`, strong: true });
    return { view: { id, mode: 'along', title: a.title, value: mm(a.length), rows, copy: [a.title, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n') }, drawing };
  }

  private chainResult(picks: MeasurePick[]): Result {
    const id = this.nextId++;
    const vd = this.ctx.viewDir();
    const drawing: Drawing = { lines: [], labels: [], points: picks.map((p) => p.point) };
    let total = 0;
    const legs: number[] = [];
    for (let k = 1; k < picks.length; k++) {
      const r = measureBetween(picks[k - 1], picks[k], vd);
      total += r.total;
      legs.push(r.total);
      drawing.lines.push({ a: r.a, b: r.b, style: 'main' });
      drawing.labels.push({ at: r.a.clone().lerp(r.b, 0.5), text: fmtMm(r.total) });
    }
    drawing.labels.push({ at: picks[picks.length - 1].point, text: `Σ ${fmtMm(total)}`, strong: true });
    const rows: Array<[string, string]> = legs.map((l, k) => [`Segment ${k + 1}`, mm(l)]);
    const title = `Chain of ${legs.length} segment${legs.length === 1 ? '' : 's'}${vd ? ' in the view plane' : ''}`;
    return { view: { id, mode: 'chain', title, value: mm(total), rows, copy: [`${title}: ${mm(total)}`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n') }, drawing };
  }

  // ------------------------------------------------------------- readout

  private prompt(): string {
    const s = this.picks.length, e = this.firstElement !== null;
    switch (this.mode) {
      case 'distance': return s ? 'Pick the second point (Tab: other snaps · Esc: start again)' : 'Pick the first point (Tab: other snaps)';
      case 'chain': return s ? `Pick the next point · Enter or double-click to finish · Backspace removes the last (${s} point${s === 1 ? '' : 's'})` : 'Pick the first point of the chain';
      case 'clear': return e ? 'Pick the second element (Tab: the one behind)' : 'Pick the first element (Tab: the one behind)';
      case 'face': return 'Pick a face (Tab: the face behind)';
      case 'along': return 'Pick an element (Tab: centreline, edge or joined chain)';
    }
  }

  private publish(): void {
    const o = this.current;
    let live: string | null = null;
    const last = this.picks[this.picks.length - 1];
    if (last && o?.pick) {
      const r = measureBetween(last, o.pick, this.ctx.viewDir());
      live = mm(r.total);
      if (this.mode === 'chain' && this.picks.length > 1) {
        let t = 0;
        for (let k = 1; k < this.picks.length; k++) t += measureBetween(this.picks[k - 1], this.picks[k], this.ctx.viewDir()).total;
        live = `${mm(r.total)} · total ${mm(t + r.total)}`;
      }
    }
    this.ctx.emit({
      mode: this.mode,
      prompt: this.prompt(),
      hover: o ? { label: o.label, position: this.cycle + 1, total: this.options.length } : null,
      live,
      results: this.results.map((r) => r.view),
    });
    this.ctx.render();
  }

  // ------------------------------------------------------------- drawing

  draw(svg: SVGSVGElement, style: { line: string; text: string; plate: string; font: string; guide: string }): void {
    while (svg.firstChild) svg.firstChild.remove();
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.appendChild(n);
      return n;
    };
    const P = (p: Vector3) => this.ctx.project(p);
    const line = (a: Vector3, b: Vector3, kind: Line['style'], width = 1.6) => {
      const A = P(a), B = P(b);
      if (!A || !B) return;
      const dash = kind === 'aux' ? '6 4' : kind === 'guide' ? '10 3 2 3' : '';
      el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], stroke: kind === 'guide' ? style.guide : style.line, 'stroke-width': kind === 'main' ? width : 1.2, 'stroke-dasharray': dash, 'stroke-linecap': 'round' });
    };
    const dot = (p: Vector3) => {
      const s = P(p);
      if (s) el('circle', { cx: s[0], cy: s[1], r: 3, fill: style.line });
    };
    const label = (at: Vector3, text: string, strong = false, dy = -12) => {
      const s = P(at);
      if (!s) return;
      const w = text.length * (strong ? 7.4 : 6.6) + 12;
      el('rect', { x: s[0] - w / 2, y: s[1] + dy - 9, width: w, height: 18, rx: 4, fill: style.plate, 'fill-opacity': 0.94, stroke: style.line, 'stroke-width': strong ? 1 : 0.6 });
      const t = el('text', { x: s[0], y: s[1] + dy, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: style.text, 'font-size': 12, 'font-weight': strong ? 700 : 500, 'font-family': style.font });
      t.textContent = text;
    };
    const drawDrawing = (d: Drawing) => {
      for (const l of d.lines) line(l.a, l.b, l.style);
      for (const p of d.points) dot(p);
      for (const l of d.labels) label(l.at, l.text, l.strong);
    };
    for (const r of [...this.results].reverse()) drawDrawing(r.drawing);

    const o = this.current;
    // Current choice: the face outline, the path along, or the snap glyph.
    if (o?.face) for (const [a, b] of o.face.outline) line(a, b, 'aux', 2);
    if (o?.along) for (const [a, b] of o.along.segments) line(a, b, 'aux', 2);
    // Half-made measurement: picked points and the rubber band.
    for (let k = 1; k < this.picks.length; k++) line(this.picks[k - 1].point, this.picks[k].point, 'main');
    for (const p of this.picks) dot(p.point);
    const last = this.picks[this.picks.length - 1];
    if (last && this.cursor) {
      line(last.point, this.cursor, 'aux');
      const r = measureBetween(last, o!.pick!, this.ctx.viewDir());
      label(last.point.clone().lerp(this.cursor, 0.5), fmtMm(r.total), true);
    }
    if (o?.pick) {
      if (o.pick.on && (o.pick.kind === 'axis' || o.pick.kind === 'axisEnd' || o.pick.kind === 'axisMid')) line(o.pick.on[0], o.pick.on[1], 'guide');
      if (o.pick.on && (o.pick.kind === 'edge' || o.pick.kind === 'midpoint')) line(o.pick.on[0], o.pick.on[1], 'aux', 2);
      const s = P(o.pick.point);
      if (s) this.glyph(el, s, o.pick.kind, style.line, style.plate);
    }
  }

  private glyph(el: (tag: string, attrs: Record<string, string | number>) => Element, at: [number, number], kind: SnapCandidate['kind'], stroke: string, fill: string): void {
    drawSnapGlyph(el, at, kind, stroke, fill);
  }
}

/** Revit-style snap marks: square endpoint, triangle midpoint, circle centre, diamond centreline, X on an edge. */
export function drawSnapGlyph(el: (tag: string, attrs: Record<string, string | number>) => Element, [x, y]: [number, number], kind: SnapCandidate['kind'], stroke: string, fill: string): void {
  const common = { fill: 'none', stroke, 'stroke-width': 2 };
  const r = 6;
  switch (kind) {
    case 'endpoint':
      el('rect', { x: x - r, y: y - r, width: r * 2, height: r * 2, ...common });
      break;
    case 'midpoint':
    case 'axisMid':
      el('polygon', { points: `${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`, ...common });
      break;
    case 'centre':
    case 'axisEnd':
      el('circle', { cx: x, cy: y, r, ...common });
      el('circle', { cx: x, cy: y, r: 1.6, fill: stroke });
      break;
    case 'axis':
      el('polygon', { points: `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`, ...common });
      break;
    case 'edge':
      el('path', { d: `M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`, ...common });
      break;
    default:
      el('circle', { cx: x, cy: y, r: 3.5, fill, stroke, 'stroke-width': 1.6 });
  }
}

/**
 * Tab while selecting (no tool): the elements under the cursor front to back, then, when the front
 * one is joined end to end with others of its kind (walls, beams), the whole chain, as in Revit.
 */
export function tabOptions(s: MeasureScene, hits: RayHit[], axisOf: (i: number) => MemberAxis | null): Array<{ label: string; elements: number[]; chain: boolean }> {
  const out: Array<{ label: string; elements: number[]; chain: boolean }> = hits.map((h) => ({ label: elementLabel(s.elements[h.index]), elements: [h.index], chain: false }));
  if (hits.length) {
    const front = hits[0].index;
    const chain = connectedChain(s, front, axisOf);
    if (chain.length > 1) {
      const e = s.elements[front];
      const plural = e.category === 'Wall' ? 'walls' : e.category === 'Other' ? 'elements' : `${e.category.toLowerCase()}s`;
      out.push({ label: `Chain of ${chain.length} joined ${plural}`, elements: chain, chain: true });
    }
  }
  return out;
}

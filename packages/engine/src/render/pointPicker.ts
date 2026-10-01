/**
 * Picking two points Revit's way (docs/design/datums-and-constraints.md): the shared engine behind drawing
 * grids and reference planes, and Move and Align after. While the cursor moves it snaps — element points first
 * (endpoints, midpoints, centres, member axis ends), then datum intersections and datum lines, else a free point
 * on the view's work plane; after the first point a free direction locks near 0°, 45°, 90° (Shift: only 0°/90°),
 * a listening dimension shows the length in the project's units, and typing a length + Enter places the second
 * point along the direction shown. Esc clears what was typed, then the first point, then ends the tool.
 * Points are reported in plan millimetres (X east, Y north), the parametric model's frame.
 */
import { Plane, Vector3 } from 'three';
import type { MeasureScene, MemberAxis, PlanarFace, SnapCandidate } from './measure';
import { snapCandidates } from './measure';
import { drawSnapGlyph } from './measureTool';
import { snapDirection, snapToDatums, type DatumLine, type P2 } from './snapping';
import { formatLength, parseLength } from '../units';

export interface PickContext {
  scene: () => MeasureScene | null;
  ray: (clientX: number, clientY: number) => { origin: Vector3; dir: Vector3 } | null;
  project: (p: Vector3) => [number, number] | null;
  toLocal: (clientX: number, clientY: number) => [number, number];
  pixel: () => number;
  axisOf: (i: number) => MemberAxis | null;
  faceOf: (i: number, tri: number) => PlanarFace;
  cutsOf?: (i: number) => Array<[Vector3, Vector3]>;
  render: () => void;
}

export interface PickOptions {
  /** What to ask for: the first point, then the second. */
  prompts: [string, string];
  /** The work plane's height in the viewer (m): a plan's level. */
  planeY: number;
  /** Datum lines to snap to, in plan mm. */
  datums: () => readonly DatumLine[];
  onPick: (a: P2, b: P2) => void;
  onStatus?: (s: PickStatus) => void;
  /** Keep picking after a pair (Revit's Grid tool draws one grid after another until Esc). */
  continuous?: boolean;
}

export interface PickStatus {
  prompt: string;
  /** The snap under the cursor, or null for a free point. */
  snap: string | null;
  /** The listening dimension: the current length, as shown. */
  length: string | null;
  typed: string;
}

type Snap = { at: P2; kind: SnapCandidate['kind'] | 'intersection' | 'datum' | 'free'; label: string | null };

const toPlan = (v: Vector3): P2 => [v.x * 1000, -v.z * 1000];
const RADIUS_PX = 12;

export class PointPicker {
  private start: P2 | null = null;
  private cur: Snap | null = null;
  private typed = '';
  private shift = false;
  private locked: number | null = null;
  private readonly onShift = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      this.shift = e.type === 'keydown';
      if (this.lastHover) this.hover(...this.lastHover);
    }
  };
  private lastHover: [number, number] | null = null;

  constructor(
    private ctx: PickContext,
    private opts: PickOptions,
  ) {
    window.addEventListener('keydown', this.onShift);
    window.addEventListener('keyup', this.onShift);
    this.publish();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onShift);
    window.removeEventListener('keyup', this.onShift);
  }

  private plane(): Plane {
    return new Plane(new Vector3(0, 1, 0), -this.opts.planeY);
  }
  private world(p: P2): Vector3 {
    return new Vector3(p[0] / 1000, this.opts.planeY, -p[1] / 1000);
  }

  hover(clientX: number, clientY: number): void {
    this.lastHover = [clientX, clientY];
    const ray = this.ctx.ray(clientX, clientY);
    if (!ray) return;
    const local = this.ctx.toLocal(clientX, clientY);
    const pixel = this.ctx.pixel();
    let snap: Snap | null = null;
    // 1. element points
    const s = this.ctx.scene();
    if (s) {
      const { candidates } = snapCandidates(s, { origin: ray.origin, dir: ray.dir, cursor: local, project: (p) => this.ctx.project(p) ?? [-1e9, -1e9], radius: RADIUS_PX, pixel, axisOf: this.ctx.axisOf, faceOf: this.ctx.faceOf, cutsOf: this.ctx.cutsOf });
      const pt = candidates.find((c) => ['endpoint', 'midpoint', 'centre', 'axisEnd', 'axisMid'].includes(c.kind) && c.dist <= RADIUS_PX);
      if (pt) snap = { at: toPlan(pt.point), kind: pt.kind, label: pt.label };
    }
    // the free point on the work plane
    const hit = new Vector3();
    const ok = this.planeHit(ray.origin, ray.dir, hit);
    if (!snap && ok) {
      // 2. datums
      const d = snapToDatums(toPlan(hit), this.opts.datums(), RADIUS_PX * pixel * 1000);
      snap = d ? { at: d.at, kind: d.kind, label: d.label } : { at: toPlan(hit), kind: 'free', label: null };
    }
    if (!snap) return;
    // 3. direction locks for free and datum-line points once a first point is down
    this.locked = null;
    if (this.start && (snap.kind === 'free' || snap.kind === 'datum')) {
      const dir = snapDirection(this.start, snap.at, { ortho: this.shift });
      if (dir.locked) {
        snap = { ...snap, at: dir.end };
        this.locked = dir.angle;
      }
    }
    this.cur = snap;
    this.publish();
    this.ctx.render();
  }

  private planeHit(o: Vector3, d: Vector3, out: Vector3): boolean {
    const t = this.plane().distanceToPoint(o);
    const den = this.plane().normal.dot(d);
    if (Math.abs(den) < 1e-9) return false;
    out.copy(o).addScaledVector(d, -t / den);
    return true;
  }

  click(_x?: number, _y?: number, _double?: boolean): void {
    if (!this.cur) return;
    if (!this.start) {
      this.start = this.cur.at;
      this.typed = '';
      this.publish();
      return;
    }
    this.finish(this.cur.at);
  }

  private finish(end: P2): void {
    const a = this.start!;
    if (Math.hypot(end[0] - a[0], end[1] - a[1]) < 1) return; // the same point twice
    this.opts.onPick(a, end);
    this.start = null;
    this.typed = '';
    this.publish();
    this.ctx.render();
  }

  /** Keys while picking: a length to type, Enter to place it, Backspace, Esc. True when the key was used. */
  key(key: string): boolean {
    if (key === 'Escape') {
      if (this.typed) this.typed = '';
      else if (this.start) this.start = null;
      else return false;
      this.publish();
      this.ctx.render();
      return true;
    }
    if (key === 'Backspace') {
      if (!this.typed) return false;
      this.typed = this.typed.slice(0, -1);
      this.publish();
      return true;
    }
    if (key === 'Enter') {
      if (!this.start || !this.typed || !this.cur) return false;
      const len = parseLength(this.typed) * 1000;
      const dx = this.cur.at[0] - this.start[0], dy = this.cur.at[1] - this.start[1];
      const l = Math.hypot(dx, dy);
      if (!Number.isFinite(len) || len === 0 || l < 1e-9) return true;
      this.finish([this.start[0] + (dx / l) * len, this.start[1] + (dy / l) * len]);
      return true;
    }
    if (this.start && /^[0-9.,'"\- ]$|^[mcfitMCFIT]$/.test(key)) {
      this.typed += key;
      this.publish();
      this.ctx.render();
      return true;
    }
    return false;
  }

  step(_dir?: 1 | -1): boolean {
    /* Tab: the snap list is stepped by the measure tool; the picker takes the best snap */
    return false;
  }
  leave(): void {
    this.lastHover = null;
  }

  private length(): number | null {
    if (!this.start || !this.cur) return null;
    return Math.hypot(this.cur.at[0] - this.start[0], this.cur.at[1] - this.start[1]) / 1000;
  }

  private publish(): void {
    const len = this.length();
    this.opts.onStatus?.({
      prompt: this.opts.prompts[this.start ? 1 : 0],
      snap: this.cur?.label ?? null,
      length: len === null ? null : formatLength(len, { symbol: true }),
      typed: this.typed,
    });
  }

  draw(svg: SVGSVGElement, style: { line: string; text: string; plate: string; guide: string; font: string }): void {
    while (svg.firstChild) svg.firstChild.remove();
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.appendChild(n);
      return n;
    };
    if (!this.cur) return;
    const c = this.ctx.project(this.world(this.cur.at));
    if (!c) return;
    if (this.start) {
      const a = this.ctx.project(this.world(this.start));
      if (a) {
        el('line', { x1: a[0], y1: a[1], x2: c[0], y2: c[1], stroke: style.guide, 'stroke-width': 1.6, 'stroke-dasharray': '10 4' });
        el('circle', { cx: a[0], cy: a[1], r: 3.5, fill: style.guide });
        // the listening dimension: the length (or what is being typed) beside the line's middle
        const label = this.typed ? `${this.typed}|` : formatLength(this.length() ?? 0, { symbol: true }) + (this.locked !== null ? `  ${Math.round(this.locked)}°` : '');
        const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        const w = label.length * 7.2 + 12;
        el('rect', { x: mx - w / 2, y: my - 22, width: w, height: 18, rx: 3, fill: style.plate, stroke: style.guide, 'stroke-width': this.typed ? 1.5 : 0.8 });
        const t = el('text', { x: mx, y: my - 13, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: style.text, 'font-size': 11.5, 'font-weight': 600, 'font-family': style.font });
        t.textContent = label;
      }
    }
    const k = this.cur.kind;
    if (k === 'intersection' || k === 'datum') {
      el('circle', { cx: c[0], cy: c[1], r: 6, fill: 'none', stroke: style.guide, 'stroke-width': 2 });
      if (k === 'intersection') {
        el('line', { x1: c[0] - 6, y1: c[1] - 6, x2: c[0] + 6, y2: c[1] + 6, stroke: style.guide, 'stroke-width': 2 });
        el('line', { x1: c[0] - 6, y1: c[1] + 6, x2: c[0] + 6, y2: c[1] - 6, stroke: style.guide, 'stroke-width': 2 });
      }
    } else if (k === 'free') {
      el('line', { x1: c[0] - 8, y1: c[1], x2: c[0] + 8, y2: c[1], stroke: style.line, 'stroke-width': 1 });
      el('line', { x1: c[0], y1: c[1] - 8, x2: c[0], y2: c[1] + 8, stroke: style.line, 'stroke-width': 1 });
    } else drawSnapGlyph(el, c, k, style.guide, style.plate);
    if (this.cur.label) {
      const t = el('text', { x: c[0] + 12, y: c[1] + 18, fill: style.guide, 'font-size': 11, 'font-family': style.font });
      t.textContent = this.cur.label;
    }
  }
}

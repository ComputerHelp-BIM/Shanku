import { Vector3 } from 'three';
import { elementLabel } from '../qa/checks';
import { snapCandidates, type MeasureScene, type MemberAxis, type PlanarFace, type SnapCandidate } from './measure';
import { drawSnapGlyph } from './measureTool';
import { arcFromEdge, DIMENSION_TOOLS, drawDimensions, planeBasis, projectOnPlane, type DimensionKind, type DimensionStyle, type FoundArc, type Origin, type PlacedDimension, type Vec3 } from './dimensions';

/**
 * Placing dimensions, the way Revit's Annotate → Dimension tools work: pick the references (Tab
 * cycles the snaps under the cursor), then click an empty spot to place the line, arc or text. Aligned
 * and Linear keep adding references while you click on edges and points, and place when you click
 * away (or press Enter). Esc drops the half-made dimension; Esc again closes the tool.
 */
export interface DimensionReadout {
  kind: DimensionKind;
  prompt: string;
  hover: { label: string; position: number; total: number } | null;
}

export interface DimensionContext {
  scene: () => MeasureScene | null;
  ray: (clientX: number, clientY: number) => { origin: Vector3; dir: Vector3 } | null;
  project: (p: Vector3) => [number, number] | null;
  toLocal: (clientX: number, clientY: number) => [number, number];
  pixel: () => number;
  /** View direction in 2D views, else null. */
  viewDir: () => Vector3 | null;
  /** Camera direction (always). */
  cameraDir: () => Vector3;
  axisOf: (i: number) => MemberAxis | null;
  faceOf: (i: number, tri: number) => PlanarFace;
  /** Cut outline of an element (cached). */
  cutsOf?: (i: number) => Array<[Vector3, Vector3]>;
  highlight: (elements: readonly number[]) => void;
  newId: () => string;
  origin: () => Origin;
  place: (d: PlacedDimension) => void;
  emit: (r: DimensionReadout | null) => void;
  render: () => void;
}

interface Option {
  label: string;
  pick: SnapCandidate;
  arc?: FoundArc;
}

const STRONG = new Set(['endpoint', 'midpoint', 'centre', 'axisEnd', 'axisMid', 'axis', 'edge']);
const arr = (p: Vector3): Vec3 => [p.x, p.y, p.z];

/** The work plane in 3D views: the world plane (plan or elevation) facing the camera most. */
export function workPlaneNormal(cameraDir: Vector3): Vector3 {
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  let best = axes[1], dot = -1;
  for (const a of axes) {
    const d = Math.abs(a.dot(cameraDir));
    if (d > dot) {
      dot = d;
      best = a;
    }
  }
  return best.clone().multiplyScalar(best.dot(cameraDir) > 0 ? -1 : 1);
}

export class DimensionTool {
  kind: DimensionKind;
  private options: Option[] = [];
  private cycle = 0;
  private anchor: [number, number] | null = null;
  private picks: SnapCandidate[] = [];
  private arc: { arc: FoundArc; pick: SnapCandidate } | null = null;
  private cursor: { client: [number, number] } | null = null;

  constructor(private ctx: DimensionContext, kind: DimensionKind) {
    this.kind = kind;
    this.publish();
  }

  setKind(kind: DimensionKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.cancelPending();
    this.options = [];
    this.publish();
  }

  cancelPending(): boolean {
    const had = this.picks.length > 0 || this.arc !== null;
    this.picks = [];
    this.arc = null;
    this.publish();
    return had;
  }

  dispose(): void {
    this.ctx.highlight([]);
    this.ctx.emit(null);
  }

  // ------------------------------------------------------------- hover

  hover(clientX: number, clientY: number): void {
    this.cursor = { client: [clientX, clientY] };
    const local = this.ctx.toLocal(clientX, clientY);
    if (this.anchor && Math.hypot(local[0] - this.anchor[0], local[1] - this.anchor[1]) <= 3 && this.options.length) {
      this.ctx.render();
      return;
    }
    this.anchor = local;
    this.cycle = 0;
    this.options = this.optionsAt(clientX, clientY, local);
    this.apply();
  }

  step(dir: 1 | -1): boolean {
    if (this.options.length < 2) return this.options.length === 1;
    this.cycle = (this.cycle + dir + this.options.length) % this.options.length;
    this.apply();
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

  private apply(): void {
    const o = this.current;
    this.ctx.highlight(o?.pick.index !== null && o?.pick.index !== undefined ? [o.pick.index] : []);
    this.publish();
  }

  /** Is the tool now choosing where to put the dimension (all references picked)? */
  private get placing(): boolean {
    switch (this.kind) {
      case 'aligned':
      case 'linear':
        return this.picks.length >= 2;
      case 'angular':
        return this.picks.length >= 2;
      case 'radial':
      case 'diameter':
      case 'arcLength':
        return this.arc !== null;
      case 'spotElevation':
      case 'spotCoordinate':
        return this.picks.length >= 1;
      case 'spotSlope':
        return false;
    }
  }

  private optionsAt(clientX: number, clientY: number, local: [number, number]): Option[] {
    const s = this.ctx.scene();
    const ray = this.ctx.ray(clientX, clientY);
    if (!s || !ray) return [];
    if (this.placing && this.kind !== 'aligned' && this.kind !== 'linear') return [];
    const { candidates } = snapCandidates(s, {
      origin: ray.origin, dir: ray.dir, cursor: local, radius: 12, pixel: this.ctx.pixel(),
      project: (p) => this.ctx.project(p) ?? [1e9, 1e9], axisOf: this.ctx.axisOf, faceOf: this.ctx.faceOf, cutsOf: this.ctx.cutsOf,
    });
    const els = s.elements;
    const name = (c: SnapCandidate) => `${c.label}${c.index !== null && els[c.index] ? ` · ${elementLabel(els[c.index])}` : ''}`;
    switch (this.kind) {
      case 'aligned':
      case 'linear':
      case 'spotElevation':
      case 'spotCoordinate':
        return candidates.map((c) => ({ label: name(c), pick: c }));
      case 'angular': {
        // A line in the view: edges and centrelines that do not point straight at the viewer (those show as a dot).
        const n = this.planeNormal();
        return candidates.filter((c) => (c.kind === 'edge' || c.kind === 'midpoint' || c.kind === 'axis') && this.lineDir(c, n) !== null).map((c) => ({ label: name(c), pick: c }));
      }
      case 'spotSlope':
        return candidates.filter((c) => c.ref.kind === 'face').map((c) => ({ label: `${c.kind === 'centre' ? 'Face centre' : 'Face'} · ${c.index !== null ? elementLabel(els[c.index]) : ''}`, pick: c }));
      case 'radial':
      case 'diameter':
      case 'arcLength': {
        const out: Option[] = [];
        const seen = new Set<string>();
        for (const c of candidates) {
          if (c.ref.kind !== 'edge' || c.index === null) continue;
          const arc = arcFromEdge(s, c.index, c.ref.a, c.ref.b);
          if (!arc) continue;
          const k = `${c.index}:${arc.centre.x.toFixed(4)},${arc.centre.y.toFixed(4)},${arc.centre.z.toFixed(4)}:${arc.radius.toFixed(4)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ label: `${arc.closed ? 'Circle' : 'Arc'} R ${Math.round(arc.radius * 1000).toLocaleString('en-IN')} · ${elementLabel(els[c.index])}`, pick: c, arc });
        }
        return out;
      }
    }
  }

  // ------------------------------------------------------------- clicks

  click(clientX: number, clientY: number, double: boolean): void {
    this.hover(clientX, clientY);
    const o = this.current;
    switch (this.kind) {
      case 'aligned':
      case 'linear': {
        if (this.picks.length >= 2) {
          const addsRef = o && STRONG.has(o.pick.kind) && o.pick.dist <= 6 && !double && !this.picks.some((p) => p.point.distanceTo(o.pick.point) < 1e-4);
          if (addsRef && this.kind === 'aligned') this.picks.push(o!.pick);
          else this.finish(clientX, clientY);
        } else if (o) {
          if (!this.picks.some((p) => p.point.distanceTo(o.pick.point) < 1e-4)) this.picks.push(o.pick);
        }
        break;
      }
      case 'angular':
        if (this.picks.length >= 2) this.finish(clientX, clientY);
        else if (o) this.picks.push(o.pick);
        break;
      case 'radial':
      case 'diameter':
      case 'arcLength':
        if (this.arc) this.finish(clientX, clientY);
        else if (o?.arc) this.arc = { arc: o.arc, pick: o.pick };
        break;
      case 'spotElevation':
      case 'spotCoordinate':
        if (this.picks.length) this.finish(clientX, clientY);
        else if (o) this.picks.push(o.pick);
        break;
      case 'spotSlope':
        if (o) {
          this.picks = [o.pick];
          this.finish(clientX, clientY);
        }
        break;
    }
    this.options = [];
    this.anchor = null;
    this.hover(clientX, clientY);
  }

  key(key: string): boolean {
    if (key === 'Escape') return this.cancelPending();
    if (key === 'Enter' && this.placing && this.cursor) {
      this.finish(this.cursor.client[0], this.cursor.client[1]);
      return true;
    }
    return false;
  }

  private finish(clientX: number, clientY: number): void {
    const d = this.build(clientX, clientY);
    this.picks = [];
    this.arc = null;
    if (d) this.ctx.place(d);
    this.publish();
  }

  // ------------------------------------------------------------- building a dimension

  private planeNormal(): Vector3 {
    if (this.arc) return this.arc.arc.normal.clone().normalize();
    const vd = this.ctx.viewDir();
    return vd ? vd.clone().negate().normalize() : workPlaneNormal(this.ctx.cameraDir());
  }

  /** The cursor on the dimension's plane (through the first reference). */
  private cursorOnPlane(clientX: number, clientY: number, n: Vector3, through: Vector3): Vector3 | null {
    const ray = this.ctx.ray(clientX, clientY);
    if (!ray) return null;
    const den = ray.dir.dot(n);
    if (Math.abs(den) < 1e-9) return null;
    const t = through.clone().sub(ray.origin).dot(n) / den;
    return ray.origin.clone().addScaledVector(ray.dir, t);
  }

  private refOf(p: SnapCandidate): PlacedDimension['refs'][number] {
    const s = this.ctx.scene();
    if (!s || p.index === null) return null;
    const e = s.elements[p.index];
    if (!e) return null;
    return { globalId: e.globalId, anchor: [(e.bounds[0] + e.bounds[3]) / 2, (e.bounds[1] + e.bounds[4]) / 2, (e.bounds[2] + e.bounds[5]) / 2] };
  }

  /** In-plane direction of a reference line (edge or centreline), or null. */
  private lineDir(p: SnapCandidate, n: Vector3): Vector3 | null {
    const r = p.ref;
    const d = r.kind === 'edge' ? new Vector3().subVectors(r.b, r.a) : r.kind === 'axis' ? r.axis.dir.clone() : null;
    if (!d) return null;
    const q = projectOnPlane(d, n);
    return q.lengthSq() > 1e-10 ? q.normalize() : null;
  }

  /** The dimension the picks and the cursor make (the preview, or the one to place). */
  private build(clientX: number, clientY: number, preview = false): PlacedDimension | null {
    const n = this.planeNormal();
    const id = preview ? 'preview' : this.ctx.newId();
    const kind = this.kind;
    switch (kind) {
      case 'aligned':
      case 'linear': {
        if (this.picks.length < 2) return null;
        const p0 = this.picks[0].point;
        const at = this.cursorOnPlane(clientX, clientY, n, p0);
        if (!at) return null;
        const pts = this.picks.map((p) => p.point);
        let dir: Vector3 | null = null;
        if (kind === 'linear') {
          const [u, w] = planeBasis(n);
          const centre = pts.reduce((m, p) => m.add(p), new Vector3()).divideScalar(pts.length);
          const off = at.clone().sub(centre);
          // Cursor moved up or down: measure across (horizontal); moved sideways: measure up/down.
          dir = Math.abs(off.dot(w)) >= Math.abs(off.dot(u)) ? u : w;
        } else {
          const l0 = this.lineDir(this.picks[0], n), l1 = this.lineDir(this.picks[1], n);
          const f0 = this.picks[0].ref.kind === 'face' ? projectOnPlane(this.picks[0].ref.normal.clone(), n) : null;
          const f1 = this.picks[1].ref.kind === 'face' ? projectOnPlane(this.picks[1].ref.normal.clone(), n) : null;
          if (l0 && l1 && Math.abs(l0.dot(l1)) > 0.9998) dir = new Vector3().crossVectors(n, l0).normalize();
          else if (f0 && f1 && f0.lengthSq() > 1e-8 && f1.lengthSq() > 1e-8 && Math.abs(f0.clone().normalize().dot(f1.clone().normalize())) > 0.9998) dir = f0.normalize();
          else {
            const d = projectOnPlane(pts[1].clone().sub(pts[0]), n);
            if (d.lengthSq() < 1e-10) return null;
            dir = d.normalize();
          }
        }
        return { id, kind, points: pts.map(arr), refs: this.picks.map((p) => this.refOf(p)), at: arr(at), normal: arr(n), dir: arr(dir) };
      }
      case 'angular': {
        if (this.picks.length < 2) return null;
        const d0 = this.lineDir(this.picks[0], n), d1 = this.lineDir(this.picks[1], n);
        if (!d0 || !d1 || Math.abs(d0.dot(d1)) > 0.99995) return null; // parallel lines have no angle
        const at = this.cursorOnPlane(clientX, clientY, n, this.picks[0].point);
        if (!at) return null;
        return { id, kind, points: this.picks.slice(0, 2).map((p) => arr(p.point)), refs: this.picks.slice(0, 2).map((p) => this.refOf(p)), at: arr(at), normal: arr(n), lines: [arr(d0), arr(d1)] };
      }
      case 'radial':
      case 'diameter':
      case 'arcLength': {
        if (!this.arc) return null;
        const a = this.arc.arc;
        const at = this.cursorOnPlane(clientX, clientY, n, a.centre);
        if (!at) return null;
        const ref = this.refOf(this.arc.pick);
        return {
          id, kind, points: [arr(a.start), arr(a.end)], refs: [ref, ref], at: arr(at), normal: arr(n),
          arc: { centre: arr(a.centre), radius: a.radius, start: arr(a.start), end: arr(a.end), sweep: a.sweep, closed: a.closed },
        };
      }
      case 'spotElevation':
      case 'spotCoordinate': {
        if (!this.picks.length) return null;
        const p = this.picks[0].point;
        const vd = this.ctx.viewDir();
        const pn = vd ? vd.clone().negate() : this.ctx.cameraDir().clone().negate();
        const at = this.cursorOnPlane(clientX, clientY, pn, p) ?? p.clone();
        return { id, kind, points: [arr(p)], refs: [this.refOf(this.picks[0])], at: arr(at), normal: arr(pn) };
      }
      case 'spotSlope': {
        const p = this.picks[0];
        if (!p || p.ref.kind !== 'face') return null;
        return { id, kind, points: [arr(p.point)], refs: [this.refOf(p)], at: arr(p.point), normal: arr(n), slope: arr(p.ref.normal) };
      }
    }
  }

  // ------------------------------------------------------------- readout and drawing

  private prompt(): string {
    const name = DIMENSION_TOOLS.find((t) => t.id === this.kind)?.label ?? '';
    const n = this.picks.length;
    switch (this.kind) {
      case 'aligned':
        return n === 0 ? 'Pick the first reference: an edge, face, point or centreline (Tab cycles)' : n === 1 ? 'Pick the second reference' : 'Pick more references for a string, or click away to place (Enter)';
      case 'linear':
        return n === 0 ? 'Pick the first point' : n === 1 ? 'Pick the second point' : 'Move to choose horizontal or vertical, then click to place';
      case 'angular':
        return n === 0 ? 'Pick the first edge or centreline' : n === 1 ? 'Pick the second edge or centreline' : 'Click to place the arc (the quadrant follows the cursor)';
      case 'radial':
      case 'diameter':
      case 'arcLength':
        return this.arc ? `Click to place the ${name.toLowerCase()} dimension` : 'Point at a circular edge: a round column, pile or curved beam';
      case 'spotElevation':
      case 'spotCoordinate':
        return n ? 'Click to place the text (leader follows)' : 'Pick a point: top of slab, soffit, founding level… (Tab cycles)';
      case 'spotSlope':
        return 'Pick a face: the arrow points downhill';
    }
  }

  private publish(): void {
    const o = this.current;
    this.ctx.emit({ kind: this.kind, prompt: this.prompt(), hover: o ? { label: o.label, position: this.cycle + 1, total: this.options.length } : null });
    this.ctx.render();
  }

  draw(svg: SVGSVGElement, style: DimensionStyle): void {
    while (svg.firstChild) svg.firstChild.remove();
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const node = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      svg.appendChild(node);
      return node;
    };
    const P = (p: Vector3) => this.ctx.project(p);
    // Picked references.
    for (const p of this.picks) {
      const s = P(p.point);
      if (s) el('circle', { cx: s[0], cy: s[1], r: 3, fill: style.hot });
      if (p.ref.kind === 'edge') {
        const a = P(p.ref.a), b = P(p.ref.b);
        if (a && b) el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: style.hot, 'stroke-width': 2 });
      }
    }
    // Arc under the cursor, or the one picked.
    const arc = this.arc?.arc ?? this.current?.arc ?? null;
    if (arc) {
      const pts = arc.points.map((p) => P(p)).filter((p): p is [number, number] => !!p);
      if (pts.length > 1) el('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: style.hot, 'stroke-width': 2.4 });
    }
    // The dimension as it would be placed.
    if (this.placing && this.cursor) {
      const d = this.build(this.cursor.client[0], this.cursor.client[1], true);
      if (d) {
        const g = document.createElementNS(NS, 'g');
        svg.appendChild(g);
        drawDimensions(g, [d], P, style, { selected: new Set(), hot: 'preview', interactive: false, preview: true }, this.ctx.origin());
      }
    }
    const o = this.current;
    if (o && !this.current?.arc) {
      if (o.pick.on && (o.pick.kind === 'axis' || o.pick.kind === 'axisEnd' || o.pick.kind === 'axisMid')) {
        const a = P(o.pick.on[0]), b = P(o.pick.on[1]);
        if (a && b) el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: style.hot, 'stroke-width': 1.2, 'stroke-dasharray': '10 3 2 3' });
      }
      if (o.pick.ref.kind === 'edge' && (o.pick.kind === 'edge' || o.pick.kind === 'midpoint')) {
        const a = P(o.pick.ref.a), b = P(o.pick.ref.b);
        if (a && b) el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: style.hot, 'stroke-width': 2, 'stroke-opacity': 0.7 });
      }
      const s = P(o.pick.point);
      if (s) drawSnapGlyph(el, s, o.pick.kind, style.hot, style.plate);
    }
  }
}

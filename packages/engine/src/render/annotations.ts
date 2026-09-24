/**
 * View annotations drawn as a live SVG overlay that follows the camera (Revit's view symbols):
 * section marks and elevation marks in plans, level lines in elevations and sections, and section
 * traces across elevations. Heads are interactive: hover highlights, double-click opens the view.
 */
export type Annotation =
  | {
      kind: 'section';
      /** View it opens. */
      id: string;
      name: string;
      /** Line ends, world metres (x, y, z): the head is drawn at `a`, the tail at `b`. */
      a: [number, number, number];
      b: [number, number, number];
      /** Direction the section looks (world, horizontal). */
      look: [number, number, number];
    }
  | {
      kind: 'elevation';
      id: string;
      name: string;
      /** Mark position (outside the building) and the direction it looks, world. */
      at: [number, number, number];
      look: [number, number, number];
    }
  | {
      kind: 'level';
      id: string;
      name: string;
      /** Elevation label, e.g. "3,200". */
      value: string;
      /** Line ends at the level height, world; the head is drawn at `b`. */
      a: [number, number, number];
      b: [number, number, number];
    };

export interface AnnotationStyle {
  line: string;
  text: string;
  plate: string;
  hot: string;
  font: string;
}

type Project = (p: readonly [number, number, number]) => [number, number] | null;

const NS = 'http://www.w3.org/2000/svg';

/** Redraws all annotations into `svg`. `hot` is the id under the pointer (highlighted). */
export function drawAnnotations(
  svg: SVGSVGElement,
  anns: readonly Annotation[],
  project: Project,
  style: AnnotationStyle,
  hot: string | null,
  size: { width: number; height: number } = { width: Infinity, height: Infinity },
): void {
  while (svg.firstChild) svg.firstChild.remove();
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent.appendChild(n);
    return n;
  };
  const text = (parent: Element, x: number, y: number, s: string, size: number, weight = 600, anchor = 'middle') => {
    const t = el('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'central', fill: style.text, 'font-size': size, 'font-weight': weight, 'font-family': style.font }, parent);
    t.textContent = s;
    return t;
  };
  /**
   * Keeps a head on screen: if `head` falls outside the view (inset by the head's room), it slides
   * along the line toward `other` to the first point inside, as Revit keeps level and section heads
   * visible. Returns null when the whole line is off screen.
   */
  const keepInView = (head: [number, number], other: [number, number], room: { l: number; r: number; t: number; b: number }): [number, number] | null => {
    const x0 = room.l, x1 = size.width - room.r, y0 = room.t, y1 = size.height - room.b;
    const inside = (p: [number, number]) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    if (inside(head)) return head;
    let lo = 0, hi = 1; // parameter from head (0) to other (1)
    const at = (t: number): [number, number] => [head[0] + (other[0] - head[0]) * t, head[1] + (other[1] - head[1]) * t];
    if (!inside(other)) {
      // find any inside point by sampling, then bisect toward the head
      let found = -1;
      for (let k = 1; k < 64; k++) if (inside(at(k / 64))) { found = k / 64; break; }
      if (found < 0) return null;
      hi = found;
    }
    for (let i = 0; i < 24; i++) {
      const m = (lo + hi) / 2;
      if (inside(at(m))) hi = m;
      else lo = m;
    }
    return at(hi);
  };

  // Screen direction of a world direction at a point (for arrows).
  const screenDir = (at: readonly [number, number, number], d: readonly [number, number, number]): [number, number] | null => {
    const p0 = project(at), p1 = project([at[0] + d[0], at[1] + d[1], at[2] + d[2]]);
    if (!p0 || !p1) return null;
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return l < 1e-6 ? null : [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
  };

  for (const a of anns) {
    const isHot = hot === a.id;
    const stroke = isHot ? style.hot : style.line;
    if (a.kind === 'section') {
      const ra = project(a.a), pb = project(a.b);
      if (!ra || !pb) continue;
      const pa = keepInView(ra, pb, { l: 16, r: 16, t: 16, b: 16 });
      if (!pa) continue;
      el('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], stroke, 'stroke-width': isHot ? 2 : 1.4, 'stroke-dasharray': '14 4 2 4' });
      const d = screenDir(a.a, a.look);
      const g = el('g', { 'data-view': a.id, class: 'sk-ann-head', style: 'pointer-events: auto; cursor: pointer' });
      // head: circle with the name, and a filled arrow pointing the way the section looks
      if (d) {
        const tip = [pa[0] + d[0] * 22, pa[1] + d[1] * 22], side = [-d[1] * 9, d[0] * 9];
        el('path', { d: `M ${pa[0] + side[0]} ${pa[1] + side[1]} L ${tip[0]} ${tip[1]} L ${pa[0] - side[0]} ${pa[1] - side[1]} Z`, fill: stroke }, g);
      }
      el('circle', { cx: pa[0], cy: pa[1], r: 11, fill: style.plate, stroke, 'stroke-width': 1.4 }, g);
      text(g, pa[0], pa[1], a.name.replace(/^Section\s*/i, '') || a.name, 10);
      el('title', {}, g).textContent = `${a.name} (double-click to open)`;
      // tail: a short tick
      if (d) el('line', { x1: pb[0], y1: pb[1], x2: pb[0] + d[0] * 12, y2: pb[1] + d[1] * 12, stroke, 'stroke-width': 1.4 });
    } else if (a.kind === 'elevation') {
      const p = project(a.at);
      const d = screenDir(a.at, a.look);
      if (!p) continue;
      const g = el('g', { 'data-view': a.id, class: 'sk-ann-head', style: 'pointer-events: auto; cursor: pointer' });
      el('circle', { cx: p[0], cy: p[1], r: 12, fill: style.plate, stroke, 'stroke-width': 1.4 }, g);
      if (d) {
        // Revit's elevation mark: a filled wedge from the circle toward the building
        const tip = [p[0] + d[0] * 22, p[1] + d[1] * 22], side = [-d[1] * 12, d[0] * 12];
        el('path', { d: `M ${p[0] + side[0]} ${p[1] + side[1]} L ${tip[0]} ${tip[1]} L ${p[0] - side[0]} ${p[1] - side[1]} Z`, fill: stroke }, g);
        el('circle', { cx: p[0], cy: p[1], r: 12, fill: style.plate, stroke, 'stroke-width': 1.4 }, g);
      }
      text(g, p[0], p[1], a.name.slice(0, 1).toUpperCase(), 11);
      el('title', {}, g).textContent = `${a.name} elevation (double-click to open)`;
    } else {
      const pa = project(a.a), rb = project(a.b);
      if (!pa || !rb) continue;
      const pb = keepInView(rb, pa, { l: 8, r: 30 + Math.max(a.name.length, a.value.length) * 7.2, t: 16, b: 16 }); // room for the label
      if (!pb) continue;
      el('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], stroke, 'stroke-width': isHot ? 1.6 : 1, 'stroke-dasharray': '10 4 2 4' });
      const g = el('g', { 'data-view': a.id, class: 'sk-ann-head', style: 'pointer-events: auto; cursor: pointer' });
      // One hit area for the whole head (circle, name and value), so the gaps between them still count.
      el('rect', { x: pb[0] - 1, y: pb[1] - 18, width: 22 + Math.max(a.name.length, a.value.length) * 7.2, height: 36, fill: 'transparent', 'pointer-events': 'all' }, g);
      // level head: a target circle at the right end, name above the line, elevation below
      el('circle', { cx: pb[0] + 9, cy: pb[1], r: 7, fill: style.plate, stroke, 'stroke-width': 1.2 }, g);
      el('path', { d: `M ${pb[0] + 9} ${pb[1] - 7} A 7 7 0 0 1 ${pb[0] + 16} ${pb[1]} L ${pb[0] + 9} ${pb[1]} Z M ${pb[0] + 9} ${pb[1] + 7} A 7 7 0 0 1 ${pb[0] + 2} ${pb[1]} L ${pb[0] + 9} ${pb[1]} Z`, fill: stroke }, g);
      text(g, pb[0] + 22, pb[1] - 8, a.name, 11.5, 600, 'start');
      text(g, pb[0] + 22, pb[1] + 8, a.value, 11, 400, 'start');
      el('title', {}, g).textContent = `${a.name} (double-click to open its plan)`;
    }
  }
}

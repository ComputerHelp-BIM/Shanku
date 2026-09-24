/**
 * View annotations drawn as a live SVG overlay that follows the camera (Revit's view symbols):
 * section marks and elevation marks in plans, level lines in elevations and sections, section traces
 * across elevations. Each symbol is one hit target (line and head): hover and selection highlight all
 * of it, a selected level shows temporary dimensions to its neighbours, double-click opens the view.
 * Also draws the Section tool's rubber band (line, angle arc, angle and length).
 */
export type Annotation =
  | {
      kind: 'section';
      id: string;
      name: string;
      a: [number, number, number];
      b: [number, number, number];
      look: [number, number, number];
      /** Far clip depth (m): with it, a selected section shows its extent and grips (plans). */
      depth?: number;
    }
  | { kind: 'elevation'; id: string; name: string; at: [number, number, number]; look: [number, number, number] }
  | { kind: 'level'; id: string; name: string; value: string; a: [number, number, number]; b: [number, number, number] };

export interface AnnotationStyle {
  line: string;
  text: string;
  plate: string;
  /** Hover, preselect and selection colour (Revit blue). */
  hot: string;
  font: string;
}

export interface AnnotationState {
  hot: string | null;
  selected: ReadonlySet<string>;
  /** Would be picked by the selection box being dragged. */
  preselect: ReadonlySet<string>;
}

/** Section tool preview: start, cursor (already snapped), angle in degrees and length in metres. */
export interface LinePreview {
  a: [number, number];
  b: [number, number];
  angle: number;
  snapped: boolean;
  length: number;
}

type Project = (p: readonly [number, number, number]) => [number, number] | null;
type Screen = [number, number];

const NS = 'http://www.w3.org/2000/svg';

/** Screen-space segment of each symbol, for box selection (window: both ends inside; crossing: touches). */
export function annotationSegments(anns: readonly Annotation[], project: Project): Array<{ id: string; a: Screen; b: Screen }> {
  const out: Array<{ id: string; a: Screen; b: Screen }> = [];
  for (const an of anns) {
    if (an.kind === 'elevation') {
      const p = project(an.at);
      if (p) out.push({ id: an.id, a: [p[0] - 12, p[1] - 12], b: [p[0] + 12, p[1] + 12] });
    } else {
      const a = project(an.a), b = project(an.b);
      if (a && b) out.push({ id: an.id, a, b });
    }
  }
  return out;
}

/** Does segment a–b touch the rectangle? (Liang–Barsky clip.) */
export function segmentTouchesRect(a: Screen, b: Screen, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

export function drawAnnotations(
  svg: SVGSVGElement,
  anns: readonly Annotation[],
  project: Project,
  style: AnnotationStyle,
  state: AnnotationState,
  size: { width: number; height: number } = { width: Infinity, height: Infinity },
  preview: LinePreview | null = null,
): void {
  while (svg.firstChild) svg.firstChild.remove();
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent.appendChild(n);
    return n;
  };
  const text = (parent: Element, x: number, y: number, s: string, size: number, fill: string, weight = 600, anchor = 'middle') => {
    const t = el('text', { x, y, 'text-anchor': anchor, 'dominant-baseline': 'central', fill, 'font-size': size, 'font-weight': weight, 'font-family': style.font }, parent);
    t.textContent = s;
    return t;
  };
  const keepInView = (head: Screen, other: Screen, room: { l: number; r: number; t: number; b: number }): Screen | null => {
    const x0 = room.l, x1 = size.width - room.r, y0 = room.t, y1 = size.height - room.b;
    const inside = (p: Screen) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    if (inside(head)) return head;
    let lo = 0, hi = 1;
    const at = (t: number): Screen => [head[0] + (other[0] - head[0]) * t, head[1] + (other[1] - head[1]) * t];
    if (!inside(other)) {
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
  const screenDir = (at: readonly [number, number, number], d: readonly [number, number, number]): Screen | null => {
    const p0 = project(at), p1 = project([at[0] + d[0], at[1] + d[1], at[2] + d[2]]);
    if (!p0 || !p1) return null;
    const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return l < 1e-6 ? null : [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
  };
  const group = (id: string) => el('g', { 'data-view': id, style: 'pointer-events: auto; cursor: pointer' });
  // An invisible wide stroke along a line makes the line itself easy to hover and click.
  const hitLine = (g: Element, a: Screen, b: Screen) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'transparent', 'stroke-width': 10, 'pointer-events': 'stroke' }, g);

  const levelsDrawn: Array<{ an: Extract<Annotation, { kind: 'level' }>; pa: Screen }> = [];

  for (const a of anns) {
    const on = state.hot === a.id || state.selected.has(a.id) || state.preselect.has(a.id);
    const stroke = on ? style.hot : style.line;
    const ink = on ? style.hot : style.text;
    const w = state.selected.has(a.id) ? 2.2 : on ? 1.8 : 1.3;
    if (a.kind === 'section') {
      const ra = project(a.a), pb = project(a.b);
      if (!ra || !pb) continue;
      const pa = keepInView(ra, pb, { l: 16, r: 16, t: 16, b: 16 });
      if (!pa) continue;
      const g = group(a.id);
      hitLine(g, pa, pb);
      el('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], stroke, 'stroke-width': w, 'stroke-dasharray': '14 4 2 4' }, g);
      const d = screenDir(a.a, a.look);
      if (d) {
        const tip = [pa[0] + d[0] * 22, pa[1] + d[1] * 22], side = [-d[1] * 9, d[0] * 9];
        el('path', { d: `M ${pa[0] + side[0]} ${pa[1] + side[1]} L ${tip[0]} ${tip[1]} L ${pa[0] - side[0]} ${pa[1] - side[1]} Z`, fill: stroke }, g);
        el('line', { x1: pb[0], y1: pb[1], x2: pb[0] + d[0] * 12, y2: pb[1] + d[1] * 12, stroke, 'stroke-width': w }, g);
      }
      el('circle', { cx: pa[0], cy: pa[1], r: 11, fill: style.plate, stroke, 'stroke-width': w }, g);
      text(g, pa[0], pa[1], a.name.replace(/^Section\s*/i, '') || a.name, 10, ink);
      el('title', {}, g).textContent = `Section: ${a.name} (click to select, double-click to open)`;
      // Selected in a plan: far clip extent (dashed) and Revit's grips.
      if (state.selected.has(a.id) && a.depth !== undefined && d) {
        const far = (p: readonly [number, number, number]) => project([p[0] + a.look[0] * a.depth!, p[1], p[2] + a.look[2] * a.depth!]);
        const fa = far(a.a), fb = far(a.b);
        if (fa && fb) {
          el('path', { d: `M ${ra[0]} ${ra[1]} L ${fa[0]} ${fa[1]} L ${fb[0]} ${fb[1]} L ${pb[0]} ${pb[1]}`, fill: 'none', stroke: style.hot, 'stroke-width': 1, 'stroke-dasharray': '6 4', 'pointer-events': 'none' });
          const grip = (kind: string, at: Screen, dir: Screen, title: string) => {
            const gg = el('g', { 'data-grip': kind, 'data-view': a.id, style: 'pointer-events: auto; cursor: move' });
            const tip = [at[0] + dir[0] * 9, at[1] + dir[1] * 9], side = [-dir[1] * 7, dir[0] * 7];
            el('path', { d: `M ${at[0] + side[0]} ${at[1] + side[1]} L ${tip[0]} ${tip[1]} L ${at[0] - side[0]} ${at[1] - side[1]} Z`, fill: style.hot, stroke: style.plate, 'stroke-width': 1.2 }, gg);
            el('circle', { cx: at[0], cy: at[1], r: 11, fill: 'transparent', 'pointer-events': 'all' }, gg);
            el('title', {}, gg).textContent = title;
          };
          const along = [pb[0] - ra[0], pb[1] - ra[1]], al = Math.hypot(along[0], along[1]) || 1;
          const u: Screen = [along[0] / al, along[1] / al];
          grip('a', [ra[0] - u[0] * 26, ra[1] - u[1] * 26], [-u[0], -u[1]], 'Drag to lengthen or shorten');
          grip('b', [pb[0] + u[0] * 14, pb[1] + u[1] * 14], u, 'Drag to lengthen or shorten');
          grip('far', [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2], d, 'Drag the far clip');
          // flip: two opposed arrows beside the head
          const fx = ra[0] - d[0] * 30, fy = ra[1] - d[1] * 30;
          const fg = el('g', { 'data-grip': 'flip', 'data-view': a.id, style: 'pointer-events: auto; cursor: pointer' });
          el('circle', { cx: fx, cy: fy, r: 10, fill: style.plate, stroke: style.hot, 'stroke-width': 1.2 }, fg);
          for (const sgn of [1, -1]) {
            const tip = [fx + d[0] * 7 * sgn, fy + d[1] * 7 * sgn], base = [fx + d[0] * 1 * sgn, fy + d[1] * 1 * sgn], side = [-d[1] * 4, d[0] * 4];
            el('path', { d: `M ${base[0] + side[0]} ${base[1] + side[1]} L ${tip[0]} ${tip[1]} L ${base[0] - side[0]} ${base[1] - side[1]} Z`, fill: style.hot }, fg);
          }
          el('title', {}, fg).textContent = 'Flip the section';
          g.setAttribute('data-grip', 'move'); // dragging the line moves the section
        }
      }
    } else if (a.kind === 'elevation') {
      const p = project(a.at);
      if (!p) continue;
      const d = screenDir(a.at, a.look);
      const g = group(a.id);
      if (d) {
        const tip = [p[0] + d[0] * 22, p[1] + d[1] * 22], side = [-d[1] * 12, d[0] * 12];
        el('path', { d: `M ${p[0] + side[0]} ${p[1] + side[1]} L ${tip[0]} ${tip[1]} L ${p[0] - side[0]} ${p[1] - side[1]} Z`, fill: stroke }, g);
      }
      el('circle', { cx: p[0], cy: p[1], r: 12, fill: style.plate, stroke, 'stroke-width': w }, g);
      text(g, p[0], p[1], a.name.slice(0, 1).toUpperCase(), 11, ink);
      el('title', {}, g).textContent = `Elevation: ${a.name} (click to select, double-click to open)`;
    } else {
      const pa = project(a.a), rb = project(a.b);
      if (!pa || !rb) continue;
      const pb = keepInView(rb, pa, { l: 8, r: 30 + Math.max(a.name.length, a.value.length) * 7.2, t: 16, b: 16 });
      if (!pb) continue;
      const g = group(a.id);
      hitLine(g, pa, pb);
      el('line', { x1: pa[0], y1: pa[1], x2: pb[0], y2: pb[1], stroke, 'stroke-width': on ? w : 1, 'stroke-dasharray': '10 4 2 4' }, g);
      el('rect', { x: pb[0] - 1, y: pb[1] - 18, width: 22 + Math.max(a.name.length, a.value.length) * 7.2, height: 36, fill: 'transparent', 'pointer-events': 'all' }, g);
      el('circle', { cx: pb[0] + 9, cy: pb[1], r: 7, fill: style.plate, stroke, 'stroke-width': 1.2 }, g);
      el('path', { d: `M ${pb[0] + 9} ${pb[1] - 7} A 7 7 0 0 1 ${pb[0] + 16} ${pb[1]} L ${pb[0] + 9} ${pb[1]} Z M ${pb[0] + 9} ${pb[1] + 7} A 7 7 0 0 1 ${pb[0] + 2} ${pb[1]} L ${pb[0] + 9} ${pb[1]} Z`, fill: stroke }, g);
      text(g, pb[0] + 22, pb[1] - 8, a.name, 11.5, ink, 600, 'start');
      text(g, pb[0] + 22, pb[1] + 8, a.value, 11, ink, 400, 'start');
      el('title', {}, g).textContent = `Level: ${a.name} (click to select, double-click to open its plan)`;
      levelsDrawn.push({ an: a, pa });
    }
  }

  // A selected level: temporary dimensions to the levels above and below (Revit, read-only here).
  for (const { an, pa } of levelsDrawn) {
    if (!state.selected.has(an.id)) continue;
    const y = an.a[1];
    const above = levelsDrawn.filter((o) => o.an.a[1] > y + 1e-6).sort((p, q) => p.an.a[1] - q.an.a[1])[0];
    const below = levelsDrawn.filter((o) => o.an.a[1] < y - 1e-6).sort((p, q) => q.an.a[1] - p.an.a[1])[0];
    const x = pa[0] + 70;
    for (const o of [above, below]) {
      if (!o) continue;
      const s0 = project([an.a[0], y, an.a[2]]), s1 = project([an.a[0], o.an.a[1], an.a[2]]);
      if (!s0 || !s1) continue;
      const y0 = s0[1], y1 = s1[1];
      el('line', { x1: x, y1: y0, x2: x, y2: y1, stroke: style.hot, 'stroke-width': 1.2 });
      for (const yy of [y0, y1]) el('line', { x1: x - 5, y1: yy + 5, x2: x + 5, y2: yy - 5, stroke: style.hot, 'stroke-width': 1.2 });
      const label = Math.round(Math.abs(o.an.a[1] - y) * 1000).toLocaleString('en-IN');
      const my = (y0 + y1) / 2;
      el('rect', { x: x - 12 - label.length * 7, y: my - 8, width: label.length * 7 + 8, height: 16, rx: 3, fill: style.plate, 'fill-opacity': 0.92 });
      text(svg, x - 8, my, label, 11.5, style.hot, 600, 'end');
    }
  }

  // Section tool: rubber band, a reference line along the screen horizontal, the angle arc and labels.
  if (preview) {
    const { a, b } = preview;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: style.hot, 'stroke-width': 1.6, 'stroke-dasharray': '14 4 2 4' });
    el('circle', { cx: a[0], cy: a[1], r: 3.5, fill: style.hot });
    if (len > 24) {
      const r = Math.min(80, len * 0.6);
      el('line', { x1: a[0], y1: a[1], x2: a[0] + r + 20, y2: a[1], stroke: style.line, 'stroke-width': 1, 'stroke-dasharray': '4 3' });
      const t = (preview.angle * Math.PI) / 180;
      const end = [a[0] + Math.cos(t) * r, a[1] - Math.sin(t) * r];
      const large = preview.angle > 180 ? 1 : 0;
      el('path', { d: `M ${a[0] + r} ${a[1]} A ${r} ${r} 0 ${large} 0 ${end[0]} ${end[1]}`, fill: 'none', stroke: style.hot, 'stroke-width': 1.2 });
      const lt = t / 2;
      const lp = [a[0] + Math.cos(lt) * (r + 22), a[1] - Math.sin(lt) * (r + 22)];
      text(svg, lp[0], lp[1], `${preview.angle.toFixed(2)}°${preview.snapped ? '' : ''}`, 12, style.hot, preview.snapped ? 700 : 500);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const lenLabel = `${Math.round(preview.length * 1000).toLocaleString('en-IN')} mm`;
      el('rect', { x: mid[0] - lenLabel.length * 3.6 - 4, y: mid[1] - 22, width: lenLabel.length * 7.2 + 8, height: 16, rx: 3, fill: style.plate, 'fill-opacity': 0.9 });
      text(svg, mid[0], mid[1] - 14, lenLabel, 11.5, style.hot);
    }
  }
}

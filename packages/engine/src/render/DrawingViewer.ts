import {
  LineBasicMaterial,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  GLSL3,
  LineSegments,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  ShapeUtils,
  UnsignedByteType,
  Vector2,
  WebGLRenderer,
} from 'three';
import type { ParsedDrawing } from '../dxf/types';
import { wheelZoomFactor } from './cameraMath';
import { readViewerTokens, parseCssColor, type Rgba } from './cssColor';
import { resolvePalette, toCss } from './drawingColors';

export interface DrawingViewerEvents {
  /** Cursor position in real drawing coordinates (origin added back), or null when outside. */
  onCursor?: (x: number, y: number) => void;
  /** Objects picked by a click or a selection box (indices into drawing.handles); empty when nothing. */
  onSelect?: (entities: number[]) => void;
}

/** Pick box half-size in screen pixels, like AutoCAD's PICKBOX. */
const PICK_PX = 6;

const VERTEX = /* glsl */ `
in float aColor;
in float aLayer;
uniform sampler2D uPalette;
uniform sampler2D uLayers;
flat out vec3 vColor;
void main() {
  float on = texelFetch(uLayers, ivec2(int(aLayer + 0.5), 0), 0).r;
  vColor = texelFetch(uPalette, ivec2(int(aColor + 0.5), 0), 0).rgb;
  gl_Position = on < 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = /* glsl */ `
precision highp float;
flat in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }`;

const BASELINE: Record<string, CanvasTextBaseline> = { baseline: 'alphabetic', bottom: 'bottom', middle: 'middle', top: 'top' };

/**
 * 2D DXF view, AutoCAD-like: middle-drag pan, wheel zoom about the cursor, double
 * middle-click fit, Alt + left-drag pan on trackpads. Lines and fills on the GPU in
 * one draw call each; text on a 2D canvas overlay so it stays crisp at any zoom.
 * Colours follow the Shanku theme; colour 7 flips black/white like AutoCAD.
 */
export class DrawingViewer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private overlay: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private drawing: ParsedDrawing | null = null;
  private paletteTex: DataTexture | null = null;
  private layerTex: DataTexture | null = null;
  private materials: ShaderMaterial[] = [];
  private objects: Array<LineSegments | Mesh> = [];
  private screenPalette: string[] = [];
  private layerOn: boolean[] = [];
  private center = new Vector2();
  private viewHeight = 1;
  private frameRequested = false;
  private disposers: Array<() => void> = [];
  private selected: number[] = [];
  private bounds: Float32Array | null = null; // per entity: minx, miny, maxx, maxy
  private rectEl: HTMLDivElement;
  private highlight: LineSegments | null = null;
  private highlightMat = new LineBasicMaterial({ depthTest: false, transparent: true, opacity: 1 });
  private accentCss = '#D9761E';

  constructor(private container: HTMLElement, private events: DrawingViewerEvents = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    const c = this.renderer.domElement;
    Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
    c.tabIndex = 0;
    c.setAttribute('aria-label', '2D drawing view');
    this.overlay = document.createElement('canvas');
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    container.append(c, this.overlay);
    this.ctx2d = this.overlay.getContext('2d') as CanvasRenderingContext2D;
    this.rectEl = document.createElement('div');
    Object.assign(this.rectEl.style, { position: 'absolute', display: 'none', pointerEvents: 'none', borderWidth: '1px', borderStyle: 'solid' });
    container.appendChild(this.rectEl);
    this.camera.position.set(0, 0, 5);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.disposers.push(() => ro.disconnect());
    this.bindInput(c);
    const mo = new MutationObserver(() => this.applyTheme());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onMq = () => this.applyTheme();
    mq?.addEventListener('change', onMq);
    this.disposers.push(() => {
      mo.disconnect();
      mq?.removeEventListener('change', onMq);
    });
    this.resize();
  }

  setDrawing(d: ParsedDrawing): void {
    this.clear();
    this.drawing = d;
    this.layerOn = d.layers.map((l) => l.on);
    const pal = new Uint8Array(Math.max(1, d.palette.length) * 4);
    this.paletteTex = new DataTexture(pal, Math.max(1, d.palette.length), 1, RGBAFormat, UnsignedByteType);
    this.layerTex = new DataTexture(new Uint8Array(Math.max(1, d.layers.length) * 4), Math.max(1, d.layers.length), 1, RGBAFormat, UnsignedByteType);
    const mat = () => {
      const m = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uPalette: { value: this.paletteTex }, uLayers: { value: this.layerTex } },
      });
      this.materials.push(m);
      return m;
    };

    // Fills first (hatch solids, solids), then lines on top.
    if (d.polyColor.length) {
      const pos: number[] = [];
      const col: number[] = [];
      const lay: number[] = [];
      for (let i = 0; i < d.polyColor.length; i++) {
        const a = d.polyStart[i];
        const b = i + 1 < d.polyStart.length ? d.polyStart[i + 1] : d.poly.length / 2;
        const contour: Vector2[] = [];
        for (let k = a; k < b; k++) contour.push(new Vector2(d.poly[k * 2], d.poly[k * 2 + 1]));
        for (const tri of ShapeUtils.triangulateShape(contour, [])) {
          for (const v of tri) {
            pos.push(contour[v].x, contour[v].y, 0);
            col.push(d.polyColor[i]);
            lay.push(d.polyLayer[i]);
          }
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 1));
      g.setAttribute('aLayer', new BufferAttribute(new Float32Array(lay), 1));
      const mesh = new Mesh(g, mat());
      mesh.frustumCulled = false;
      this.objects.push(mesh);
    }
    const n = d.segColor.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 2);
    const lay = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = d.seg[i * 4];
      pos[i * 6 + 1] = d.seg[i * 4 + 1];
      pos[i * 6 + 3] = d.seg[i * 4 + 2];
      pos[i * 6 + 4] = d.seg[i * 4 + 3];
      col[i * 2] = col[i * 2 + 1] = d.segColor[i];
      lay[i * 2] = lay[i * 2 + 1] = d.segLayer[i];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aColor', new BufferAttribute(col, 1));
    g.setAttribute('aLayer', new BufferAttribute(lay, 1));
    const lines = new LineSegments(g, mat());
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    this.objects.push(lines);
    this.scene.add(...this.objects);
    this.syncLayers();
    this.applyTheme();
    this.fit();
  }

  /**
   * The DXF object under a screen point: nearest visible line within the pick box, else a text whose
   * box contains the point, else a filled area containing it. Returns an index into drawing.handles.
   */
  pickAt(clientX: number, clientY: number): number | null {
    const d = this.drawing;
    if (!d) return null;
    const p = this.toWorld(clientX, clientY);
    const tol = (PICK_PX * this.viewHeight) / Math.max(1, this.container.getBoundingClientRect().height);
    let best: number | null = null;
    let bestD = tol;
    const s = d.seg;
    for (let i = 0, n = d.segEnt.length; i < n; i++) {
      if (!this.layerOn[d.segLayer[i]]) continue;
      const x1 = s[i * 4], y1 = s[i * 4 + 1], x2 = s[i * 4 + 2], y2 = s[i * 4 + 3];
      if ((p.x < Math.min(x1, x2) - bestD) || (p.x > Math.max(x1, x2) + bestD) || (p.y < Math.min(y1, y2) - bestD) || (p.y > Math.max(y1, y2) + bestD)) continue;
      const dx = x2 - x1, dy = y2 - y1;
      const L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L2)) : 0;
      const dist = Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
      if (dist <= bestD) {
        bestD = dist;
        best = d.segEnt[i];
      }
    }
    if (best !== null) return best;
    for (const t of d.texts) {
      const [x, y, h, rot, , , text, , li, ent] = t;
      if (!this.layerOn[li]) continue;
      const a = (-rot * Math.PI) / 180;
      const lx = (p.x - x) * Math.cos(a) - (p.y - y) * Math.sin(a);
      const ly = (p.x - x) * Math.sin(a) + (p.y - y) * Math.cos(a);
      const w = h * 0.62 * Math.max(...text.split('\n').map((l) => l.length)); // approximate text box
      const lines = text.split('\n').length;
      if (Math.abs(lx) <= w + tol && ly >= -h * 1.4 * lines - tol && ly <= h * 1.4 + tol) return ent;
    }
    for (let i = d.polyColor.length - 1; i >= 0; i--) {
      if (!this.layerOn[d.polyLayer[i]]) continue;
      const a = d.polyStart[i], b = i + 1 < d.polyStart.length ? d.polyStart[i + 1] : d.poly.length / 2;
      let inside = false;
      for (let k = a, j = b - 1; k < b; j = k++) {
        const xi = d.poly[k * 2], yi = d.poly[k * 2 + 1], xj = d.poly[j * 2], yj = d.poly[j * 2 + 1];
        if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return d.polyEnt[i];
    }
    return null;
  }

  /** Bounding box per entity, for box selection. */
  private entityBounds(): Float32Array {
    const d = this.drawing!;
    if (this.bounds) return this.bounds;
    const n = d.handles.length;
    const b = new Float32Array(n * 4).fill(0);
    const seen = new Uint8Array(n);
    const add = (e: number, x: number, y: number) => {
      const o = e * 4;
      if (!seen[e]) {
        seen[e] = 1;
        b[o] = b[o + 2] = x;
        b[o + 1] = b[o + 3] = y;
        return;
      }
      b[o] = Math.min(b[o], x);
      b[o + 1] = Math.min(b[o + 1], y);
      b[o + 2] = Math.max(b[o + 2], x);
      b[o + 3] = Math.max(b[o + 3], y);
    };
    for (let i = 0; i < d.segEnt.length; i++) {
      add(d.segEnt[i], d.seg[i * 4], d.seg[i * 4 + 1]);
      add(d.segEnt[i], d.seg[i * 4 + 2], d.seg[i * 4 + 3]);
    }
    for (let i = 0; i < d.polyColor.length; i++) {
      const a = d.polyStart[i], e = i + 1 < d.polyStart.length ? d.polyStart[i + 1] : d.poly.length / 2;
      for (let k = a; k < e; k++) add(d.polyEnt[i], d.poly[k * 2], d.poly[k * 2 + 1]);
    }
    for (const t of d.texts) add(t[9], t[0], t[1]);
    this.bounds = b;
    return b;
  }

  /**
   * Objects in a screen rectangle. Dragging right (window) takes objects fully inside; dragging left
   * (crossing) takes anything it touches — the AutoCAD convention.
   */
  selectInRect(x0: number, y0: number, x1: number, y1: number, crossing: boolean): number[] {
    const d = this.drawing;
    if (!d) return [];
    const a = this.toWorld(Math.min(x0, x1), Math.max(y0, y1));
    const b = this.toWorld(Math.max(x0, x1), Math.min(y0, y1));
    const bb = this.entityBounds();
    const out: number[] = [];
    const layerOf = new Int32Array(d.handles.length).fill(-1);
    for (let i = 0; i < d.segEnt.length; i++) if (layerOf[d.segEnt[i]] < 0) layerOf[d.segEnt[i]] = d.segLayer[i];
    for (const t of d.texts) if (layerOf[t[9]] < 0) layerOf[t[9]] = t[8];
    for (let e = 0; e < d.handles.length; e++) {
      const o = e * 4;
      if (bb[o] === 0 && bb[o + 2] === 0 && bb[o + 1] === 0 && bb[o + 3] === 0) continue; // nothing drawn
      const lay = layerOf[e];
      if (lay >= 0 && !this.layerOn[lay]) continue;
      const inside = bb[o] >= a.x && bb[o + 1] >= a.y && bb[o + 2] <= b.x && bb[o + 3] <= b.y;
      const touches = bb[o] <= b.x && bb[o + 2] >= a.x && bb[o + 1] <= b.y && bb[o + 3] >= a.y;
      if (crossing ? touches : inside) out.push(e);
    }
    return out;
  }

  /** Highlights one DXF object (its lines in the accent colour, its text in the accent colour). */
  select(entities: number[] | number | null): void {
    this.selected = entities === null ? [] : typeof entities === 'number' ? [entities] : [...entities];
    const set = new Set(this.selected);
    this.highlight?.removeFromParent();
    this.highlight?.geometry.dispose();
    this.highlight = null;
    const d = this.drawing;
    if (d && set.size) {
      const pts: number[] = [];
      for (let i = 0, n = d.segEnt.length; i < n; i++) {
        if (!set.has(d.segEnt[i])) continue;
        pts.push(d.seg[i * 4], d.seg[i * 4 + 1], 0.5, d.seg[i * 4 + 2], d.seg[i * 4 + 3], 0.5);
      }
      for (let i = 0; i < d.polyColor.length; i++) {
        if (!set.has(d.polyEnt[i])) continue;
        const a = d.polyStart[i], b = i + 1 < d.polyStart.length ? d.polyStart[i + 1] : d.poly.length / 2;
        for (let k = a; k < b; k++) {
          const j = k + 1 < b ? k + 1 : a;
          pts.push(d.poly[k * 2], d.poly[k * 2 + 1], 0.5, d.poly[j * 2], d.poly[j * 2 + 1], 0.5);
        }
      }
      if (pts.length) {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
        this.highlight = new LineSegments(g, this.highlightMat);
        this.highlight.renderOrder = 5;
        this.highlight.frustumCulled = false;
        this.scene.add(this.highlight);
      }
    }
    this.requestRender();
  }

  /** Layer visibility by layer index. */
  setLayerVisibility(on: readonly boolean[]): void {
    this.layerOn = [...on];
    this.syncLayers();
  }

  private syncLayers(): void {
    if (!this.layerTex) return;
    const data = this.layerTex.image.data as Uint8Array;
    this.layerOn.forEach((v, i) => (data[i * 4] = v ? 255 : 0));
    this.layerTex.needsUpdate = true;
    this.requestRender();
  }

  /** Revit/AutoCAD zoom extents. */
  fit(): void {
    const d = this.drawing;
    if (!d) return;
    const [x0, y0, x1, y1] = d.info.extents;
    this.center.set((x0 + x1) / 2, (y0 + y1) / 2);
    const aspect = this.aspect();
    this.viewHeight = Math.max((y1 - y0) || 1, ((x1 - x0) || 1) / aspect) * 1.06;
    this.updateCamera();
  }

  /** Zooms to a rectangle in real drawing coordinates (as in the DXF), with a margin. */
  zoomTo(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.drawing;
    if (!d) return;
    const [ox, oy] = d.info.origin;
    this.center.set((x0 + x1) / 2 - ox, (y0 + y1) / 2 - oy);
    const w = Math.max(Math.abs(x1 - x0), 1), h = Math.max(Math.abs(y1 - y0), 1);
    this.viewHeight = Math.max(h, w / this.aspect()) * 1.6;
    this.updateCamera();
  }

  private aspect(): number {
    const r = this.container.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }

  private updateCamera(): void {
    const aspect = this.aspect();
    const h = this.viewHeight / 2;
    Object.assign(this.camera, { left: -h * aspect, right: h * aspect, top: h, bottom: -h });
    this.camera.position.set(this.center.x, this.center.y, 5);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    const dpr = this.renderer.getPixelRatio();
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
    this.updateCamera();
  }

  /** Client pixel -> drawing (rebased) coordinates. */
  private toWorld(clientX: number, clientY: number): Vector2 {
    const r = this.container.getBoundingClientRect();
    const k = this.viewHeight / Math.max(1, r.height);
    return new Vector2(this.center.x + (clientX - r.left - r.width / 2) * k, this.center.y - (clientY - r.top - r.height / 2) * k);
  }

  /** Rubber band: window (blue, solid) dragging right, crossing (green, dashed) dragging left. */
  private drawRect(x0: number, y0: number, x1: number, y1: number, crossing: boolean): void {
    const r = this.container.getBoundingClientRect();
    Object.assign(this.rectEl.style, {
      display: 'block',
      left: `${Math.min(x0, x1) - r.left}px`,
      top: `${Math.min(y0, y1) - r.top}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
      borderStyle: crossing ? 'dashed' : 'solid',
      borderColor: crossing ? 'var(--select-crossing, #1F9E89)' : 'var(--select-window, #2F7FD8)',
      background: crossing ? 'color-mix(in srgb, var(--select-crossing, #1F9E89) 12%, transparent)' : 'color-mix(in srgb, var(--select-window, #2F7FD8) 12%, transparent)',
    });
  }

  private bindInput(c: HTMLCanvasElement): void {
    let drag: { x: number; y: number } | null = null;
    let lastMiddle = 0;
    let click: { x: number; y: number; box: boolean } | null = null;
    const down = (e: PointerEvent) => {
      c.focus({ preventScroll: true });
      click = e.button === 0 && !e.altKey ? { x: e.clientX, y: e.clientY, box: false } : null;
      const pan = e.button === 1 || (e.button === 0 && e.altKey);
      if (e.button === 1) {
        const t = performance.now();
        if (t - lastMiddle < 300) {
          this.fit();
          lastMiddle = 0;
          e.preventDefault();
          return;
        }
        lastMiddle = t;
      }
      if (!pan) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (this.drawing && this.events.onCursor) {
        const w = this.toWorld(e.clientX, e.clientY);
        this.events.onCursor(w.x + this.drawing.info.origin[0], w.y + this.drawing.info.origin[1]);
      }
      if (click && !drag) {
        if (!click.box && Math.hypot(e.clientX - click.x, e.clientY - click.y) < 4) return;
        click.box = true;
        this.drawRect(click.x, click.y, e.clientX, e.clientY, e.clientX < click.x);
        return;
      }
      if (!drag) return;
      const k = this.viewHeight / Math.max(1, this.container.getBoundingClientRect().height);
      this.center.x -= (e.clientX - drag.x) * k;
      this.center.y += (e.clientY - drag.y) * k;
      drag = { x: e.clientX, y: e.clientY };
      this.updateCamera();
    };
    const up = (e: PointerEvent) => {
      if (click && e.button === 0) {
        this.rectEl.style.display = 'none';
        if (click.box) {
          const hits = this.selectInRect(click.x, click.y, e.clientX, e.clientY, e.clientX < click.x);
          this.select(hits);
          this.events.onSelect?.(hits);
        } else {
          const hit = this.pickAt(e.clientX, e.clientY);
          this.select(hit);
          this.events.onSelect?.(hit === null ? [] : [hit]);
        }
      }
      click = null;
      drag = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const before = this.toWorld(e.clientX, e.clientY);
      this.viewHeight = Math.min(1e9, Math.max(1e-3, this.viewHeight / wheelZoomFactor(e.deltaY, e.deltaMode)));
      const after = this.toWorld(e.clientX, e.clientY);
      this.center.add(before.sub(after));
      this.updateCamera();
    };
    const noMenu = (e: Event) => e.preventDefault();
    const noAuto = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', noMenu);
    c.addEventListener('mousedown', noAuto);
    this.disposers.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', noMenu);
      c.removeEventListener('mousedown', noAuto);
    });
  }

  /** Re-reads the theme from the container (used when the canvas theme changes). */
  refreshTheme(): void {
    this.applyTheme();
  }

  applyTheme(): void {
    if (!this.drawing || !this.paletteTex) return this.requestRender();
    const t = readViewerTokens(this.container);
    const fg = parseCssColor(getComputedStyle(this.container).getPropertyValue('--text')) ?? ({ r: 0.09, g: 0.1, b: 0.12, a: 1 } as Rgba);
    const colors = resolvePalette(this.drawing.palette, t.viewport, fg);
    const data = this.paletteTex.image.data as Uint8Array;
    colors.forEach((c, i) => {
      data[i * 4] = Math.round(c.r * 255);
      data[i * 4 + 1] = Math.round(c.g * 255);
      data[i * 4 + 2] = Math.round(c.b * 255);
      data[i * 4 + 3] = 255;
    });
    this.paletteTex.needsUpdate = true;
    this.screenPalette = colors.map(toCss);
    this.accentCss = getComputedStyle(this.container).getPropertyValue('--accent').trim() || '#D9761E';
    this.highlightMat.color.set(this.accentCss);
    this.requestRender();
  }

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderer.render(this.scene, this.camera);
      this.drawText();
    });
  }

  private drawText(): void {
    const ctx = this.ctx2d;
    const W = this.overlay.width;
    const H = this.overlay.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = this.drawing;
    if (!d) return;
    const pxPerUnit = H / this.viewHeight;
    const halfW = W / pxPerUnit / 2;
    const halfH = this.viewHeight / 2;
    const font = getComputedStyle(this.container).getPropertyValue('--font-sans') || 'sans-serif';
    for (const [x, y, h, rot, ah, av, text, ci, li, ent] of d.texts) {
      if (!this.layerOn[li]) continue;
      const px = h * pxPerUnit;
      if (px < 2.5) continue; // too small to read, like AutoCAD's text frames at low zoom
      const margin = h * Math.max(8, text.length);
      if (x < this.center.x - halfW - margin || x > this.center.x + halfW + margin || y < this.center.y - halfH - margin || y > this.center.y + halfH + margin) continue;
      const sx = (x - this.center.x) * pxPerUnit + W / 2;
      const sy = H / 2 - (y - this.center.y) * pxPerUnit;
      ctx.setTransform(1, 0, 0, 1, sx, sy);
      if (rot) ctx.rotate((-rot * Math.PI) / 180);
      ctx.font = `${px}px ${font}`;
      ctx.fillStyle = this.selected.includes(ent) ? this.accentCss : this.screenPalette[ci] ?? 'currentColor';
      ctx.textAlign = ah;
      const lines = text.split('\n');
      ctx.textBaseline = BASELINE[av] ?? 'alphabetic';
      const lh = px * 1.4;
      const first = av === 'bottom' ? -(lines.length - 1) * lh : av === 'middle' ? (-(lines.length - 1) * lh) / 2 : 0;
      lines.forEach((ln, i) => ctx.fillText(ln, 0, first + i * lh));
    }
  }

  private clear(): void {
    this.highlight?.removeFromParent();
    this.highlight?.geometry.dispose();
    this.highlight = null;
    this.selected = [];
    this.bounds = null;
    for (const o of this.objects) {
      o.removeFromParent();
      o.geometry.dispose();
    }
    this.objects = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.paletteTex?.dispose();
    this.layerTex?.dispose();
    this.paletteTex = this.layerTex = null;
    this.drawing = null;
  }

  dispose(): void {
    for (const f of this.disposers) f();
    this.clear();
    this.rectEl.remove();
    this.highlightMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}


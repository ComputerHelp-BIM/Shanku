import {
  LineBasicMaterial,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  GLSL3,
  LineSegments,
  Mesh,
  OrthographicCamera,
  RedFormat,
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
import { tempDims, type Dim2 } from './tempDims';
import { cursorsFor, isDarkColor, modifierCursor, type CursorSet } from './cursors';
import { gridLevels, gridValues } from './drawingGrid';

/** AutoCAD's crosshair: off (the pointer arrow), small (CURSORSIZE 5) or full screen (CURSORSIZE 100). */
export type CrosshairSize = 'off' | 'small' | 'full';

/** Drafting aids drawn over the drawing, like AutoCAD's status-bar toggles. */
export interface DrawingDisplay {
  /** Adaptive grid with the red X and green Y axes through the origin (GRIDMODE, F7). */
  grid: boolean;
  /** UCS icon at the origin, or in the lower-left corner when the origin is off screen (UCSICON). */
  ucsIcon: boolean;
  crosshair: CrosshairSize;
}

export const DEFAULT_DRAWING_DISPLAY: DrawingDisplay = { grid: true, ucsIcon: true, crosshair: 'small' };

/**
 * Transparent view tools, as on AutoCAD's right-click menu: realtime Pan (left-drag pans),
 * realtime Zoom (drag up to zoom in) and Zoom Window (drag a rectangle). Esc, Enter or a
 * right-click ends the tool.
 */
export type DrawingTool = 'pan' | 'zoom' | 'zoomWindow';

export interface DrawingViewerEvents {
  /** Cursor position in real drawing coordinates (origin added back), or null when outside. */
  onCursor?: (x: number, y: number) => void;
  /** Objects picked by a click or a selection box (indices into drawing.handles); empty when nothing. */
  onSelect?: (entities: number[]) => void;
  /** Object under the pointer (for tooltips), checked once per frame while the pointer moves. */
  onHover?: (entity: number | null, clientX: number, clientY: number) => void;
  /** Right-click (when no tool is running), for the AutoCAD-style shortcut menu. */
  onContextMenu?: (clientX: number, clientY: number) => void;
  /** A transparent tool (Pan, Zoom, Zoom Window) finished or was cancelled. */
  onToolEnd?: () => void;
}

/** Entity visibility texture width: entity e lives at (e % width, e / width). */
const ENT_TEX_W = 2048;

/** Pick box half-size in screen pixels, like AutoCAD's PICKBOX. */
const PICK_PX = 6;

const VERTEX = /* glsl */ `
in float aColor;
in float aLayer;
in float aEnt;
uniform sampler2D uPalette;
uniform sampler2D uLayers;
uniform sampler2D uEnts;
flat out vec3 vColor;
void main() {
  float on = texelFetch(uLayers, ivec2(int(aLayer + 0.5), 0), 0).r;
  int e = int(aEnt + 0.5);
  float hidden = texelFetch(uEnts, ivec2(e % ${ENT_TEX_W}, e / ${ENT_TEX_W}), 0).r;
  vColor = texelFetch(uPalette, ivec2(int(aColor + 0.5), 0), 0).rgb;
  gl_Position = on < 0.5 || hidden > 0.5 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
  /** Per entity: 255 = hidden by Isolate / Hide Objects. */
  private entTex: DataTexture | null = null;
  private hiddenMask: Uint8Array | null = null;
  /** Grid behind the drawing, crosshair in front; both redrawn on their own so moving the pointer stays cheap. */
  private gridCanvas: HTMLCanvasElement;
  private gridCtx: CanvasRenderingContext2D;
  private cursorCanvas: HTMLCanvasElement;
  private cursorCtx: CanvasRenderingContext2D;
  private display: DrawingDisplay = { ...DEFAULT_DRAWING_DISPLAY };
  private gridColors = { minor: { r: 0, g: 0, b: 0, a: 0.06 } as Rgba, major: { r: 0, g: 0, b: 0, a: 0.16 } as Rgba, x: '#C62828', y: '#2E7D32', fg: '#17191E' };
  private tool: DrawingTool | null = null;
  /** Pointer position in container pixels while it is over the view, for the crosshair. */
  private pointer: { x: number; y: number } | null = null;
  private mods = { add: false, remove: false };
  private panning = false;
  private cursorRequested = false;
  /** Zoom Previous: earlier views, newest last. */
  private viewStack: Array<{ x: number; y: number; h: number }> = [];
  private lastViewPush = 0;  private materials: ShaderMaterial[] = [];
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
  private dimCss = '#2F7FD8';
  private plateCss = '#FFFFFF';
  /** Cursors drawn for the canvas: dark on Paper, light on Ink. */
  private cur: CursorSet = cursorsFor(false);
  /** Selected geometry for the overlay: segments per selected entity, and temporary dimensions. */
  private selSegs: Array<Array<[number, number, number, number]>> = [];
  private dims: Dim2[] = [];

  constructor(private container: HTMLElement, private events: DrawingViewerEvents = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    const c = this.renderer.domElement;
    Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', touchAction: 'none' });
    c.tabIndex = 0;
    c.setAttribute('aria-label', '2D drawing view');
    const layer = () => {
      const el = document.createElement('canvas');
      Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      el.setAttribute('aria-hidden', 'true');
      return el;
    };
    this.gridCanvas = layer();
    this.overlay = layer();
    this.cursorCanvas = layer();
    // Grid under the (transparent) WebGL canvas, text above it, crosshair on top.
    container.append(this.gridCanvas, c, this.overlay, this.cursorCanvas);
    this.gridCtx = this.gridCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.ctx2d = this.overlay.getContext('2d') as CanvasRenderingContext2D;
    this.cursorCtx = this.cursorCanvas.getContext('2d') as CanvasRenderingContext2D;
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
    const rows = Math.max(1, Math.ceil(d.handles.length / ENT_TEX_W));
    this.entTex = new DataTexture(new Uint8Array(ENT_TEX_W * rows), ENT_TEX_W, rows, RedFormat, UnsignedByteType);
    this.entTex.needsUpdate = true;
    this.hiddenMask = null;
    this.viewStack = [];    const mat = () => {
      const m = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uPalette: { value: this.paletteTex }, uLayers: { value: this.layerTex }, uEnts: { value: this.entTex } },
      });
      this.materials.push(m);
      return m;
    };

    // Fills first (hatch solids, solids), then lines on top.
    if (d.polyColor.length) {
      const pos: number[] = [];
      const col: number[] = [];
      const lay: number[] = [];
      const ent: number[] = [];
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
            ent.push(d.polyEnt[i]);
          }
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aColor', new BufferAttribute(new Float32Array(col), 1));
      g.setAttribute('aLayer', new BufferAttribute(new Float32Array(lay), 1));
      g.setAttribute('aEnt', new BufferAttribute(new Float32Array(ent), 1));
      const mesh = new Mesh(g, mat());
      mesh.frustumCulled = false;
      this.objects.push(mesh);
    }
    const n = d.segColor.length;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 2);
    const lay = new Float32Array(n * 2);
    const ent = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 6] = d.seg[i * 4];
      pos[i * 6 + 1] = d.seg[i * 4 + 1];
      pos[i * 6 + 3] = d.seg[i * 4 + 2];
      pos[i * 6 + 4] = d.seg[i * 4 + 3];
      col[i * 2] = col[i * 2 + 1] = d.segColor[i];
      lay[i * 2] = lay[i * 2 + 1] = d.segLayer[i];
      ent[i * 2] = ent[i * 2 + 1] = d.segEnt[i];
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aColor', new BufferAttribute(col, 1));
    g.setAttribute('aLayer', new BufferAttribute(lay, 1));
    g.setAttribute('aEnt', new BufferAttribute(ent, 1));
    const lines = new LineSegments(g, mat());
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    this.objects.push(lines);
    this.scene.add(...this.objects);
    this.syncLayers();
    this.applyTheme();
    this.fit();
    this.viewStack = []; // the first view is not a "previous" one
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
      if (!this.layerOn[d.segLayer[i]] || this.isHidden(d.segEnt[i])) continue;
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
      if (!this.layerOn[li] || this.isHidden(ent)) continue;
      const a = (-rot * Math.PI) / 180;
      const lx = (p.x - x) * Math.cos(a) - (p.y - y) * Math.sin(a);
      const ly = (p.x - x) * Math.sin(a) + (p.y - y) * Math.cos(a);
      const w = h * 0.62 * Math.max(...text.split('\n').map((l) => l.length)); // approximate text box
      const lines = text.split('\n').length;
      if (Math.abs(lx) <= w + tol && ly >= -h * 1.4 * lines - tol && ly <= h * 1.4 + tol) return ent;
    }
    for (let i = d.polyColor.length - 1; i >= 0; i--) {
      if (!this.layerOn[d.polyLayer[i]] || this.isHidden(d.polyEnt[i])) continue;
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
    for (const t of d.texts) {
      add(t[9], t[0], t[1]);
      const w = t[2] * 0.62 * Math.max(...t[6].split('\n').map((l) => l.length)); // approximate, unrotated
      add(t[9], t[0] + w, t[1] + t[2]);
    }
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
      if (this.isHidden(e)) continue;
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
    this.collectSelection(set);
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

  /** Gathers the selected objects' segments and works out temporary dimensions (Revit / AutoCAD style). */
  private collectSelection(set: Set<number>): void {
    const d = this.drawing;
    this.selSegs = [];
    this.dims = [];
    if (!d || !set.size) return;
    const per = new Map<number, Array<[number, number, number, number]>>();
    for (let i = 0; i < d.segEnt.length; i++) {
      const e = d.segEnt[i];
      if (!set.has(e)) continue;
      let list = per.get(e);
      if (!list) per.set(e, (list = []));
      if (list.length < 20000) list.push([d.seg[i * 4], d.seg[i * 4 + 1], d.seg[i * 4 + 2], d.seg[i * 4 + 3]]);
    }
    this.selSegs = [...per.values()];
    if (this.selSegs.length > 2) return;
    const reach = Math.max(this.viewHeight, 1) * 1.5; // look for neighbours within about a screen and a half
    this.dims = tempDims(
      this.selSegs,
      (visit) => {
        for (let i = 0, n = d.segEnt.length; i < n; i++) {
          if (set.has(d.segEnt[i]) || !this.layerOn[d.segLayer[i]] || this.isHidden(d.segEnt[i])) continue;
          visit([d.seg[i * 4], d.seg[i * 4 + 1], d.seg[i * 4 + 2], d.seg[i * 4 + 3]]);
        }
      },
      reach,
    );
  }

  /** Thick highlight, AutoCAD grips and temporary dimensions, drawn on the overlay. */
  private drawSelection(ctx: CanvasRenderingContext2D, W: number, H: number, pxPerUnit: number): void {
    if (!this.selSegs.length) return;
    const dpr = this.renderer.getPixelRatio();
    const sx = (x: number) => (x - this.center.x) * pxPerUnit + W / 2;
    const sy = (y: number) => H / 2 - (y - this.center.y) * pxPerUnit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 1. highlight
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.accentCss;
    ctx.beginPath();
    for (const segs of this.selSegs) for (const s of segs) {
      ctx.moveTo(sx(s[0]), sy(s[1]));
      ctx.lineTo(sx(s[2]), sy(s[3]));
    }
    ctx.stroke();
    // 2. grips: vertices, and midpoints of straight objects with few segments
    const grips = new Map<string, [number, number]>();
    for (const segs of this.selSegs) {
      const few = segs.length <= 12;
      for (const s of segs) {
        if (grips.size > 400) break;
        for (const [x, y] of few ? [[s[0], s[1]], [s[2], s[3]], [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2]] : [[s[0], s[1]]]) {
          grips.set(`${Math.round(x * 100)},${Math.round(y * 100)}`, [x, y]);
        }
      }
      if (!few) break;
    }
    const g = 7 * dpr;
    ctx.lineWidth = 1 * dpr;
    for (const [x, y] of grips.values()) {
      ctx.fillStyle = this.dimCss;
      ctx.strokeStyle = this.plateCss;
      ctx.fillRect(sx(x) - g / 2, sy(y) - g / 2, g, g);
      ctx.strokeRect(sx(x) - g / 2, sy(y) - g / 2, g, g);
    }
    // 3. temporary dimensions
    ctx.strokeStyle = this.dimCss;
    ctx.fillStyle = this.dimCss;
    ctx.lineWidth = 1 * dpr;
    ctx.font = `600 ${12 * dpr}px ${getComputedStyle(this.container).getPropertyValue('--font-sans') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const dm of this.dims) {
      const off = (dm.kind === 'size' ? 22 : 0) * dpr;
      const ox = dm.offset[0] * off, oy = -dm.offset[1] * off;
      const ax = sx(dm.a[0]), ay = sy(dm.a[1]), bx = sx(dm.b[0]), by = sy(dm.b[1]);
      const a2 = [ax + ox, ay + oy], b2 = [bx + ox, by + oy];
      if (Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) < 12 * dpr) continue; // too small to read at this zoom
      ctx.beginPath();
      if (off) {
        ctx.moveTo(ax, ay);
        ctx.lineTo(a2[0], a2[1]);
        ctx.moveTo(bx, by);
        ctx.lineTo(b2[0], b2[1]);
      }
      ctx.moveTo(a2[0], a2[1]);
      ctx.lineTo(b2[0], b2[1]);
      // architectural ticks at both ends
      const ang = Math.atan2(b2[1] - a2[1], b2[0] - a2[0]);
      for (const p of [a2, b2]) {
        const t = 5 * dpr;
        ctx.moveTo(p[0] - Math.cos(ang + Math.PI / 4) * t, p[1] - Math.sin(ang + Math.PI / 4) * t);
        ctx.lineTo(p[0] + Math.cos(ang + Math.PI / 4) * t, p[1] + Math.sin(ang + Math.PI / 4) * t);
      }
      ctx.stroke();
      // label, kept upright
      const mx = (a2[0] + b2[0]) / 2, my = (a2[1] + b2[1]) / 2;
      let r = ang;
      if (r > Math.PI / 2) r -= Math.PI;
      if (r < -Math.PI / 2) r += Math.PI;
      const label = Math.round(dm.value).toLocaleString('en-IN');
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(r);
      const w = ctx.measureText(label).width + 8 * dpr;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = this.plateCss;
      ctx.fillRect(-w / 2, -16 * dpr, w, 15 * dpr);
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.dimCss;
      ctx.fillText(label, 0, -3 * dpr);
      ctx.restore();
    }
  }

  /** Layer visibility by layer index. */
  setLayerVisibility(on: readonly boolean[]): void {
    this.layerOn = [...on];
    this.syncLayers();
  }

  /**
   * Isolate / Hide Objects (AutoCAD ISOLATEOBJECTS, HIDEOBJECTS): a non-zero mask[e] hides entity e;
   * null shows everything again (End Object Isolation). Hidden objects cannot be picked or box-selected.
   */
  setHiddenObjects(mask: Uint8Array | null): void {
    this.hiddenMask = mask && mask.some((v) => v !== 0) ? mask : null;
    if (this.entTex) {
      const data = this.entTex.image.data as Uint8Array;
      data.fill(0);
      const m = this.hiddenMask;
      if (m) for (let e = 0, n = Math.min(m.length, data.length); e < n; e++) if (m[e]) data[e] = 255;
      this.entTex.needsUpdate = true;
    }
    this.select(this.selected); // temporary dimensions measure to what is still visible
  }

  private isHidden(e: number): boolean {
    return !!this.hiddenMask && this.hiddenMask[e] !== 0;
  }

  /** Grid, UCS icon and crosshair (AutoCAD's status-bar toggles). */
  setDisplay(patch: Partial<DrawingDisplay>): void {
    this.display = { ...this.display, ...patch };
    this.syncCursorStyle();
    this.requestRender();
    this.requestCursor();
  }

  get displaySettings(): DrawingDisplay {
    return { ...this.display };
  }

  /** Starts a transparent view tool (Pan, Zoom, Zoom Window), or ends the running one with null. */
  setTool(tool: DrawingTool | null): void {
    if (this.tool === tool) return;
    const had = this.tool !== null;
    this.tool = tool;
    this.rectEl.style.display = 'none';
    this.syncCursorStyle();
    this.requestCursor();
    if (had && !tool) this.events.onToolEnd?.();
  }

  get activeTool(): DrawingTool | null {
    return this.tool;
  }

  /**
   * Remembers the current view for Zoom Previous. A gesture (wheel ticks) counts once until the
   * view has been still for a moment; discrete changes (fit, zoom window, pan drag) always count.
   */
  private pushView(gesture = false): void {
    const now = performance.now();
    const quiet = now - this.lastViewPush > 800;
    this.lastViewPush = now;
    if (gesture && !quiet) return;
    const v = { x: this.center.x, y: this.center.y, h: this.viewHeight };
    const top = this.viewStack[this.viewStack.length - 1];
    if (top && top.x === v.x && top.y === v.y && top.h === v.h) return;
    this.viewStack.push(v);
    if (this.viewStack.length > 50) this.viewStack.shift();
  }

  /** Zoom Previous (ZP): back to the view before the last pan or zoom. False when there is none. */
  previousView(): boolean {
    const v = this.viewStack.pop();
    if (!v) return false;
    this.center.set(v.x, v.y);
    this.viewHeight = v.h;
    this.updateCamera();
    return true;
  }

  get canPrevious(): boolean {
    return this.viewStack.length > 0;
  }

  /** Real drawing coordinates (as in the DXF) under a client point, or null without a drawing. */
  worldAt(clientX: number, clientY: number): [number, number] | null {
    const d = this.drawing;
    if (!d) return null;
    const w = this.toWorld(clientX, clientY);
    return [w.x + d.info.origin[0], w.y + d.info.origin[1]];
  }

  /** Zooms to the visible objects in the list (Find, Zoom to selection). False when none of them is drawn. */
  zoomToObjects(entities: readonly number[]): boolean {
    const d = this.drawing;
    if (!d || !entities.length) return false;
    const bb = this.entityBounds();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of entities) {
      const o = e * 4;
      if (o + 3 >= bb.length || this.isHidden(e)) continue;
      if (bb[o] === 0 && bb[o + 1] === 0 && bb[o + 2] === 0 && bb[o + 3] === 0) continue; // nothing drawn
      x0 = Math.min(x0, bb[o]);
      y0 = Math.min(y0, bb[o + 1]);
      x1 = Math.max(x1, bb[o + 2]);
      y1 = Math.max(y1, bb[o + 3]);
    }
    if (!Number.isFinite(x0)) return false;
    // A point or a single text still gets its surroundings (about a twelfth of the drawing).
    const [, , ex, ey] = d.info.extents;
    const min = Math.max(1, 0.08 * Math.max(ex, ey));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const w = Math.max(x1 - x0, min) / 2, h = Math.max(y1 - y0, min) / 2;
    const [ox, oy] = d.info.origin;
    this.zoomTo(cx - w + ox, cy - h + oy, cx + w + ox, cy + h + oy);
    return true;
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
    this.pushView();
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
    this.pushView();
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
    for (const el of [this.gridCanvas, this.overlay, this.cursorCanvas]) {
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
    }
    this.requestCursor();
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
    let zoomDrag: { y: number; h: number } | null = null;
    let lastMiddle = 0;
    let click: { x: number; y: number; box: boolean } | null = null;
    const down = (e: PointerEvent) => {
      c.focus({ preventScroll: true });
      const left = e.button === 0 && !e.altKey;
      if (left && this.tool === 'zoom') {
        // Realtime Zoom: drag up to zoom in, down to zoom out, about the middle of the view.
        e.preventDefault();
        c.setPointerCapture(e.pointerId);
        this.pushView();
        zoomDrag = { y: e.clientY, h: this.viewHeight };
        return;
      }
      click = left && this.tool !== 'pan' ? { x: e.clientX, y: e.clientY, box: false } : null;
      const pan = e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && this.tool === 'pan');
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
      this.pushView();
      drag = { x: e.clientX, y: e.clientY };
      this.panning = true;
      this.syncCursorStyle();
      this.requestCursor();
    };
    let hoverQueued = false;
    let lastHoverEv: PointerEvent | null = null;
    let lastHit: number | null = null;
    const move = (e: PointerEvent) => {
      const r = this.container.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.requestCursor();
      if (!drag && !click && !zoomDrag && !this.tool && this.events.onHover) {
        lastHoverEv = e;
        if (!hoverQueued) {
          hoverQueued = true;
          requestAnimationFrame(() => {
            hoverQueued = false;
            if (!lastHoverEv) return;
            const hit = this.pickAt(lastHoverEv.clientX, lastHoverEv.clientY);
            if (hit !== lastHit || hit !== null) this.events.onHover?.(hit, lastHoverEv.clientX, lastHoverEv.clientY);
            lastHit = hit;
          });
        }
      }
      if (this.drawing && this.events.onCursor) {
        const w = this.toWorld(e.clientX, e.clientY);
        this.events.onCursor(w.x + this.drawing.info.origin[0], w.y + this.drawing.info.origin[1]);
      }
      if (zoomDrag) {
        this.viewHeight = Math.min(1e9, Math.max(1e-3, zoomDrag.h * Math.exp((e.clientY - zoomDrag.y) / 200)));
        this.updateCamera();
        return;
      }
      if (click && !drag) {
        if (!click.box && Math.hypot(e.clientX - click.x, e.clientY - click.y) < 4) return;
        click.box = true;
        this.drawRect(click.x, click.y, e.clientX, e.clientY, this.tool !== 'zoomWindow' && e.clientX < click.x);
        return;
      }
      if (!drag) return;
      const k = this.viewHeight / Math.max(1, r.height);
      this.center.x -= (e.clientX - drag.x) * k;
      this.center.y += (e.clientY - drag.y) * k;
      drag = { x: e.clientX, y: e.clientY };
      this.updateCamera();
    };
    const up = (e: PointerEvent) => {
      if (click && e.button === 0) {
        this.rectEl.style.display = 'none';
        if (this.tool === 'zoomWindow') {
          if (click.box) this.zoomWindow(click.x, click.y, e.clientX, e.clientY);
          this.setTool(null);
        } else {
          const hits = click.box ? this.selectInRect(click.x, click.y, e.clientX, e.clientY, e.clientX < click.x) : [this.pickAt(e.clientX, e.clientY)].filter((h): h is number => h !== null);
          // AutoCAD / Revit: Ctrl adds to the selection, Shift removes from it, otherwise replace.
          const next = e.ctrlKey || e.metaKey ? [...new Set([...this.selected, ...hits])] : e.shiftKey ? this.selected.filter((x) => !hits.includes(x)) : hits;
          this.select(next);
          this.events.onSelect?.(next);
        }
      }
      click = null;
      drag = null;
      zoomDrag = null;
      this.panning = false;
      this.syncCursorStyle(e);
      this.requestCursor();
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.pushView(true);
      const before = this.toWorld(e.clientX, e.clientY);
      this.viewHeight = Math.min(1e9, Math.max(1e-3, this.viewHeight / wheelZoomFactor(e.deltaY, e.deltaMode)));
      const after = this.toWorld(e.clientX, e.clientY);
      this.center.add(before.sub(after));
      this.updateCamera();
    };
    // Right-click ends a running tool (AutoCAD's Enter), otherwise opens the shortcut menu.
    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (this.tool) return this.setTool(null);
      this.events.onContextMenu?.(e.clientX, e.clientY);
    };
    const noAuto = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    let over = false;
    const onKeyMod = (e: KeyboardEvent) => {
      if (over && !drag && (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta')) {
        this.syncCursorStyle(e);
        this.requestCursor();
      }
    };
    // Esc or Enter ends a tool before the app sees it, so the first Esc does not also clear the selection.
    const onToolKey = (e: KeyboardEvent) => {
      if (!this.tool || (e.key !== 'Escape' && e.key !== 'Enter')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.setTool(null);
    };
    const onEnter = () => (over = true);
    const onOut = () => {
      over = false;
      this.pointer = null;
      this.requestCursor();
    };
    window.addEventListener('keydown', onToolKey, true);
    window.addEventListener('keydown', onKeyMod);
    window.addEventListener('keyup', onKeyMod);
    c.addEventListener('pointerenter', onEnter);
    c.addEventListener('pointerleave', onOut);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onToolKey, true);
      window.removeEventListener('keydown', onKeyMod);
      window.removeEventListener('keyup', onKeyMod);
      c.removeEventListener('pointerenter', onEnter);
      c.removeEventListener('pointerleave', onOut);
    });
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', onMenu);
    c.addEventListener('mousedown', noAuto);
    this.disposers.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', onMenu);
      c.removeEventListener('mousedown', noAuto);
    });
  }

  /** Zoom Window: fits the dragged screen rectangle. */
  private zoomWindow(x0: number, y0: number, x1: number, y1: number): void {
    const a = this.toWorld(Math.min(x0, x1), Math.max(y0, y1));
    const b = this.toWorld(Math.max(x0, x1), Math.min(y0, y1));
    this.pushView();
    this.center.set((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.viewHeight = Math.min(1e9, Math.max(1e-3, Math.max(b.y - a.y, (b.x - a.x) / this.aspect()) * 1.02));
    this.updateCamera();
  }

  /** The system cursor: hidden under the crosshair, the pan hand while panning, arrows with + / − otherwise. */
  private syncCursorStyle(e?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): void {
    if (e) this.mods = { add: e.ctrlKey || e.metaKey, remove: !(e.ctrlKey || e.metaKey) && e.shiftKey };
    const c = this.renderer.domElement;
    const crosshair = this.display.crosshair !== 'off';
    if (this.panning || this.tool === 'pan') c.style.cursor = this.cur.pan;
    else if (this.tool === 'zoom') c.style.cursor = this.cur.zoom;
    else if (this.tool === 'zoomWindow') c.style.cursor = crosshair ? 'none' : 'crosshair';
    else if (crosshair) c.style.cursor = 'none';
    else c.style.cursor = modifierCursor({ ctrlKey: this.mods.add, metaKey: false, shiftKey: this.mods.remove }, this.cur);
  }

  private requestCursor(): void {
    if (this.cursorRequested) return;
    this.cursorRequested = true;
    requestAnimationFrame(() => {
      this.cursorRequested = false;
      this.drawCursor();
    });
  }

  /** AutoCAD crosshair with the pick box, and a small + or − for Ctrl (add) and Shift (remove). */
  private drawCursor(): void {
    const ctx = this.cursorCtx;
    const W = this.cursorCanvas.width;
    const H = this.cursorCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const p = this.pointer;
    if (!p || !this.drawing || this.display.crosshair === 'off' || this.panning || this.tool === 'pan' || this.tool === 'zoom') return;
    const dpr = this.renderer.getPixelRatio();
    const x = Math.round(p.x * dpr) + 0.5;
    const y = Math.round(p.y * dpr) + 0.5;
    const half = this.display.crosshair === 'full' ? Math.max(W, H) : Math.max(24 * dpr, 0.025 * Math.max(W, H));
    const box = this.tool === 'zoomWindow' ? 0 : Math.round(PICK_PX * dpr);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x - half, y);
      ctx.lineTo(x - box, y);
      ctx.moveTo(x + box, y);
      ctx.lineTo(x + half, y);
      ctx.moveTo(x, y - half);
      ctx.lineTo(x, y - box);
      ctx.moveTo(x, y + box);
      ctx.lineTo(x, y + half);
      if (box) ctx.rect(x - box, y - box, box * 2, box * 2);
    };
    // A halo in the background colour keeps the crosshair readable over dense linework.
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = this.plateCss;
    path();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = dpr;
    ctx.strokeStyle = this.gridColors.fg;
    path();
    ctx.stroke();
    if (box && (this.mods.add || this.mods.remove)) {
      const cx = x + box + 8 * dpr;
      const cy = y + box + 8 * dpr;
      const r = 3.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      if (this.mods.add) {
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx, cy + r);
      }
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }
  }

  /** Adaptive grid with the X (red) and Y (green) axes through the drawing's real origin. */
  private drawGrid(): void {
    const ctx = this.gridCtx;
    const W = this.gridCanvas.width;
    const H = this.gridCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = this.drawing;
    if (!d || !this.display.grid) return;
    const ppu = H / this.viewHeight;
    const [ox, oy] = d.info.origin;
    const halfW = W / ppu / 2;
    const halfH = this.viewHeight / 2;
    // Visible range in real coordinates, so lines land on round numbers of the file's own coordinates.
    const rx0 = this.center.x + ox - halfW, rx1 = this.center.x + ox + halfW;
    const ry0 = this.center.y + oy - halfH, ry1 = this.center.y + oy + halfH;
    const sx = (rx: number) => Math.round((rx - ox - this.center.x) * ppu + W / 2) + 0.5;
    const sy = (ry: number) => Math.round(H / 2 - (ry - oy - this.center.y) * ppu) + 0.5;
    const { minor, major } = this.gridColors;
    ctx.lineWidth = 1;
    const levels = gridLevels(ppu);
    levels.forEach((lv, i) => {
      if (lv.opacity < 0.02) return;
      const m = (a: number, b: number) => a + (b - a) * lv.mix;
      ctx.strokeStyle = `rgba(${Math.round(m(minor.r, major.r) * 255)}, ${Math.round(m(minor.g, major.g) * 255)}, ${Math.round(m(minor.b, major.b) * 255)}, ${(m(minor.a, major.a) * lv.opacity).toFixed(3)})`;
      const skip = i < levels.length - 1;
      ctx.beginPath();
      for (const v of gridValues(rx0, rx1, lv.step, skip)) {
        const X = sx(v);
        ctx.moveTo(X, 0);
        ctx.lineTo(X, H);
      }
      for (const v of gridValues(ry0, ry1, lv.step, skip)) {
        const Y = sy(v);
        ctx.moveTo(0, Y);
        ctx.lineTo(W, Y);
      }
      ctx.stroke();
    });
    ctx.lineWidth = Math.max(1, Math.round(this.renderer.getPixelRatio()));
    if (ry0 <= 0 && ry1 >= 0) {
      ctx.strokeStyle = this.gridColors.x;
      ctx.beginPath();
      ctx.moveTo(0, sy(0));
      ctx.lineTo(W, sy(0));
      ctx.stroke();
    }
    if (rx0 <= 0 && rx1 >= 0) {
      ctx.strokeStyle = this.gridColors.y;
      ctx.beginPath();
      ctx.moveTo(sx(0), 0);
      ctx.lineTo(sx(0), H);
      ctx.stroke();
    }
  }

  /** UCS icon: at the origin when it is on screen (with the origin box), else in the lower-left corner. */
  private drawUcsIcon(ctx: CanvasRenderingContext2D, W: number, H: number, ppu: number): void {
    const d = this.drawing;
    if (!d || !this.display.ucsIcon) return;
    const dpr = this.renderer.getPixelRatio();
    const [ox, oy] = d.info.origin;
    const L = 40 * dpr;
    const margin = 30 * dpr;
    let x = (-ox - this.center.x) * ppu + W / 2;
    let y = H / 2 - (-oy - this.center.y) * ppu;
    const atOrigin = x >= margin && x <= W - L - margin && y >= L + margin && y <= H - margin;
    if (!atOrigin) {
      x = margin;
      y = H - margin;
    }
    x = Math.round(x) + 0.5;
    y = Math.round(y) + 0.5;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const head = 7 * dpr;
    const arm = (dx: number, dy: number, color: string, label: string) => {
      const ex = x + dx * L, ey = y + dy * L;
      const shape = () => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        // arrowhead
        ctx.moveTo(ex + dx * head * 0.2 - dy * head * 0.5, ey + dy * head * 0.2 + dx * head * 0.5);
        ctx.lineTo(ex + dx * head, ey + dy * head);
        ctx.lineTo(ex + dx * head * 0.2 + dy * head * 0.5, ey + dy * head * 0.2 - dx * head * 0.5);
      };
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 5 * dpr;
      ctx.strokeStyle = this.plateCss;
      shape();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = color;
      shape();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, ex + dx * (head + 8 * dpr), ey + dy * (head + 8 * dpr));
    };
    ctx.font = `700 ${11 * dpr}px ${getComputedStyle(this.container).getPropertyValue('--font-sans') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    arm(1, 0, this.gridColors.x, 'X');
    arm(0, -1, this.gridColors.y, 'Y');
    if (atOrigin) {
      const b = 5 * dpr;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = this.gridColors.fg;
      ctx.strokeRect(x - b, y - b, b * 2, b * 2);
    }
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
    this.dimCss = getComputedStyle(this.container).getPropertyValue('--select-window').trim() || '#2F7FD8';
    this.plateCss = getComputedStyle(this.container).getPropertyValue('--viewport').trim() || '#FFFFFF';
    this.cur = cursorsFor(isDarkColor(this.plateCss));
    const cs = getComputedStyle(this.container);
    const tok = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    this.gridColors = {
      minor: parseCssColor(tok('--grid-minor', 'rgba(23,25,30,0.07)')) ?? this.gridColors.minor,
      major: parseCssColor(tok('--grid-major', 'rgba(23,25,30,0.16)')) ?? this.gridColors.major,
      x: tok('--axis-x', '#C62828'),
      y: tok('--axis-y', '#2E7D32'),
      fg: tok('--text', '#17191E'),
    };
    this.syncCursorStyle();
    this.requestCursor();
    this.requestRender();
  }

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.drawGrid();
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
      if (!this.layerOn[li] || this.isHidden(ent)) continue;
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
    this.drawSelection(ctx, W, H, pxPerUnit);
    this.drawUcsIcon(ctx, W, H, pxPerUnit);
  }

  private clear(): void {
    this.highlight?.removeFromParent();
    this.highlight?.geometry.dispose();
    this.highlight = null;
    this.selected = [];
    this.selSegs = [];
    this.dims = [];
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
    this.entTex?.dispose();
    this.paletteTex = this.layerTex = this.entTex = null;
    this.hiddenMask = null;
    this.tool = null;
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
    this.gridCanvas.remove();
    this.cursorCanvas.remove();
  }
}


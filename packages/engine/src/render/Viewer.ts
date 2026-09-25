import {
  Box3,
  BufferAttribute,
  Color,
  DoubleSide,
  FrontSide,
  Raycaster,
  Vector2,
  BufferGeometry,
  GreaterDepth,
  MeshBasicMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  AlwaysStencilFunc,
  InvertStencilOp,
  PlaneGeometry,
  SRGBColorSpace,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  OrthographicCamera,
  Quaternion,
  Plane,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type DataTexture,
  type ShaderMaterial,
} from 'three';
import type { ElementRecord, ParsedModel } from '../model/types';
import { orbitAround, wheelZoomFactor, worldPerPixel, zoomShift } from './cameraMath';
import { cursorsFor, isDarkColor, modifierCursor, type CursorSet } from './cursors';
import { annotationSegments, drawAnnotations, segmentTouchesRect, type Annotation, type LinePreview } from './annotations';
import { readViewerTokens, type Rgba } from './cssColor';
import {
  DISPLAY_CONSISTENT,
  DISPLAY_HIDDEN_LINE,
  DISPLAY_SHADED,
  DISPLAY_WIREFRAME,
  STATE_GLASS,
  STATE_PRESELECT,
  OVERRIDE_COLOR,
  OVERRIDE_HALFTONE,
  createOverrideTexture,
  STATE_HIDDEN,
  STATE_HOVER,
  STATE_SELECTED,
  createEdgeMaterial,
  createModelMaterial,
  createPickMaterial,
  createStateTexture,
  createOffsetTexture,
} from './materials';
import { explodeOffsets, explodedBounds, type ExplodeMode } from './explode';
import { decodePickId } from './pickId';
import { SectionGizmo, aabbOf, axesOf, cloneState, metresPerPixel, moveFace, planesOf, snapDelta, type GripData, type SectionBoxState } from './sectionBox';

export type ViewName = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
/** Revit visual styles: SD, CO, HL, WF. */
export type DisplayStyle = 'shaded' | 'consistent' | 'hiddenLine' | 'wireframe';
/** replace = plain click; add = Ctrl; remove = Shift (Revit). */
export type SelectMode = 'replace' | 'add' | 'remove';

export interface ViewerEvents {
  onPick?: (index: number | null, mode: SelectMode) => void;
  /** Drag-box result. `crossing` is true for right-to-left drags. */
  /** Box selection: elements, and the view symbols it picks (ids). */
  onBoxSelect?: (indices: number[], mode: SelectMode, crossing: boolean, annotations?: string[]) => void;
  /** Element under the pointer (for tooltips), with the pointer position in client pixels. */
  onHover?: (index: number | null, clientX?: number, clientY?: number) => void;
  /** Fired when zoom-region mode ends (done or cancelled). */
  onZoomRegionEnd?: () => void;
  /** Section box turned on/off or edited. */
  onSectionBoxChange?: (active: boolean) => void;
  /** A view symbol was clicked (select it; Ctrl adds, Shift removes). */
  onAnnotationClick?: (id: string, mode: SelectMode) => void;
  /**
   * A view symbol's grip is used (sections in plans): drag phases report the pointer on the symbol's
   * plane; 'flip' is a click.
   */
  onSymbolGrip?: (e: { id: string; grip: 'a' | 'b' | 'far' | 'move' | 'flip'; phase: 'start' | 'move' | 'end' | 'click'; point: [number, number, number]; start: [number, number, number] }) => void;
  /** A view symbol was double-clicked (section head, elevation mark, level head). */
  onOpenView?: (id: string) => void;
  /** The user started or stopped navigating (orbit, pan, zoom, transitions): the ViewCube wakes up. */
  onNavigate?: (active: boolean) => void;
  /** The camera moved (every rendered frame after a change): for the ViewCube. */
  onCamera?: (orientation: Quaternion) => void;
  /** A grip drag or rotation finished: record it as one undoable change (the viewer keeps no undo stack). */
  onSectionBoxEdit?: (before: SectionBoxState, after: SectionBoxState) => void;
}

export interface CameraState {
  position: Vector3;
  target: Vector3;
  zoom: number;
  frameHeight: number;
  /** Orientation too: orbiting can leave the camera upside down, which lookAt cannot restore. */
  quaternion: Quaternion;
}

const UP = new Vector3(0, 1, 0);
const CLICK_TOLERANCE_PX = 4;
const HISTORY_LIMIT = 50;
const STYLE_CODE: Record<DisplayStyle, number> = {
  shaded: DISPLAY_SHADED,
  consistent: DISPLAY_CONSISTENT,
  hiddenLine: DISPLAY_HIDDEN_LINE,
  wireframe: DISPLAY_WIREFRAME,
};

const modeOf = (e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectMode =>
  e.ctrlKey || e.metaKey ? 'add' : e.shiftKey ? 'remove' : 'replace';

/**
 * The Shanku 3D view. One merged mesh + feature edges, per-element state in a texture,
 * ID-buffer picking, render on demand, theme-aware.
 *
 * Revit navigation: middle-drag pan · Shift + middle-drag orbit (about the selection) ·
 * wheel zoom about the cursor · double-middle-click fit. Left click selects; Ctrl adds,
 * Shift removes; left-drag box selects (left→right window, right→left crossing).
 * Trackpad fallback: Alt + left-drag orbit, Alt + Shift + left-drag pan.
 */
export class Viewer {
  readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private pickScene = new Scene();
  private camera: OrthographicCamera;
  private target = new Vector3();
  private frameHeight = 10;
  private model: ParsedModel | null = null;
  private state: DataTexture | null = null;
  private overrideTex: DataTexture | null = null;
  private stateData: Uint8Array | null = null;
  private meshMat: ShaderMaterial | null = null;
  private glassMat: ShaderMaterial | null = null;
  private edgeMat: ShaderMaterial | null = null;
  private pickMat: ShaderMaterial | null = null;
  private mesh: Mesh | null = null;
  private edges: LineSegments | null = null;
  private objects: Array<Mesh | LineSegments> = [];
  private pickTarget = new WebGLRenderTarget(1, 1);
  private pickPixel = new Uint8Array(4);
  private selection = new Set<number>();
  private hidden = new Set<number>();
  private hovered: number | null = null;
  private style: DisplayStyle = 'shaded';
  private section: Box3 | null = null;
  private clipPlanes: Plane[] = [];
  /**
   * Solid cut faces (Revit-style caps) by stencil parity: for each cut plane facing the camera, every
   * surface on the kept side inverts the stencil; odd means the point on the plane is inside a solid,
   * and a cap quad is drawn there. Works whatever the mesh winding; the model itself stays hollow.
   */
  private capStencilScene = new Scene();
  private capScene = new Scene();
  private capStencilMat: ShaderMaterial | null = null;
  private capClip = new Plane();
  private capOthers: Plane[] = [0, 1, 2, 3, 4].map(() => new Plane());
  private capMat = new MeshBasicMaterial({
    side: DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: ReplaceStencilOp,
    stencilZFail: ReplaceStencilOp,
    stencilZPass: ReplaceStencilOp,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private capQuad = new Mesh(new PlaneGeometry(1, 1), this.capMat);
  /** Cap colours: base (cut concrete), selected, hovered and box preview (set from the theme). */
  private capColors = { base: new Color(), sel: new Color(), hov: new Color(), pre: new Color() };
  /**
   * Cut outlines (Revit's cut lines): where each cut plane slices elements, drawn darker than model
   * edges. Computed on the CPU when the cut changes (throttled), one line set per plane.
   */
  private cutScene = new Scene();
  private cutLines: LineSegments[] = [];
  private cutMat = new LineBasicMaterial({ depthTest: false, transparent: true });
  private cutOthers: Plane[][] = [0, 1, 2, 3, 4, 5].map(() => [0, 1, 2, 3, 4].map(() => new Plane()));
  private cutKey = '';
  private cutPending: ReturnType<typeof setTimeout> | undefined;
  private cutLastBuild = 0;
  private hiddenVersion = 0;
  private sbox: SectionBoxState | null = null;
  private gizmo = new SectionGizmo();
  private gizmoScene = new Scene();
  private hotGrip: Mesh | null = null;
  private raycaster = new Raycaster();
  private pivotEl: HTMLDivElement;
  /** Cursors drawn for the canvas: dark on Paper, light on Ink. */
  private cur: CursorSet = cursorsFor(false);
  private dimEl: SVGSVGElement;
  /** View symbols (section / elevation marks, level lines) over the model. */
  private annEl: SVGSVGElement;
  private annotations: Annotation[] = [];
  private annHot: string | null = null;
  private annSelected = new Set<string>();
  private annPreselect = new Set<string>();
  private preselected: number[] = [];
  /** Section tool: two clicks on a plane draw a line; the rubber band snaps to 15° on screen. */
  private linePick: { plane: Plane; first: Vector3 | null; cursor: Vector3 | null; preview: LinePreview | null; snap: number; onLine: (a: Vector3, b: Vector3) => void } | null = null;
  private edgesOn = true;
  private future: CameraState[] = [];
  /** Plans, elevations and sections: pan and zoom only (orbit becomes pan), as in Revit. */
  private nav2d = false;
  /** The section box is a view range (plan / section) rather than a user box: no grips. */
  private gripsOn = true;
  /** Two-point pick in plan (e.g. drawing a section): clicks report points instead of selecting. */
  private pointPick: { plane: Plane; onPoint: (p: Vector3) => void } | null = null;
  /** Revit "Show Hidden Lines": edges behind other geometry drawn dashed (on in structural plans). */
  private hiddenEdges: LineSegments | null = null;
  private hiddenEdgeMat: ShaderMaterial | null = null;
  private hiddenLinesOn = false;
  private lastPointer: [number, number] = [0, 0];
  private animToken = 0;
  private navActive = false;
  private navTimer: ReturnType<typeof setTimeout> | undefined;
  private revealOn = false;
  private history: CameraState[] = [];
  private zoomRegionArmed = false;
  private frameRequested = false;
  private disposers: Array<() => void> = [];
  private modelSphere = new Sphere(new Vector3(), 10);
  /** Exploded view: mode, current amount (0-1) and the per-element offsets at full explosion. */
  /** Active exploded-view modes (combined), and their key for comparisons. */
  private explodeModes: ExplodeMode[] = [];
  private explodeKey = '';
  private explodeAmount = 0;
  private explodeData: Float32Array | null = null;
  private explodeTex: DataTexture | null = null;
  private explodeToken = 0;
  private rectEl: HTMLDivElement;
  lastFrameMs = 0;

  constructor(private container: HTMLElement, private events: ViewerEvents = {}) {
    // stencil: true — solid section caps need a stencil buffer (three.js no longer allocates one by default).
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); // the container's --viewport background shows through
    this.renderer.localClippingEnabled = true;
    this.capMat.clippingPlanes = this.capOthers;
    for (let i = 0; i < 6; i++) {
      const m = this.cutMat.clone();
      m.clippingPlanes = this.cutOthers[i];
      const ls = new LineSegments(new BufferGeometry(), m);
      ls.frustumCulled = false;
      ls.visible = false;
      ls.renderOrder = 10;
      this.cutLines.push(ls);
      this.cutScene.add(ls);
    }
    this.capQuad.frustumCulled = false;
    this.capScene.add(this.capQuad);
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D view');
    container.appendChild(this.canvas);

    this.rectEl = document.createElement('div');
    Object.assign(this.rectEl.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'none',
      borderWidth: '1px',
      borderStyle: 'solid',
    });
    container.appendChild(this.rectEl);
    // Revit shows the centre of rotation while orbiting.
    this.pivotEl = document.createElement('div');
    Object.assign(this.pivotEl.style, {
      position: 'absolute', display: 'none', pointerEvents: 'none', width: '11px', height: '11px', marginLeft: '-6px', marginTop: '-6px',
      borderRadius: '6px', border: '2px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 35%, transparent)',
    });
    container.appendChild(this.pivotEl);
    // Temporary dimensions of a single selected element (Revit-like; read-only for now).
    this.dimEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(this.dimEl.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' });
    container.appendChild(this.dimEl);
    this.annEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(this.annEl.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' });
    container.appendChild(this.annEl);
    // Heads: hover highlights, double-click opens the view (Revit).
    const headOf = (t: EventTarget | null) => (t as Element | null)?.closest?.('[data-view]')?.getAttribute('data-view') ?? null;
    this.annEl.addEventListener('pointerover', (e) => {
      const id = headOf(e.target);
      if (id !== this.annHot) {
        this.annHot = id;
        this.requestRender();
      }
    });
    this.annEl.addEventListener('pointerout', () => {
      this.annHot = null;
      this.requestRender();
    });
    // Grips: drag on the symbol's horizontal plane; the flip grip is a click.
    this.annEl.addEventListener('pointerdown', (e) => {
      const g = (e.target as Element | null)?.closest?.('[data-grip]');
      if (!g || e.button !== 0) return;
      const id = g.getAttribute('data-view')!, grip = g.getAttribute('data-grip') as 'a' | 'b' | 'far' | 'move' | 'flip';
      if (!this.annSelected.has(id)) return; // grips act only on the selected symbol
      const ann = this.annotations.find((x) => x.id === id);
      if (!ann || ann.kind !== 'section') return;
      e.stopPropagation();
      e.preventDefault();
      const plane = new Plane(new Vector3(0, 1, 0), -ann.a[1]);
      const at = (cx: number, cy: number): [number, number, number] | null => {
        const r = this.canvas.getBoundingClientRect();
        this.raycaster.setFromCamera(new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.camera);
        const p = this.raycaster.ray.intersectPlane(plane, new Vector3());
        return p ? [p.x, p.y, p.z] : null;
      };
      const start = at(e.clientX, e.clientY);
      if (!start) return;
      if (grip === 'flip') {
        this.events.onSymbolGrip?.({ id, grip, phase: 'click', point: start, start });
        return;
      }
      this.events.onSymbolGrip?.({ id, grip, phase: 'start', point: start, start });
      let moved = false;
      const move = (ev: PointerEvent) => {
        const p = at(ev.clientX, ev.clientY);
        if (!p) return;
        moved = true;
        this.events.onSymbolGrip?.({ id, grip, phase: 'move', point: p, start });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const p = at(ev.clientX, ev.clientY) ?? start;
        this.events.onSymbolGrip?.({ id, grip, phase: 'end', point: moved ? p : start, start });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    this.annEl.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('[data-grip]:not([data-grip="move"])')) return; // grips are not selection clicks
      const id = headOf(e.target);
      if (id) this.events.onAnnotationClick?.(id, e.ctrlKey || e.metaKey ? 'add' : e.shiftKey ? 'remove' : 'replace');
    });
    this.annEl.addEventListener('dblclick', (e) => {
      const id = headOf(e.target);
      if (id) this.events.onOpenView?.(id);
    });

    this.camera = new OrthographicCamera(-1, 1, 1, -1, -1e4, 1e4);
    this.camera.up.copy(UP);
    this.gizmoScene.add(this.gizmo.group);
    this.orient('iso');

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.disposers.push(() => ro.disconnect());
    this.resize();
    this.bindInput();
    this.watchTheme();
  }

  // ------------------------------------------------------------------ model

  /**
   * Shows a model. `keepView`: a live update of the same model (merged changes from Revit): the
   * camera, section box and everything the app sets stay; only the geometry changes.
   */
  setModel(model: ParsedModel | null, opts: { keepView?: boolean } = {}): void {
    // A live update keeps the view: its clipping (plan view range, section, section box) must survive
    // the rebuild, which clears the section box along with the old geometry.
    const keepBox = opts.keepView ? this.sectionBox : null;
    this.clearModel();
    this.model = model;
    this.history = [];
    if (!model) return this.requestRender();

    this.state = createStateTexture(model.elements.length);
    this.overrideTex = createOverrideTexture(model.elements.length);
    this.stateData = this.state.image.data as Uint8Array;
    this.meshMat = createModelMaterial(this.state, this.overrideTex);
    // Second pass for windows and doors: same geometry, transparent, drawn after the opaque model.
    this.glassMat = createModelMaterial(this.state, this.overrideTex);
    this.glassMat.uniforms.uPass.value = 1;
    this.glassMat.transparent = true;
    this.glassMat.depthWrite = false;
    this.glassMat.clippingPlanes = this.clipPlanes;
    model.elements.forEach((e) => {
      if (e.ifcClass === 'IfcWindow' || e.ifcClass === 'IfcDoor') this.stateData![e.index * 4] |= STATE_GLASS;
    });
    this.edgeMat = createEdgeMaterial(this.state, this.overrideTex);
    this.pickMat = createPickMaterial(this.state, this.overrideTex);
    for (const m of [this.meshMat, this.edgeMat, this.pickMat]) m.clippingPlanes = this.clipPlanes;
    this.applyTheme();

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(model.mesh.positions, 3));
    geo.setAttribute('normal', new BufferAttribute(model.mesh.normals, 3));
    geo.setAttribute('aElement', new BufferAttribute(model.mesh.elementIds, 1));
    geo.setIndex(new BufferAttribute(model.mesh.indices, 1));
    this.mesh = new Mesh(geo, this.meshMat);
    this.mesh.frustumCulled = false;
    const pickMesh = new Mesh(geo, this.pickMat);
    pickMesh.frustumCulled = false;

    const eg = new BufferGeometry();
    eg.setAttribute('position', new BufferAttribute(model.edges.positions, 3));
    eg.setAttribute('aElement', new BufferAttribute(model.edges.elementIds, 1));
    this.edges = new LineSegments(eg, this.edgeMat);
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 1;
    this.hiddenEdgeMat = createEdgeMaterial(this.state, this.overrideTex);
    this.hiddenEdgeMat.uniforms.uDashed.value = 1;
    this.hiddenEdgeMat.uniforms.uDash.value = 4 * this.renderer.getPixelRatio();
    this.hiddenEdgeMat.depthFunc = GreaterDepth; // only where something is in front
    this.hiddenEdgeMat.clippingPlanes = this.clipPlanes;
    this.hiddenEdges = new LineSegments(eg, this.hiddenEdgeMat);
    this.hiddenEdges.frustumCulled = false;
    this.hiddenEdges.renderOrder = 1;
    this.hiddenEdges.visible = this.hiddenLinesOn;
    // Cap stencil pass: the pick shader (follows hidden elements and exploded offsets), no colour.
    this.capStencilMat = createPickMaterial(this.state, this.overrideTex);
    Object.assign(this.capStencilMat, {
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      stencilWrite: true,
      stencilFunc: AlwaysStencilFunc,
      stencilFail: InvertStencilOp,
      stencilZFail: InvertStencilOp,
      stencilZPass: InvertStencilOp,
    });
    this.capStencilMat.clippingPlanes = [this.capClip];
    const capMesh = new Mesh(geo, this.capStencilMat);
    capMesh.frustumCulled = false;
    this.capStencilScene.clear();
    this.capStencilScene.add(capMesh);

    const glassMesh = new Mesh(geo, this.glassMat);
    glassMesh.frustumCulled = false;
    glassMesh.renderOrder = 2;
    this.scene.add(this.mesh, this.edges, this.hiddenEdges, glassMesh);
    this.pickScene.add(pickMesh);
    this.objects = [this.mesh, this.edges, this.hiddenEdges, glassMesh, pickMesh];
    this.modelBox()?.getBoundingSphere(this.modelSphere);
    this.setDisplayStyle(this.style);
    this.edges.visible = this.edgesOn;
    this.setReveal(this.revealOn);
    if (!opts.keepView) this.orient('iso'); // a live update keeps the view's direction (a plan looks down)
    if (!opts.keepView) this.fit(undefined, false);
    else if (keepBox) this.setSectionBoxState(keepBox);
  }

  private clearModel(): void {
    for (const o of this.objects) {
      o.removeFromParent();
      o.geometry.dispose();
    }
    this.objects = [];
    this.mesh = this.edges = null;
    this.meshMat?.dispose();
    this.glassMat?.dispose();
    this.glassMat = null;
    this.hiddenEdgeMat?.dispose();
    this.hiddenEdgeMat = null;
    this.capStencilMat?.dispose();
    this.capStencilMat = null;
    this.capStencilScene.clear();
    this.hiddenEdges = null;
    this.edgeMat?.dispose();
    this.pickMat?.dispose();
    this.state?.dispose();
    this.overrideTex?.dispose();
    this.overrideTex = null;
    this.explodeTex?.dispose();
    this.explodeTex = null;
    this.explodeData = null;
    this.explodeModes = [];
    this.explodeKey = '';
    this.explodeAmount = 0;
    this.explodeToken++;
    this.meshMat = this.edgeMat = this.pickMat = null;
    this.state = this.stateData = null;
    this.selection.clear();
    this.hidden.clear();
    this.hovered = null;
    this.setSectionBox(null);
  }

  get elements(): readonly ElementRecord[] {
    return this.model?.elements ?? [];
  }

  // ------------------------------------------------- selection and visibility

  setSelection(indices: Iterable<number>): void {
    if (!this.stateData || !this.state) return;
    for (const i of this.selection) this.stateData[i * 4] &= ~STATE_SELECTED;
    this.selection = new Set(indices);
    for (const i of this.selection) this.stateData[i * 4] |= STATE_SELECTED;
    this.state.needsUpdate = true;
    this.requestRender();
  }

  /** Temporary hide/isolate (Revit HH, HI, IC, HR): exactly these elements are hidden. */
  setHidden(indices: Iterable<number>): void {
    if (!this.stateData || !this.state) return;
    for (const i of this.hidden) this.stateData[i * 4] &= ~STATE_HIDDEN;
    this.hidden = new Set(indices);
    this.hiddenVersion++;
    for (const i of this.hidden) this.stateData[i * 4] |= STATE_HIDDEN;
    this.state.needsUpdate = true;
    this.requestRender();
  }

  private setHover(index: number | null): void {
    if (index === this.hovered || !this.stateData || !this.state) return;
    if (this.hovered !== null) this.stateData[this.hovered * 4] &= ~STATE_HOVER;
    this.hovered = index;
    if (index !== null) this.stateData[index * 4] |= STATE_HOVER;
    this.state.needsUpdate = true;
    this.events.onHover?.(index, this.lastPointer[0], this.lastPointer[1]);
    this.requestRender();
  }

  /** Element index under a client-space point, or null. Renders one pixel of the ID buffer. */
  pick(clientX: number, clientY: number): number | null {
    if (!this.model) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const dpr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    this.camera.setViewOffset(w, h, Math.floor(x * dpr), Math.floor(y * dpr), 1, 1);
    this.renderer.setRenderTarget(this.pickTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.pickScene, this.camera);
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, 1, 1, this.pickPixel);
    this.renderer.setRenderTarget(null);
    this.camera.clearViewOffset();
    const idx = decodePickId(this.pickPixel[0], this.pickPixel[1], this.pickPixel[2]);
    return idx !== null && idx < this.model.elements.length ? idx : null;
  }

  /**
   * Elements inside a client-space rectangle. Window (left→right): every corner of the
   * element's box is inside. Crossing (right→left): its screen box overlaps the rectangle.
   * Hidden elements and elements outside the section box are ignored.
   */
  elementsInRect(x0: number, y0: number, x1: number, y1: number, crossing: boolean): number[] {
    if (!this.model) return [];
    const rect = this.canvas.getBoundingClientRect();
    const [ax, bx] = [Math.min(x0, x1) - rect.left, Math.max(x0, x1) - rect.left];
    const [ay, by] = [Math.min(y0, y1) - rect.top, Math.max(y0, y1) - rect.top];
    const m = new Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).elements;
    const w = rect.width / 2;
    const h = rect.height / 2;
    const out: number[] = [];
    for (const el of this.model.elements) {
      if (this.hidden.has(el.index)) continue;
      const b = this.boundsOf(el.index);
      if (this.section && !this.section.intersectsBox(new Box3(new Vector3(b[0], b[1], b[2]), new Vector3(b[3], b[4], b[5])))) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? b[3] : b[0];
        const y = c & 2 ? b[4] : b[1];
        const z = c & 4 ? b[5] : b[2];
        // Orthographic: w = 1, so NDC = clip.
        const sx = (m[0] * x + m[4] * y + m[8] * z + m[12] + 1) * w;
        const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13])) * h;
        if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      }
      const inside = crossing
        ? maxX >= ax && minX <= bx && maxY >= ay && minY <= by
        : minX >= ax && maxX <= bx && minY >= ay && maxY <= by;
      if (inside) out.push(el.index);
    }
    return out;
  }

  // -------------------------------------------------------- display styles

  setDisplayStyle(style: DisplayStyle): void {
    this.style = style;
    for (const m of [this.meshMat, this.glassMat]) if (m) m.uniforms.uMode.value = STYLE_CODE[style];
    if (this.mesh) this.mesh.visible = style !== 'wireframe';
    if (this.edgeMat) {
      // Wireframe shows edges through the model, like Revit's WF.
      this.edgeMat.depthTest = style !== 'wireframe';
      this.edgeMat.needsUpdate = true;
    }
    this.applyTheme();
  }

  get displayStyle(): DisplayStyle {
    return this.style;
  }

  /** Section box (Revit BX) around the given elements, with a small margin; null removes it. */
  setSectionBox(indices: Iterable<number> | null): void {
    const box = indices ? this.boxOf(indices) : null;
    if (box) {
      const b = box.clone().expandByScalar(Math.max(0.1, box.getSize(new Vector3()).length() * 0.02));
      this.sbox = { center: b.getCenter(new Vector3()), half: b.getSize(new Vector3()).multiplyScalar(0.5), angle: 0 };
    } else this.sbox = null;
    this.applySectionBox(true);
  }

  /** Sets the section box to an exact state (null removes it); used by undo/redo. */
  setSectionBoxState(st: SectionBoxState | null): void {
    const toggled = (st === null) !== (this.sbox === null);
    this.sbox = st ? cloneState(st) : null;
    this.applySectionBox(toggled);
  }

  /** Current section box (centre, half-size, plan rotation), or null. */
  get sectionBox(): SectionBoxState | null {
    return this.sbox ? cloneState(this.sbox) : null;
  }

  private applySectionBox(toggled: boolean): void {
    const st = this.sbox;
    this.section = st ? aabbOf(st) : null;
    this.clipPlanes.length = 0;
    if (st) this.clipPlanes.push(...planesOf(st));
    if (toggled) {
      // Caps need back faces while a section box is on; without it, front faces only (cheaper, no artefacts).
      for (const m of [this.meshMat, this.glassMat, this.pickMat]) if (m) m.side = st ? DoubleSide : FrontSide;
      for (const m of [this.meshMat, this.glassMat, this.edgeMat, this.pickMat]) if (m) m.needsUpdate = true;
    }
    this.events.onSectionBoxChange?.(st !== null);
    this.requestRender();
  }

  get hasSectionBox(): boolean {
    return this.section !== null;
  }

  /**
   * Draws solid caps on the cut planes that face the camera (see capStencilScene): the cut concrete
   * everywhere, then again only for selected, hovered and box-previewed elements in their colours, so
   * cut faces answer hover and selection like the rest of the element. Then the cut outlines.
   */
  private renderCaps(): void {
    const st = this.sbox!;
    const sm = this.capStencilMat!;
    if (this.pickMat) {
      for (const k of ['uExplode', 'uOffset', 'uReveal']) if (sm.uniforms[k] && this.pickMat.uniforms[k]) sm.uniforms[k].value = this.pickMat.uniforms[k].value;
    }
    this.updateCutLines();
    const forward = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const size = Math.max(10, this.modelSphere.radius * 4, st.half.length() * 4);
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    const n0 = new Vector3(0, 0, 1);
    const passes: Array<[number, Color]> = [[0, this.capColors.base]];
    if (this.selection.size) passes.push([STATE_SELECTED, this.capColors.sel]);
    if (this.hovered !== null) passes.push([STATE_HOVER, this.capColors.hov]);
    if (this.preselected.length) passes.push([STATE_PRESELECT, this.capColors.pre]);
    this.clipPlanes.forEach((plane, i) => {
      if (plane.normal.dot(forward) <= 1e-3) return; // visible only from the removed side
      this.capClip.copy(plane);
      let k = 0;
      this.clipPlanes.forEach((q, j) => j !== i && this.capOthers[k++].copy(q));
      plane.projectPoint(st.center, this.capQuad.position);
      this.capQuad.quaternion.setFromUnitVectors(n0, plane.normal);
      this.capQuad.scale.set(size, size, 1);
      this.capQuad.updateMatrixWorld();
      for (const [mask, color] of passes) {
        sm.uniforms.uStateMask.value = mask;
        this.capMat.color.copy(color);
        this.renderer.clearStencil();
        this.renderer.render(this.capStencilScene, this.camera);
        this.renderer.render(this.capScene, this.camera);
      }
      // this plane's cut outline, on top of its caps
      this.cutLines.forEach((ls, j) => (ls.visible = j === i && (ls.geometry.getAttribute('position')?.count ?? 0) > 0));
      this.renderer.render(this.cutScene, this.camera);
    });
    sm.uniforms.uStateMask.value = 0;
    this.renderer.autoClear = auto;
  }

  /** Rebuilds the cut outlines when the planes, hidden elements or explode state change (throttled). */
  private updateCutLines(): void {
    if (!this.model || !this.sbox) return;
    const key = this.clipPlanes.map((p) => `${p.normal.x.toFixed(4)},${p.normal.y.toFixed(4)},${p.normal.z.toFixed(4)},${p.constant.toFixed(4)}`).join('|') + `#${this.hiddenVersion}#${this.explodeAmount > 0 ? 'x' : ''}`;
    if (key === this.cutKey) return;
    const now = performance.now();
    if (now - this.cutLastBuild < 150) {
      // dragging a grip: rebuild when the movement pauses
      clearTimeout(this.cutPending);
      this.cutPending = setTimeout(() => this.requestRender(), 160);
      return;
    }
    this.cutKey = key;
    this.cutLastBuild = now;
    const exploded = this.explodeAmount > 0; // outlines follow the assembled model only
    const { positions: P, indices: I, elementIds: E } = this.model.mesh;
    this.clipPlanes.forEach((plane, i) => {
      let k = 0;
      this.clipPlanes.forEach((q, j) => j !== i && this.cutOthers[i][k++].copy(q));
      const out: number[] = [];
      if (!exploded) {
        const nx = plane.normal.x, ny = plane.normal.y, nz = plane.normal.z, c = plane.constant;
        for (let t = 0; t < I.length; t += 3) {
          const a = I[t], b = I[t + 1], d = I[t + 2];
          if (this.hidden.has(E[a])) continue;
          const da = nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2] + c;
          const db = nx * P[b * 3] + ny * P[b * 3 + 1] + nz * P[b * 3 + 2] + c;
          const dd = nx * P[d * 3] + ny * P[d * 3 + 1] + nz * P[d * 3 + 2] + c;
          if ((da > 0 && db > 0 && dd > 0) || (da < 0 && db < 0 && dd < 0)) continue;
          const pts: number[] = [];
          const edge = (u: number, du: number, v: number, dv: number) => {
            if ((du > 0) === (dv > 0) || du === dv) return;
            const s = du / (du - dv);
            pts.push(P[u * 3] + (P[v * 3] - P[u * 3]) * s, P[u * 3 + 1] + (P[v * 3 + 1] - P[u * 3 + 1]) * s, P[u * 3 + 2] + (P[v * 3 + 2] - P[u * 3 + 2]) * s);
          };
          edge(a, da, b, db);
          edge(b, db, d, dd);
          edge(d, dd, a, da);
          if (pts.length >= 6) out.push(pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]);
        }
      }
      const g = this.cutLines[i].geometry;
      g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3));
      g.computeBoundingSphere();
    });
  }

  // ----------------------------------------------------------------- camera

  private snapshot(): CameraState {
    return { position: this.camera.position.clone(), target: this.target.clone(), zoom: this.camera.zoom, frameHeight: this.frameHeight, quaternion: this.camera.quaternion.clone() };
  }

  private pushHistory(): void {
    this.history.push(this.snapshot());
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.future = [];
  }

  /** The camera, to keep per view (plans, elevations, sections and 3D views each remember theirs). */
  getCameraState(): CameraState {
    return this.snapshot();
  }

  /** Restores a camera saved with getCameraState (instant, no animation). */
  setCameraState(s: CameraState): void {
    this.camera.position.copy(s.position);
    this.target.copy(s.target);
    this.camera.quaternion.copy(s.quaternion);
    this.camera.zoom = s.zoom;
    this.frameHeight = s.frameHeight;
    this.updateFrustum();
    this.requestRender();
  }

  /**
   * View kind: 2D views (plan, elevation, section) pan and zoom only; `grips` false shows the section box
   * as a view range without grips.
   */
  setViewMode(opts: { nav2d: boolean; grips: boolean }): void {
    this.nav2d = opts.nav2d;
    this.gripsOn = opts.grips;
    this.requestRender();
  }

  /** Clicks report points on the horizontal plane at height y (world) until stopPointPick. */
  startPointPick(y: number, onPoint: (p: Vector3) => void): void {
    this.startPlanePick([0, 1, 0], [0, y, 0], onPoint);
  }

  /** Clicks report points on a plane (normal, through point), e.g. an elevation's view plane. */
  startPlanePick(normal: readonly [number, number, number], through: readonly [number, number, number], onPoint: (p: Vector3) => void): void {
    const n = new Vector3(normal[0], normal[1], normal[2]).normalize();
    this.pointPick = { plane: new Plane().setFromNormalAndCoplanarPoint(n, new Vector3(through[0], through[1], through[2])), onPoint };
    this.canvas.style.cursor = 'crosshair';
  }

  stopPointPick(): void {
    this.pointPick = null;
    this.linePick = null;
    this.canvas.style.cursor = '';
  }

  /** Aim along a direction and fit, without animation (setting up a view). */
  aimInstant(dir: Vector3 | readonly [number, number, number], fitTo?: Iterable<number>): void {
    this.aim(Array.isArray(dir) ? new Vector3(dir[0], dir[1], dir[2]) : (dir as Vector3));
    this.fit(fitTo, false);
  }

  /** Revit Next Pan/Zoom (after Previous). */
  nextView(): boolean {
    const s = this.future.pop();
    if (!s) return false;
    this.history.push(this.snapshot());
    this.animateTo(s);
    return true;
  }

  get canGoPrevious(): boolean {
    return this.history.length > 0;
  }

  get canGoNext(): boolean {
    return this.future.length > 0;
  }

  /** Revit Zoom Out (2x), about the view centre. */
  zoomOut2x(): void {
    this.pushHistory();
    const end = this.snapshot();
    end.frameHeight *= 2;
    this.animateTo(end);
  }

  /**
   * Smooth camera move to a state, like Revit's ViewCube transitions (ease in-out, ~0.45 s).
   * Position and target move in a straight line, orientation turns along the shortest arc.
   */
  private animateTo(end: CameraState, ms = 450): void {
    const start = this.snapshot();
    const t0 = performance.now();
    this.animToken++;
    const token = this.animToken;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const step = () => {
      if (token !== this.animToken) return; // a newer move took over
      const k = reduce ? 1 : Math.min(1, (performance.now() - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; // ease in-out cubic
      this.camera.position.lerpVectors(start.position, end.position, e);
      this.target.lerpVectors(start.target, end.target, e);
      this.camera.quaternion.slerpQuaternions(start.quaternion, end.quaternion, e);
      this.frameHeight = start.frameHeight + (end.frameHeight - start.frameHeight) * e;
      this.camera.zoom = start.zoom + (end.zoom - start.zoom) * e;
      this.updateFrustum();
      this.navigating();
      this.requestRender();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Runs a camera change, captures where it ends, and animates there from where it started. */
  private animated(change: () => void): void {
    const start = this.snapshot();
    change();
    const end = this.snapshot();
    this.camera.position.copy(start.position);
    this.target.copy(start.target);
    this.camera.quaternion.copy(start.quaternion);
    this.camera.zoom = start.zoom;
    this.frameHeight = start.frameHeight;
    this.updateFrustum();
    this.animateTo(end);
  }

  /** Tells listeners the view is being navigated (the ViewCube lights up), then idle after a pause. */
  private navigating(): void {
    if (!this.navActive) {
      this.navActive = true;
      this.events.onNavigate?.(true);
    }
    clearTimeout(this.navTimer);
    this.navTimer = setTimeout(() => {
      this.navActive = false;
      this.events.onNavigate?.(false);
    }, 700);
  }

  /** Revit ZP / ZC: back to the previous pan/zoom. Returns false when there is none. */
  previousView(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.future.push(this.snapshot());
    this.animateTo(s);
    return true;
  }

  /** Revit Home: default orientation, whole model in view. */
  home(): void {
    this.pushHistory();
    this.animated(() => {
      if (this.homeDir) this.aim(this.homeDir);
      else this.orient('iso');
      this.fit(undefined, false);
    });
  }

  setView(view: ViewName): void {
    this.pushHistory();
    this.animated(() => {
      this.orient(view);
      this.fit(undefined, false);
    });
  }

  private orient(view: ViewName): void {
    const dirs: Record<ViewName, [number, number, number]> = {
      iso: [1, 0.82, 1],
      top: [0, 1, 0],
      bottom: [0, -1, 0],
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
    };
    this.aim(new Vector3(...dirs[view]));
  }

  /** Puts the camera on the side `dir` points to (from the target), horizon level; plan views have north up. */
  private aim(dir: Vector3): void {
    const d = dir.clone().normalize();
    this.camera.position.copy(this.target).addScaledVector(d, Math.max(10, this.modelSphere.radius * 4));
    const vertical = Math.abs(d.y) > 0.999;
    if (vertical) this.camera.up.set(0, 0, -1); // looking straight down or up: north (−Z) at the top of the screen
    this.camera.lookAt(this.target);
    if (vertical) this.camera.up.copy(UP);
    this.camera.updateMatrixWorld();
  }

  /** Home view direction (ViewCube ▾ → Set Current View as Home). Null = the default 3D view. */
  private homeDir: Vector3 | null = null;

  /** ViewCube ▾: make the current viewing direction the Home view (null resets to the default). */
  setHomeView(current: boolean): void {
    this.homeDir = current ? this.camera.position.clone().sub(this.target).normalize() : null;
  }

  /** ViewCube: look from the direction `dir` (world, from the model towards the camera), then fit. */
  lookFrom(dir: Vector3 | readonly [number, number, number]): void {
    this.pushHistory();
    this.animated(() => {
      this.aim(Array.isArray(dir) ? new Vector3(dir[0], dir[1], dir[2]) : (dir as Vector3));
      this.fit(undefined, false);
    });
  }

  /** ViewCube drag: orbit by screen pixels about the selection, section box or model. */
  orbitBy(dxPx: number, dyPx: number): void {
    if (this.nav2d) return;
    this.navigating();
    this.orbit(dxPx, dyPx, this.orbitPivot());
  }

  /** Camera orientation (camera to world), for the ViewCube. */
  get orientation(): Quaternion {
    return this.camera.quaternion.clone();
  }

  /** An element's bounds where it is drawn (moved by the exploded view, if any). */
  private boundsOf(index: number): ElementRecord['bounds'] {
    const b = this.model!.elements[index].bounds;
    return explodedBounds(b, this.explodeData, index, this.explodeAmount);
  }

  /** Current exploded view: its mode (null when never exploded) and amount 0-1. */
  get explode(): { modes: ExplodeMode[]; amount: number } {
    return { modes: [...this.explodeModes], amount: this.explodeAmount };
  }

  /**
   * Exploded view: moves elements apart by storey, outwards from the plan centre, or by category.
   * `amount` 0 is assembled and 1 fully exploded. Animated (0.6 s) unless `animate` is false or the
   * user prefers reduced motion. Works on the GPU: nothing is rebuilt, picking follows.
   * `refit` frames the whole (exploded or collapsed) model when the movement ends.
   */
  setExplode(modes: ExplodeMode | readonly ExplodeMode[], amount: number, animate = true, refit = false): void {
    if (!this.model) return;
    const list = (typeof modes === 'string' ? [modes] : [...new Set(modes)]).sort() as ExplodeMode[];
    const key = list.join('+');
    const target = Math.min(1, Math.max(0, amount));
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const token = ++this.explodeToken;
    const ms = 600;
    const t0 = performance.now();
    const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2); // ease in-out cubic
    const n = this.model.elements.length;

    if (key !== this.explodeKey || !this.explodeData) {
      // Another combination: glide every element from where it is now to where the new one puts it
      // (blend the effective offsets at amount 1), so adding or removing a mode never snaps back.
      const next = explodeOffsets(this.model.elements, list);
      const from = new Float32Array(n * 3);
      if (this.explodeData) for (let i = 0; i < from.length; i++) from[i] = this.explodeData[i] * this.explodeAmount;
      const to = new Float32Array(n * 3);
      for (let i = 0; i < to.length; i++) to[i] = next[i] * target;
      const work = new Float32Array(n * 3);
      this.explodeTex?.dispose();
      this.explodeData = work;
      this.explodeTex = createOffsetTexture(work, n);
      for (const mat of [this.meshMat, this.glassMat, this.edgeMat, this.hiddenEdgeMat, this.pickMat]) if (mat) mat.uniforms.uOffset.value = this.explodeTex;
      this.explodeModes = list;
      this.explodeKey = key;
      const texData = this.explodeTex.image.data as Float32Array;
      const blend = (e: number) => {
        for (let i = 0; i < work.length; i++) work[i] = from[i] + (to[i] - from[i]) * e;
        // the offset texture is RGBA per element; copy xyz
        for (let j = 0; j < n; j++) {
          texData[j * 4] = work[j * 3];
          texData[j * 4 + 1] = work[j * 3 + 1];
          texData[j * 4 + 2] = work[j * 3 + 2];
        }
        this.explodeTex!.needsUpdate = true;
        this.applyExplodeAmount(1);
      };
      const finish = () => {
        // settle on the plain offsets of the new combination at the target amount
        this.explodeData = next;
        this.explodeTex?.dispose();
        this.explodeTex = createOffsetTexture(next, n);
        for (const mat of [this.meshMat, this.glassMat, this.edgeMat, this.hiddenEdgeMat, this.pickMat]) if (mat) mat.uniforms.uOffset.value = this.explodeTex;
        this.applyExplodeAmount(target);
        if (refit) this.animated(() => this.fit(undefined, false));
      };
      const step = () => {
        if (token !== this.explodeToken) return;
        const k = !animate || reduce ? 1 : Math.min(1, (performance.now() - t0) / ms);
        blend(ease(k));
        if (k < 1) requestAnimationFrame(step);
        else finish();
      };
      if (!animate || reduce) step();
      else requestAnimationFrame(step);
      return;
    }
    // Same combination: animate the spread only.
    const from = this.explodeAmount;
    const step = () => {
      if (token !== this.explodeToken) return;
      const k = !animate || reduce ? 1 : Math.min(1, (performance.now() - t0) / ms);
      this.applyExplodeAmount(from + (target - from) * ease(k));
      if (k < 1) requestAnimationFrame(step);
      else if (refit) this.animated(() => this.fit(undefined, false));
    };
    if (!animate || reduce) step();
    else requestAnimationFrame(step);
  }

  private applyExplodeAmount(amount: number): void {
    this.explodeAmount = amount;
    for (const mat of [this.meshMat, this.glassMat, this.edgeMat, this.hiddenEdgeMat, this.pickMat]) if (mat) mat.uniforms.uExplode.value = amount;
    this.modelBox()?.getBoundingSphere(this.modelSphere);
    this.requestRender();
  }

  /**
   * Visibility/Graphics overrides per element (replaces all previous ones): surface colour (0-255 RGB),
   * transparency 0-100 % and halftone. Elements not listed have none.
   */
  setOverrides(list: Iterable<{ index: number; color?: readonly [number, number, number] | null; transparency?: number; halftone?: boolean }>): void {
    const tex = this.overrideTex;
    if (!tex) return;
    const data = tex.image.data as Uint8Array;
    data.fill(0);
    for (const o of list) {
      const i = o.index * 4;
      if (i < 0 || i + 3 >= data.length) continue;
      let flags = Math.round((Math.min(100, Math.max(0, o.transparency ?? 0)) / 100) * 63);
      if (o.halftone) flags |= OVERRIDE_HALFTONE;
      if (o.color) {
        flags |= OVERRIDE_COLOR;
        data[i] = o.color[0];
        data[i + 1] = o.color[1];
        data[i + 2] = o.color[2];
      }
      data[i + 3] = flags;
    }
    tex.needsUpdate = true;
    this.requestRender();
  }

  /** Revit's Show Hidden Lines: edges behind other elements drawn dashed. */
  setHiddenLines(on: boolean): void {
    this.hiddenLinesOn = on;
    if (this.hiddenEdges) this.hiddenEdges.visible = on;
    this.requestRender();
  }

  /** Model edges on or off (Graphics → Edges). */
  setEdges(on: boolean): void {
    if (this.edges) this.edges.visible = on;
    this.edgesOn = on;
    this.requestRender();
  }

  /** Reveal Hidden Elements: hidden elements draw in the reveal colour and can be picked (to unhide). */
  setReveal(on: boolean): void {
    this.revealOn = on;
    for (const m of [this.meshMat, this.glassMat, this.edgeMat, this.hiddenEdgeMat, this.pickMat]) if (m) m.uniforms.uReveal.value = on ? 1 : 0;
    this.requestRender();
  }

  /** Revit ZF / ZE / ZX: fit the model, or the given elements, tight to their projected box. */
  fit(indices?: Iterable<number>, record = true): void {
    const box = indices ? this.boxOf(indices) : this.section ?? this.modelBox();
    if (!box) return;
    if (record) this.pushHistory();
    const center = box.getCenter(new Vector3());
    const dir = new Vector3().subVectors(this.camera.position, this.target).normalize();
    this.target.copy(center);
    this.camera.position.copy(this.target).addScaledVector(dir, Math.max(10, this.modelSphere.radius * 4));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
      const r = p.dot(right), u = p.dot(up);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    }
    this.frameHeight = Math.max(maxU - minU, (maxR - minR) / this.aspect(), 0.5) * 1.08;
    this.camera.zoom = 1;
    this.camera.near = -this.modelSphere.radius * 20 - 100;
    this.camera.far = this.modelSphere.radius * 20 + 100;
    this.updateFrustum();
    this.requestRender();
  }

  /** Revit ZR / ZZ: the next left-drag draws the region to zoom into. Esc cancels. */
  startZoomRegion(): void {
    this.zoomRegionArmed = true;
    this.canvas.style.cursor = 'zoom-in';
  }

  cancelZoomRegion(): void {
    if (!this.zoomRegionArmed) return;
    this.zoomRegionArmed = false;
    this.canvas.style.cursor = '';
    this.events.onZoomRegionEnd?.();
  }

  private zoomToRect(x0: number, y0: number, x1: number, y1: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const rw = Math.abs(x1 - x0), rh = Math.abs(y1 - y0);
    if (rw < 4 || rh < 4) return;
    this.pushHistory();
    const center = this.unproject((x0 + x1) / 2, (y0 + y1) / 2);
    const screenCenter = this.unproject(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const shift = center.sub(screenCenter);
    this.camera.position.add(shift);
    this.target.add(shift);
    this.camera.zoom = Math.min(5000, this.camera.zoom * Math.min(rect.width / rw, rect.height / rh));
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  private modelBox(): Box3 | null {
    if (!this.model) return null;
    if (this.explodeAmount > 0) return this.boxOf(this.model.elements.map((e) => e.index));
    const b = this.model.info.bounds;
    return new Box3(new Vector3(b[0], b[1], b[2]), new Vector3(b[3], b[4], b[5]));
  }

  private boxOf(indices: Iterable<number>): Box3 | null {
    if (!this.model) return null;
    const box = new Box3();
    let any = false;
    for (const i of indices) {
      if (!this.model.elements[i]) continue;
      const b = this.boundsOf(i);
      box.expandByPoint(new Vector3(b[0], b[1], b[2]));
      box.expandByPoint(new Vector3(b[3], b[4], b[5]));
      any = true;
    }
    return any ? box : null;
  }

  private orbitPivot(): Vector3 {
    const sel = this.selection.size ? this.boxOf(this.selection) : null;
    return (sel ?? this.section ?? this.modelBox())?.getCenter(new Vector3()) ?? this.target.clone();
  }

  private aspect(): number {
    const r = this.container.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }

  private updateFrustum(): void {
    const aspect = this.aspect();
    const h = this.frameHeight;
    this.camera.left = (-h * aspect) / 2;
    this.camera.right = (h * aspect) / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.updateFrustum();
    this.requestRender();
  }

  private unproject(clientX: number, clientY: number): Vector3 {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector3(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1, 0).unproject(this.camera);
  }

  private pan(dxPx: number, dyPx: number): void {
    const k = worldPerPixel(this.frameHeight, this.camera.zoom, this.canvas.getBoundingClientRect().height);
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const move = right.multiplyScalar(-dxPx * k).add(up.multiplyScalar(dyPx * k));
    this.camera.position.add(move);
    this.target.add(move);
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  /**
   * Temporary dimensions for one selected element: length, width and height along the edges of its
   * box that face the camera, with the value in millimetres. Redrawn every frame so they follow the view.
   */
  private drawTempDims(): void {
    const svg = this.dimEl;
    while (svg.firstChild) svg.firstChild.remove();
    if (this.selection.size !== 1 || !this.model) return;
    const e = this.model.elements[[...this.selection][0]];
    if (!e || this.hidden.has(e.index)) return;
    const [x0, y0, z0, x1, y1, z1] = this.boundsOf(e.index);
    const r = this.container.getBoundingClientRect();
    const view = this.camera.position.clone().sub(this.target);
    const zs = view.z > 0 ? z1 : z0; // the side facing the camera
    const xs = view.x > 0 ? x1 : x0;
    const yb = view.y >= 0 ? y0 : y1; // bottom edge unless looking up from below
    const P = (x: number, y: number, z: number) => {
      const p = this.toScreen(new Vector3(x, y, z));
      return [p.x - r.left, p.y - r.top] as [number, number];
    };
    const c = P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const cs = getComputedStyle(this.container);
    const color = cs.getPropertyValue('--select-window').trim() || '#2F7FD8';
    const labelBg = cs.getPropertyValue('--viewport').trim() || '#FFFFFF'; // label plate matches the canvas (Paper or Ink)
    const edges: Array<[[number, number], [number, number], number]> = [
      [P(x0, yb, zs), P(x1, yb, zs), x1 - x0],
      [P(xs, yb, z0), P(xs, yb, z1), z1 - z0],
      [P(xs, y0, zs), P(xs, y1, zs), y1 - y0],
    ];
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag: string, attrs: Record<string, string | number>) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      svg.appendChild(n);
      return n;
    };
    for (const [a, b, size] of edges) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 18 || size < 1e-4) continue; // edge seen end-on, or too small at this zoom
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let ox = m[0] - c[0], oy = m[1] - c[1];
      const ol = Math.hypot(ox, oy) || 1;
      ox = (ox / ol) * 16;
      oy = (oy / ol) * 16;
      const A = [a[0] + ox, a[1] + oy], B = [b[0] + ox, b[1] + oy];
      const stroke = { stroke: color, 'stroke-width': 1.2 };
      el('line', { x1: a[0], y1: a[1], x2: A[0], y2: A[1], ...stroke, 'stroke-opacity': 0.7 });
      el('line', { x1: b[0], y1: b[1], x2: B[0], y2: B[1], ...stroke, 'stroke-opacity': 0.7 });
      el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], ...stroke });
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      for (const p of [A, B]) {
        const t = 4.5;
        el('line', { x1: p[0] - Math.cos(ang + Math.PI / 4) * t, y1: p[1] - Math.sin(ang + Math.PI / 4) * t, x2: p[0] + Math.cos(ang + Math.PI / 4) * t, y2: p[1] + Math.sin(ang + Math.PI / 4) * t, ...stroke });
      }
      const label = Math.round(size * 1000).toLocaleString('en-IN');
      let deg = (ang * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      const w = label.length * 7 + 8;
      el('rect', { x: mx - w / 2, y: my - 16, width: w, height: 14, rx: 3, fill: labelBg, 'fill-opacity': 0.92, transform: `rotate(${deg} ${mx} ${my})` });
      const t = el('text', { x: mx, y: my - 5, 'text-anchor': 'middle', fill: color, 'font-size': 11.5, 'font-weight': 600, 'font-family': 'IBM Plex Sans, sans-serif', transform: `rotate(${deg} ${mx} ${my})` });
      t.textContent = label;
    }
  }

  /** Cursor at rest: zoom region, else + / − for Ctrl / Shift (add to / remove from the selection). */
  private idleCursor(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): string {
    return this.zoomRegionArmed ? this.cur.zoom : modifierCursor(e, this.cur);
  }

  /** Which view symbols are selected (drawn blue; a selected level shows temporary dimensions). */
  setAnnotationSelection(ids: Iterable<string>): void {
    this.annSelected = new Set(ids);
    this.requestRender();
  }

  /** View symbols in a client-space rectangle: window takes whole symbols, crossing anything touched. */
  annotationsInRect(x0: number, y0: number, x1: number, y1: number, crossing: boolean): string[] {
    if (!this.annotations.length) return [];
    const r = this.canvas.getBoundingClientRect();
    const [ax, bx] = [Math.min(x0, x1) - r.left, Math.max(x0, x1) - r.left];
    const [ay, by] = [Math.min(y0, y1) - r.top, Math.max(y0, y1) - r.top];
    const v = new Vector3();
    const project = (p: readonly [number, number, number]): [number, number] | null => {
      v.set(p[0], p[1], p[2]).project(this.camera);
      return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
    };
    const inside = (p: [number, number]) => p[0] >= ax && p[0] <= bx && p[1] >= ay && p[1] <= by;
    return annotationSegments(this.annotations, project)
      .filter((sgm) => (crossing ? segmentTouchesRect(sgm.a, sgm.b, ax, ay, bx, by) : inside(sgm.a) && inside(sgm.b)))
      .map((sgm) => sgm.id);
  }

  /** Live preview while a selection box is dragged (Revit): what would be picked glows blue. */
  private previewBox(x0: number, y0: number, x1: number, y1: number, crossing: boolean): void {
    if (!this.stateData || !this.state) return;
    for (const i of this.preselected) this.stateData[i * 4] &= ~STATE_PRESELECT;
    this.preselected = this.elementsInRect(x0, y0, x1, y1, crossing);
    for (const i of this.preselected) this.stateData[i * 4] |= STATE_PRESELECT;
    this.state.needsUpdate = true;
    this.annPreselect = new Set(this.annotationsInRect(x0, y0, x1, y1, crossing));
    this.requestRender();
  }

  private clearPreselect(): void {
    if (this.stateData && this.preselected.length) {
      for (const i of this.preselected) this.stateData[i * 4] &= ~STATE_PRESELECT;
      if (this.state) this.state.needsUpdate = true;
    }
    this.preselected = [];
    this.annPreselect = new Set();
    this.requestRender();
  }

  /**
   * Section tool: two clicks on a plane (plans: the level; elevations and sections: the view plane).
   * After the first click a rubber band follows the pointer, snapping to 15° steps on screen within 3°,
   * with the angle and length shown, as in Revit.
   */
  startLinePick(normal: readonly [number, number, number], through: readonly [number, number, number], onLine: (a: Vector3, b: Vector3) => void, snapDegrees = 15): void {
    const n = new Vector3(normal[0], normal[1], normal[2]).normalize();
    this.linePick = { plane: new Plane().setFromNormalAndCoplanarPoint(n, new Vector3(through[0], through[1], through[2])), first: null, cursor: null, preview: null, snap: snapDegrees, onLine };
    this.canvas.style.cursor = 'crosshair';
  }

  /** Where the pointer meets the line-pick plane, with the rubber band snapped on screen. */
  private linePoint(clientX: number, clientY: number): Vector3 | null {
    const lp = this.linePick;
    if (!lp) return null;
    const r = this.canvas.getBoundingClientRect();
    let sx = clientX - r.left, sy = clientY - r.top;
    let preview: LinePreview | null = null;
    if (lp.first) {
      const f = lp.first.clone().project(this.camera);
      const ax = ((f.x + 1) / 2) * r.width, ay = ((1 - f.y) / 2) * r.height;
      const dx = sx - ax, dy = sy - ay, len = Math.hypot(dx, dy);
      let angle = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360;
      const near = Math.round(angle / lp.snap) * lp.snap;
      const snapped = len > 12 && Math.abs(near - angle) <= 3;
      if (snapped) {
        angle = near % 360;
        const t = (angle * Math.PI) / 180;
        sx = ax + Math.cos(t) * len;
        sy = ay - Math.sin(t) * len;
      }
      preview = { a: [ax, ay], b: [sx, sy], angle, snapped, length: 0 };
    }
    this.raycaster.setFromCamera(new Vector2((sx / r.width) * 2 - 1, -(sy / r.height) * 2 + 1), this.camera);
    const p = this.raycaster.ray.intersectPlane(lp.plane, new Vector3());
    if (preview && p && lp.first) preview.length = p.distanceTo(lp.first);
    lp.preview = preview;
    return p;
  }

  /** Replaces the view symbols drawn over the model (see annotations.ts). */
  setAnnotations(list: Annotation[]): void {
    this.annotations = list;
    this.requestRender();
  }

  private drawAnnotationLayer(): void {
    if (!this.annotations.length && !this.linePick?.preview) {
      while (this.annEl.firstChild) this.annEl.firstChild.remove();
      return;
    }
    const r = this.container.getBoundingClientRect();
    const cs = getComputedStyle(this.container);
    const v = new Vector3();
    drawAnnotations(
      this.annEl,
      this.annotations,
      (p) => {
        v.set(p[0], p[1], p[2]).project(this.camera);
        if (v.z < -1 || v.z > 1) return null;
        return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
      },
      {
        line: cs.getPropertyValue('--text-secondary').trim() || '#555',
        text: cs.getPropertyValue('--text').trim() || '#222',
        plate: cs.getPropertyValue('--viewport').trim() || '#fff',
        hot: cs.getPropertyValue('--select-window').trim() || '#2F7FD8',
        font: cs.getPropertyValue('--font-sans').trim() || 'sans-serif',
      },
      { hot: this.annHot, selected: this.annSelected, preselect: this.annPreselect },
      { width: r.width, height: r.height },
      this.linePick?.preview ?? null,
    );
  }

  /** Shows or hides the orbit centre marker at a world point. */
  private showPivot(p: Vector3 | null): void {
    if (!p) {
      this.pivotEl.style.display = 'none';
      return;
    }
    const r = this.container.getBoundingClientRect();
    const s = this.toScreen(p);
    Object.assign(this.pivotEl.style, { display: 'block', left: `${s.x - r.left}px`, top: `${s.y - r.top}px` });
  }

  private orbit(dxPx: number, dyPx: number, pivot: Vector3): void {
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    // Upside down (after orbiting over the top or under the bottom): reverse left/right, as Revit does.
    const upsideDown = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).y < 0;
    const { position, target, rotation } = orbitAround(this.camera.position, this.target, pivot, UP, -dxPx * 0.008, -dyPx * 0.008, right, upsideDown);
    this.camera.position.copy(position);
    this.target.copy(target);
    // Rotate the camera's orientation directly (no lookAt): lookAt is undefined when looking straight
    // down or up, which is what froze the view at the top and bottom.
    this.camera.quaternion.premultiply(rotation);
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  private zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.unproject(clientX, clientY);
    this.camera.zoom = Math.min(5000, Math.max(0.01, this.camera.zoom * factor));
    this.camera.updateProjectionMatrix();
    const shift = zoomShift(before, this.unproject(clientX, clientY));
    this.camera.position.add(shift);
    this.target.add(shift);
    this.camera.updateMatrixWorld();
    this.requestRender();
  }

  // ------------------------------------------------------------------ input

  private showRect(x0: number, y0: number, x1: number, y1: number, dashed: boolean): void {
    const c = this.container.getBoundingClientRect();
    Object.assign(this.rectEl.style, {
      display: 'block',
      left: `${Math.min(x0, x1) - c.left}px`,
      top: `${Math.min(y0, y1) - c.top}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
      // AutoCAD convention: drag right (window, fully inside) blue and solid; drag left (crossing) green and dashed.
      borderStyle: dashed ? 'dashed' : 'solid',
      borderColor: dashed ? 'var(--select-crossing, #1F9E89)' : 'var(--select-window, #2F7FD8)',
      background: dashed ? 'color-mix(in srgb, var(--select-crossing, #1F9E89) 12%, transparent)' : 'color-mix(in srgb, var(--select-window, #2F7FD8) 12%, transparent)',
    });
  }

  /** The section-box grip under the pointer (within 14 px of its centre on screen), if any. */
  private gripAt(clientX: number, clientY: number): Mesh | null {
    if (!this.sbox || !this.gripsOn || this.nav2d) return null;
    this.gizmo.update(this.sbox, metresPerPixel(this.camera, this.canvas.getBoundingClientRect().height), this.hotGrip);
    let best: Mesh | null = null;
    let bestD = 14;
    for (const m of this.gizmo.targets) {
      const d = this.toScreen(m.position).distanceTo(new Vector2(clientX, clientY));
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  /** Screen position (client px) of a world point. */
  private toScreen(p: Vector3): Vector2 {
    const r = this.canvas.getBoundingClientRect();
    const v = p.clone().project(this.camera);
    return new Vector2(r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height);
  }

  /** Point on the horizontal plane through the box centre under the pointer (for rotation). */
  private planPoint(clientX: number, clientY: number, y: number): Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), new Vector3());
  }

  private bindInput(): void {
    const c = this.canvas;
    type DragMode = 'pan' | 'orbit' | 'select' | 'zoomRegion' | 'grip';
    type Drag = {
      mode: DragMode; x: number; y: number; sx: number; sy: number; pivot: Vector3; moved: boolean; recorded: boolean;
      grip?: GripData; start?: SectionBoxState; screenDir?: Vector2; startAngle?: number;
    };
    let drag: Drag | null = null;
    let lastMiddleDown = 0;
    let hoverQueued = false;
    let lastHover: PointerEvent | null = null;
    let previewQueued = false;
    let lastMove: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 };
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;

    const onDown = (e: PointerEvent) => {
      c.focus({ preventScroll: true });
      let mode: DragMode | null = null;
      if (e.button === 1) {
        const t = performance.now();
        if (t - lastMiddleDown < 300) {
          this.fit();
          lastMiddleDown = 0;
          e.preventDefault();
          return;
        }
        lastMiddleDown = t;
        mode = e.shiftKey ? 'orbit' : 'pan';
      } else if (e.button === 0) {
        const grip = !this.zoomRegionArmed && !e.altKey ? this.gripAt(e.clientX, e.clientY) : null;
        if (grip && this.sbox) {
          e.preventDefault();
          c.setPointerCapture(e.pointerId);
          const data = grip.userData as GripData;
          const start = cloneState(this.sbox);
          const d: Drag = { mode: 'grip', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pivot: this.target.clone(), moved: false, recorded: false, grip: data, start };
          if (data.kind === 'face') {
            // Pixels per metre along the face normal, on screen: drags follow the arrow at any view angle.
            const n = axesOf(start.angle)[data.axis].clone().multiplyScalar(data.sign);
            const h = [start.half.x, start.half.y, start.half.z][data.axis];
            const p0 = start.center.clone().addScaledVector(n, h);
            d.screenDir = this.toScreen(p0.clone().add(n)).sub(this.toScreen(p0));
          } else {
            const p = this.planPoint(e.clientX, e.clientY, start.center.y);
            d.startAngle = p ? Math.atan2(-(p.z - start.center.z), p.x - start.center.x) : 0;
          }
          drag = d;
          return;
        }
        if (this.zoomRegionArmed) mode = 'zoomRegion';
        else if (e.altKey) mode = e.shiftKey ? 'pan' : 'orbit';
        else mode = 'select';
      } else if (e.button === 2 && e.shiftKey) {
        mode = 'orbit'; // Revit: Shift + right-drag orbits (the right-click menu is not opened with Shift)
      }
      if (!mode) return;
      if (this.nav2d && mode === 'orbit') mode = 'pan'; // plan, elevation, section: no orbit
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      drag = { mode, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pivot: this.orbitPivot(), moved: false, recorded: false };
      if (mode === 'orbit') c.style.cursor = this.cur.orbit;
      else if (mode === 'pan') c.style.cursor = this.cur.pan;
    };

    const onMove = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CLICK_TOLERANCE_PX) drag.moved = true;
        if (!drag.moved) return;
        if (drag.mode === 'grip' && drag.start && drag.grip) {
          const st = drag.start;
          if (drag.grip.kind === 'face' && drag.screenDir) {
            const sd = drag.screenDir;
            const len2 = sd.lengthSq();
            if (len2 < 1e-6) return; // arrow points straight at the viewer: no usable direction
            const m = new Vector2(e.clientX - drag.sx, e.clientY - drag.sy);
            let delta = m.dot(sd) / len2;
            if (e.shiftKey) delta = snapDelta(st, drag.grip.axis, drag.grip.sign, delta, 0.1);
            this.sbox = moveFace(st, drag.grip.axis, drag.grip.sign, delta);
          } else if (drag.grip.kind === 'rotate') {
            const p = this.planPoint(e.clientX, e.clientY, st.center.y);
            if (!p) return;
            let a = st.angle + Math.atan2(-(p.z - st.center.z), p.x - st.center.x) - (drag.startAngle ?? 0);
            if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); // 15° steps
            this.sbox = { ...cloneState(st), angle: a };
          }
          this.applySectionBox(false);
          return;
        }
        if (drag.mode === 'pan' || drag.mode === 'orbit') {
          if (!drag.recorded) {
            this.pushHistory();
            drag.recorded = true;
          }
          if (drag.mode === 'pan') this.pan(dx, dy);
          else {
            this.orbit(dx, dy, drag.pivot);
            this.showPivot(drag.pivot);
          }
          this.navigating();
        } else {
          // Revit: left→right is a window (solid), right→left a crossing (dashed).
          this.showRect(drag.sx, drag.sy, e.clientX, e.clientY, drag.mode === 'select' && e.clientX < drag.sx);
          // Revit previews what the box will pick while you drag (once per frame).
          if (drag.mode === 'select' && !previewQueued) {
            previewQueued = true;
            const box = { x0: drag.sx, y0: drag.sy, e };
            requestAnimationFrame(() => {
              previewQueued = false;
              if (drag && drag.mode === 'select') this.previewBox(box.x0, box.y0, lastMove.clientX, lastMove.clientY, lastMove.clientX < box.x0);
            });
          }
          lastMove = e;
        }
        return;
      }
      if (this.linePick) {
        this.linePoint(e.clientX, e.clientY); // rubber band (after the first click)
        this.requestRender();
      }
      lastHover = e;
      this.lastPointer = [e.clientX, e.clientY];
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        if (!lastHover || drag) return;
        const grip = this.gripAt(lastHover.clientX, lastHover.clientY);
        if (grip !== this.hotGrip) {
          this.hotGrip = grip;
          c.style.cursor = grip ? ((grip.userData as GripData).kind === 'rotate' ? 'grab' : 'move') : this.idleCursor(e);
          this.requestRender();
        }
        this.setHover(grip ? null : this.pick(lastHover.clientX, lastHover.clientY));
      });
    };

    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      this.rectEl.style.display = 'none';
      this.showPivot(null);
      c.style.cursor = this.idleCursor(e);
      if (d.mode === 'grip') {
        if (d.moved && d.start && this.sbox) this.events.onSectionBoxEdit?.(d.start, cloneState(this.sbox));
        return;
      }
      if (d.mode === 'zoomRegion') {
        if (d.moved) this.zoomToRect(d.sx, d.sy, e.clientX, e.clientY);
        this.cancelZoomRegion();
      } else if (d.mode === 'select') {
        const mode = modeOf(e);
        if (!d.moved && this.linePick) {
          const p = this.linePoint(e.clientX, e.clientY);
          const lp = this.linePick;
          if (p && !lp.first) {
            lp.first = p;
          } else if (p && lp.first) {
            const a = lp.first;
            this.linePick = null;
            this.canvas.style.cursor = '';
            lp.onLine(a, p);
          }
          this.requestRender();
        } else if (!d.moved && this.pointPick) {
          const r = this.canvas.getBoundingClientRect();
          this.raycaster.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
          const p = this.raycaster.ray.intersectPlane(this.pointPick.plane, new Vector3());
          if (p) this.pointPick.onPoint(p);
        } else if (!d.moved) this.events.onPick?.(this.pick(e.clientX, e.clientY), mode);
        else {
          const crossing = e.clientX < d.sx;
          this.clearPreselect();
          this.events.onBoxSelect?.(this.elementsInRect(d.sx, d.sy, e.clientX, e.clientY, crossing), mode, crossing, this.annotationsInRect(d.sx, d.sy, e.clientX, e.clientY, crossing));
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.navigating();
      if (!wheelTimer) this.pushHistory(); // one history step per wheel gesture
      else clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => (wheelTimer = null), 400);
      this.zoomAt(e.clientX, e.clientY, wheelZoomFactor(e.deltaY, e.deltaMode));
    };
    const onLeave = () => this.setHover(null);
    const noMenu = (e: Event) => e.preventDefault();
    const noAutoscroll = (e: MouseEvent) => e.button === 1 && e.preventDefault();

    let over = false;
    const onKeyMod = (e: KeyboardEvent) => {
      if (over && !drag && (e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta')) c.style.cursor = this.idleCursor(e);
    };
    const onEnter = () => (over = true);
    const onOut = () => (over = false);
    window.addEventListener('keydown', onKeyMod);
    window.addEventListener('keyup', onKeyMod);
    c.addEventListener('pointerenter', onEnter);
    c.addEventListener('pointerleave', onOut);
    this.disposers.push(() => {
      window.removeEventListener('keydown', onKeyMod);
      window.removeEventListener('keyup', onKeyMod);
      c.removeEventListener('pointerenter', onEnter);
      c.removeEventListener('pointerleave', onOut);
    });
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', onLeave);
    c.addEventListener('wheel', onWheel, { passive: false });
    c.addEventListener('contextmenu', noMenu);
    c.addEventListener('mousedown', noAutoscroll);
    this.disposers.push(() => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('pointerleave', onLeave);
      c.removeEventListener('wheel', onWheel);
      c.removeEventListener('contextmenu', noMenu);
      c.removeEventListener('mousedown', noAutoscroll);
      if (wheelTimer) clearTimeout(wheelTimer);
    });
  }

  // ------------------------------------------------------------------ theme

  private watchTheme(): void {
    const mo = new MutationObserver(() => this.applyTheme());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onMq = () => this.applyTheme();
    mq?.addEventListener('change', onMq);
    this.disposers.push(() => {
      mo.disconnect();
      mq?.removeEventListener('change', onMq);
    });
  }

  /** Re-reads colour tokens; runs automatically when the theme changes. */
  /** Re-reads the theme from the container (used when the canvas theme changes). */
  refreshTheme(): void {
    this.applyTheme();
  }

  applyTheme(): void {
    this.cur = cursorsFor(isDarkColor(getComputedStyle(this.container).getPropertyValue('--viewport')));
    const t = readViewerTokens(this.container);
    const set = (m: ShaderMaterial | null, name: string, c: Rgba) => m?.uniforms[name]?.value.setRGB(c.r, c.g, c.b);
    const setMesh = (name: string, c: Rgba) => {
      set(this.meshMat, name, c);
      set(this.glassMat, name, c);
    };
    setMesh( 'uTop', t['concrete-top']);
    setMesh( 'uSide', t['concrete-side']);
    setMesh( 'uShade', t['concrete-shade']);
    setMesh( 'uSelTop', t['selected-top']);
    setMesh( 'uSelSide', t['selected-side']);
    setMesh( 'uSelShade', t['selected-shade']);
    setMesh( 'uHover', t['hover-outline']);
    setMesh( 'uPaper', t.viewport);
    // Cut faces read as solid concrete, a step darker than the top faces so a cut reads as a cut.
    // (0.14.0 meant to replace the old dark cap that looked like a hole, but that edit never applied;
    // fixed here, 0.25.0.)
    const top = t['concrete-top'], side = t['concrete-side'];
    setMesh('uCap', { r: (top.r + side.r) / 2, g: (top.g + side.g) / 2, b: (top.b + side.b) / 2, a: 1 });
    // Token values are sRGB; three's built-in materials convert from linear, so say which it is.
    this.capColors.base.setRGB(top.r * 0.8, top.g * 0.8, top.b * 0.8, SRGBColorSpace);
    this.capMat.color.copy(this.capColors.base);
    const sel = t['selected-side'], hov = t['hover-outline'];
    this.capColors.sel.setRGB(sel.r, sel.g, sel.b, SRGBColorSpace);
    this.capColors.hov.setRGB(top.r * 0.8 * 0.8 + hov.r * 0.2, top.g * 0.8 * 0.8 + hov.g * 0.2, top.b * 0.8 * 0.8 + hov.b * 0.2, SRGBColorSpace);
    const pre = getComputedStyle(this.container).getPropertyValue('--select-window').trim() || '#2F7FD8';
    this.capColors.pre.set(pre).lerp(this.capColors.base, 0.45);
    // Cut outlines: the drawing's cut-line colour, heavier-looking than the soft model edges.
    const cut = t['line-cut'];
    for (const ls of this.cutLines) (ls.material as LineBasicMaterial).color.setRGB(cut.r, cut.g, cut.b, SRGBColorSpace);
    const accent = getComputedStyle(this.container).getPropertyValue('--accent').trim() || '#D9761E';
    this.gizmo.setColors(new Color(accent), new Color(t['selected-top'].r, t['selected-top'].g, t['selected-top'].b));
    // Glass tint: a cool grey-blue, lighter on Paper, deeper on Ink.
    const dark = t.viewport.r + t.viewport.g + t.viewport.b < 1.5;
    setMesh('uGlass', dark ? { r: 0.45, g: 0.6, b: 0.72, a: 1 } : { r: 0.62, g: 0.76, b: 0.86, a: 1 });
    // Hidden line and wireframe draw edges as solid drawing lines; shaded styles use soft model edges.
    const edge = this.style === 'hiddenLine' ? t['line-cut'] : this.style === 'wireframe' ? t['line-projection'] : t['edge-model'];
    set(this.edgeMat, 'uEdge', edge);
    set(this.edgeMat, 'uEdgeSel', t['edge-selected']);
    set(this.edgeMat, 'uHover', t['hover-outline']);
    // Hidden lines: the projection line colour, clearly visible over the faces in front of them.
    set(this.hiddenEdgeMat, 'uEdge', t['line-projection']);
    set(this.hiddenEdgeMat, 'uEdgeSel', t['edge-selected']);
    set(this.hiddenEdgeMat, 'uHover', t['hover-outline']);
    if (this.hiddenEdgeMat) {
      this.hiddenEdgeMat.uniforms.uEdgeAlpha.value = 0.85;
      this.hiddenEdgeMat.uniforms.uEdgeSelAlpha.value = t['edge-selected'].a;
    }
    if (this.edgeMat) {
      this.edgeMat.uniforms.uEdgeAlpha.value = this.style === 'hiddenLine' || this.style === 'wireframe' ? 1 : edge.a;
      this.edgeMat.uniforms.uEdgeSelAlpha.value = t['edge-selected'].a;
    }
    this.requestRender();
  }

  // ----------------------------------------------------------------- render

  requestRender(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      const t0 = performance.now();
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(this.scene, this.camera);
      if (this.sbox && this.clipPlanes.length === 6 && this.capStencilMat) this.renderCaps();
      if (this.sbox && this.gripsOn) {
        const h = this.canvas.getBoundingClientRect().height;
        this.gizmo.update(this.sbox, metresPerPixel(this.camera, h), this.hotGrip);
        this.renderer.autoClear = false;
        this.renderer.render(this.gizmoScene, this.camera);
        this.renderer.autoClear = true;
      } else this.gizmo.update(null, 1);
      this.lastFrameMs = performance.now() - t0;
      this.drawTempDims();
      this.drawAnnotationLayer();
      this.events.onCamera?.(this.camera.quaternion);
    });
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.clearModel();
    this.pickTarget.dispose();
    this.gizmo.dispose();
    this.renderer.dispose();
    this.canvas.remove();
    this.rectEl.remove();
    this.pivotEl.remove();
    this.dimEl.remove();
    this.annEl.remove();
    clearTimeout(this.navTimer);
    this.animToken++;
  }
}

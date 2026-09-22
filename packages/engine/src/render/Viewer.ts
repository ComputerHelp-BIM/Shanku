import {
  Box3,
  BufferAttribute,
  Color,
  DoubleSide,
  FrontSide,
  Raycaster,
  Vector2,
  BufferGeometry,
  LineSegments,
  Matrix4,
  Mesh,
  OrthographicCamera,
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
import { readViewerTokens, type Rgba } from './cssColor';
import {
  DISPLAY_CONSISTENT,
  DISPLAY_HIDDEN_LINE,
  DISPLAY_SHADED,
  DISPLAY_WIREFRAME,
  STATE_GLASS,
  STATE_HIDDEN,
  STATE_HOVER,
  STATE_SELECTED,
  createEdgeMaterial,
  createModelMaterial,
  createPickMaterial,
  createStateTexture,
} from './materials';
import { decodePickId } from './pickId';
import { SectionGizmo, aabbOf, axesOf, cloneState, metresPerPixel, moveFace, planesOf, snapDelta, type GripData, type SectionBoxState } from './sectionBox';

export type ViewName = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right';
/** Revit visual styles: SD, CO, HL, WF. */
export type DisplayStyle = 'shaded' | 'consistent' | 'hiddenLine' | 'wireframe';
/** replace = plain click; add = Ctrl; remove = Shift (Revit). */
export type SelectMode = 'replace' | 'add' | 'remove';

export interface ViewerEvents {
  onPick?: (index: number | null, mode: SelectMode) => void;
  /** Drag-box result. `crossing` is true for right-to-left drags. */
  onBoxSelect?: (indices: number[], mode: SelectMode, crossing: boolean) => void;
  onHover?: (index: number | null) => void;
  /** Fired when zoom-region mode ends (done or cancelled). */
  onZoomRegionEnd?: () => void;
  /** Section box turned on/off or edited. */
  onSectionBoxChange?: (active: boolean) => void;
}

interface CameraState {
  position: Vector3;
  target: Vector3;
  zoom: number;
  frameHeight: number;
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
  private sbox: SectionBoxState | null = null;
  private sboxUndo: SectionBoxState[] = [];
  private gizmo = new SectionGizmo();
  private gizmoScene = new Scene();
  private hotGrip: Mesh | null = null;
  private raycaster = new Raycaster();
  private history: CameraState[] = [];
  private zoomRegionArmed = false;
  private frameRequested = false;
  private disposers: Array<() => void> = [];
  private modelSphere = new Sphere(new Vector3(), 10);
  private rectEl: HTMLDivElement;
  lastFrameMs = 0;

  constructor(private container: HTMLElement, private events: ViewerEvents = {}) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); // the container's --viewport background shows through
    this.renderer.localClippingEnabled = true;
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
      border: '1px solid var(--accent)',
      background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    });
    container.appendChild(this.rectEl);

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

  setModel(model: ParsedModel | null): void {
    this.clearModel();
    this.model = model;
    this.history = [];
    if (!model) return this.requestRender();

    this.state = createStateTexture(model.elements.length);
    this.stateData = this.state.image.data as Uint8Array;
    this.meshMat = createModelMaterial(this.state);
    // Second pass for windows and doors: same geometry, transparent, drawn after the opaque model.
    this.glassMat = createModelMaterial(this.state);
    this.glassMat.uniforms.uPass.value = 1;
    this.glassMat.transparent = true;
    this.glassMat.depthWrite = false;
    this.glassMat.clippingPlanes = this.clipPlanes;
    model.elements.forEach((e) => {
      if (e.ifcClass === 'IfcWindow' || e.ifcClass === 'IfcDoor') this.stateData![e.index * 4] |= STATE_GLASS;
    });
    this.edgeMat = createEdgeMaterial(this.state);
    this.pickMat = createPickMaterial(this.state);
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

    const glassMesh = new Mesh(geo, this.glassMat);
    glassMesh.frustumCulled = false;
    glassMesh.renderOrder = 2;
    this.scene.add(this.mesh, this.edges, glassMesh);
    this.pickScene.add(pickMesh);
    this.objects = [this.mesh, this.edges, glassMesh, pickMesh];
    this.modelBox()?.getBoundingSphere(this.modelSphere);
    this.setDisplayStyle(this.style);
    this.orient('iso');
    this.fit(undefined, false);
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
    this.edgeMat?.dispose();
    this.pickMat?.dispose();
    this.state?.dispose();
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
    this.events.onHover?.(index);
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
      const b = el.bounds;
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
    this.sboxUndo = [];
    this.applySectionBox(true);
  }

  /** Undo the last grip drag or rotation of the section box. Returns false when there is nothing to undo. */
  undoSectionBox(): boolean {
    const prev = this.sboxUndo.pop();
    if (!prev || !this.sbox) return false;
    this.sbox = prev;
    this.applySectionBox(false);
    return true;
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

  // ----------------------------------------------------------------- camera

  private snapshot(): CameraState {
    return { position: this.camera.position.clone(), target: this.target.clone(), zoom: this.camera.zoom, frameHeight: this.frameHeight };
  }

  private pushHistory(): void {
    this.history.push(this.snapshot());
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }

  /** Revit ZP / ZC: back to the previous pan/zoom. Returns false when there is none. */
  previousView(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.camera.position.copy(s.position);
    this.target.copy(s.target);
    this.camera.zoom = s.zoom;
    this.frameHeight = s.frameHeight;
    this.camera.lookAt(this.target);
    this.updateFrustum();
    this.requestRender();
    return true;
  }

  /** Revit Home: default orientation, whole model in view. */
  home(): void {
    this.pushHistory();
    this.orient('iso');
    this.fit(undefined, false);
  }

  setView(view: ViewName): void {
    this.pushHistory();
    this.orient(view);
    this.fit(undefined, false);
  }

  private orient(view: ViewName): void {
    const dirs: Record<ViewName, [number, number, number]> = {
      iso: [1, 0.82, 1],
      top: [0, 1, 0.0001],
      front: [0, 0, 1],
      back: [0, 0, -1],
      left: [-1, 0, 0],
      right: [1, 0, 0],
    };
    const d = new Vector3(...dirs[view]).normalize();
    this.camera.position.copy(this.target).addScaledVector(d, Math.max(10, this.modelSphere.radius * 4));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
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
    const b = this.model.info.bounds;
    return new Box3(new Vector3(b[0], b[1], b[2]), new Vector3(b[3], b[4], b[5]));
  }

  private boxOf(indices: Iterable<number>): Box3 | null {
    if (!this.model) return null;
    const box = new Box3();
    let any = false;
    for (const i of indices) {
      const b = this.model.elements[i]?.bounds;
      if (!b) continue;
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

  private orbit(dxPx: number, dyPx: number, pivot: Vector3): void {
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const { position, target, rotation } = orbitAround(this.camera.position, this.target, pivot, UP, -dxPx * 0.008, -dyPx * 0.008, right);
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
      borderStyle: dashed ? 'dashed' : 'solid',
    });
  }

  /** The section-box grip under the pointer (within 14 px of its centre on screen), if any. */
  private gripAt(clientX: number, clientY: number): Mesh | null {
    if (!this.sbox) return null;
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
      }
      if (!mode) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      drag = { mode, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pivot: this.orbitPivot(), moved: false, recorded: false };
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
          else this.orbit(dx, dy, drag.pivot);
        } else {
          // Revit: left→right is a window (solid), right→left a crossing (dashed).
          this.showRect(drag.sx, drag.sy, e.clientX, e.clientY, drag.mode === 'select' && e.clientX < drag.sx);
        }
        return;
      }
      lastHover = e;
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        if (!lastHover || drag) return;
        const grip = this.gripAt(lastHover.clientX, lastHover.clientY);
        if (grip !== this.hotGrip) {
          this.hotGrip = grip;
          c.style.cursor = grip ? ((grip.userData as GripData).kind === 'rotate' ? 'grab' : 'move') : '';
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
      if (d.mode === 'grip') {
        if (d.moved && d.start) this.sboxUndo.push(d.start);
        return;
      }
      if (d.mode === 'zoomRegion') {
        if (d.moved) this.zoomToRect(d.sx, d.sy, e.clientX, e.clientY);
        this.cancelZoomRegion();
      } else if (d.mode === 'select') {
        const mode = modeOf(e);
        if (!d.moved) this.events.onPick?.(this.pick(e.clientX, e.clientY), mode);
        else {
          const crossing = e.clientX < d.sx;
          this.events.onBoxSelect?.(this.elementsInRect(d.sx, d.sy, e.clientX, e.clientY, crossing), mode, crossing);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!wheelTimer) this.pushHistory(); // one history step per wheel gesture
      else clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => (wheelTimer = null), 400);
      this.zoomAt(e.clientX, e.clientY, wheelZoomFactor(e.deltaY, e.deltaMode));
    };
    const onLeave = () => this.setHover(null);
    const noMenu = (e: Event) => e.preventDefault();
    const noAutoscroll = (e: MouseEvent) => e.button === 1 && e.preventDefault();

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
  applyTheme(): void {
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
    // Cut faces: the shade colour taken a step darker, so caps read as solid section.
    const cap = t['concrete-shade'];
    setMesh( 'uCap', { r: cap.r * 0.78, g: cap.g * 0.78, b: cap.b * 0.78, a: 1 });
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
      if (this.sbox) {
        const h = this.canvas.getBoundingClientRect().height;
        this.gizmo.update(this.sbox, metresPerPixel(this.camera, h), this.hotGrip);
        this.renderer.autoClear = false;
        this.renderer.render(this.gizmoScene, this.camera);
        this.renderer.autoClear = true;
      } else this.gizmo.update(null, 1);
      this.lastFrameMs = performance.now() - t0;
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
  }
}

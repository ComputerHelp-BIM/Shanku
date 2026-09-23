import {
  Box3,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Camera,
} from 'three';

/** A section box: centre, half-extents along its own axes, and rotation about the vertical (Y) axis. */
export interface SectionBoxState {
  center: Vector3;
  half: Vector3;
  /** Radians about world Y (Revit allows rotation in plan only). */
  angle: number;
}

/** A section box state from plain numbers (world metres), e.g. a plan's view range. */
export function boxState(center: readonly [number, number, number], half: readonly [number, number, number], angle = 0): SectionBoxState {
  return { center: new Vector3(center[0], center[1], center[2]), half: new Vector3(half[0], half[1], half[2]), angle };
}

export const MIN_HALF = 0.1; // m: a face cannot be dragged closer than 0.2 m to its opposite

export const cloneState = (s: SectionBoxState): SectionBoxState => ({ center: s.center.clone(), half: s.half.clone(), angle: s.angle });

/** The box's local X, Y, Z axes in world space. */
export function axesOf(angle: number): [Vector3, Vector3, Vector3] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [new Vector3(c, 0, -s), new Vector3(0, 1, 0), new Vector3(s, 0, c)];
}

/** Six clipping planes keeping the inside of the box (three.js keeps n·p + d >= 0). */
export function planesOf(st: SectionBoxState): Plane[] {
  const out: Plane[] = [];
  const h = [st.half.x, st.half.y, st.half.z];
  axesOf(st.angle).forEach((n, i) => {
    const nc = n.dot(st.center);
    out.push(new Plane(n.clone(), -nc + h[i]), new Plane(n.clone().negate(), nc + h[i]));
  });
  return out;
}

export function cornersOf(st: SectionBoxState): Vector3[] {
  const [ax, ay, az] = axesOf(st.angle);
  const pts: Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(st.center.clone().addScaledVector(ax, sx * st.half.x).addScaledVector(ay, sy * st.half.y).addScaledVector(az, sz * st.half.z));
  }
  return pts;
}

/** World-aligned bounds of the (possibly rotated) box. */
export function aabbOf(st: SectionBoxState): Box3 {
  return new Box3().setFromPoints(cornersOf(st));
}

export function contains(st: SectionBoxState, p: Vector3, eps = 1e-6): boolean {
  const d = p.clone().sub(st.center);
  const h = [st.half.x, st.half.y, st.half.z];
  return axesOf(st.angle).every((a, i) => Math.abs(a.dot(d)) <= h[i] + eps);
}

/**
 * Moves one face along its outward normal by `delta` metres; the opposite face stays put.
 * axis 0/1/2 = local X/Y/Z, sign +1/-1 = which face.
 */
export function moveFace(st: SectionBoxState, axis: 0 | 1 | 2, sign: 1 | -1, delta: number): SectionBoxState {
  const out = cloneState(st);
  const key = (['x', 'y', 'z'] as const)[axis];
  const h0 = st.half[key];
  const h1 = Math.max(MIN_HALF, h0 + delta / 2);
  out.half[key] = h1;
  out.center.addScaledVector(axesOf(st.angle)[axis], sign * (h1 - h0));
  return out;
}

/** Snaps a face drag so the face lands on a multiple of `step` metres along its normal. */
export function snapDelta(st: SectionBoxState, axis: 0 | 1 | 2, sign: 1 | -1, delta: number, step: number): number {
  const n = axesOf(st.angle)[axis];
  const key = (['x', 'y', 'z'] as const)[axis];
  const face = n.dot(st.center) + sign * st.half[key]; // face position along n
  const target = face + sign * delta;
  return (Math.round(target / step) * step - face) * sign;
}

type GripData = { kind: 'face'; axis: 0 | 1 | 2; sign: 1 | -1 } | { kind: 'rotate' };

const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along z
  [0, 2], [1, 3], [4, 6], [5, 7], // along y
  [0, 4], [1, 5], [2, 6], [3, 7], // along x
];

/**
 * The on-screen gizmo: box outline, six arrow grips (drag to move a face) and a rotate ring.
 * Drawn after the model without depth test so it is always reachable; sized in pixels.
 */
export class SectionGizmo {
  readonly group = new Group();
  private outline: LineSegments;
  private grips: Mesh[] = [];
  private ring: Mesh;
  private lineMat = new LineBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false });
  private gripMat = new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false });
  private hotMat = new MeshBasicMaterial({ depthTest: false });

  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array(EDGES.length * 6), 3));
    this.outline = new LineSegments(g, this.lineMat);
    this.outline.renderOrder = 10;
    this.group.add(this.outline);
    const cone = new ConeGeometry(0.42, 1.1, 20);
    for (const axis of [0, 1, 2] as const) {
      for (const sign of [1, -1] as const) {
        const m = new Mesh(cone, this.gripMat);
        m.userData = { kind: 'face', axis, sign } satisfies GripData;
        m.renderOrder = 11;
        this.grips.push(m);
        this.group.add(m);
      }
    }
    this.ring = new Mesh(new TorusGeometry(0.7, 0.16, 10, 36), this.gripMat);
    this.ring.userData = { kind: 'rotate' } satisfies GripData;
    this.ring.renderOrder = 11;
    this.group.add(this.ring);
    this.group.visible = false;
  }

  setColors(accent: Color, hot: Color): void {
    this.lineMat.color.copy(accent);
    this.gripMat.color.copy(accent);
    this.hotMat.color.copy(hot);
  }

  /** Places everything for this state; `px` is metres per screen pixel so grips stay ~14 px. */
  update(st: SectionBoxState | null, px: number, hot: Object3DLike | null = null): void {
    this.group.visible = !!st;
    if (!st) return;
    const c = cornersOf(st);
    const pos = this.outline.geometry.getAttribute('position') as Float32BufferAttribute;
    EDGES.forEach(([a, b], i) => {
      pos.setXYZ(i * 2, c[a].x, c[a].y, c[a].z);
      pos.setXYZ(i * 2 + 1, c[b].x, c[b].y, c[b].z);
    });
    pos.needsUpdate = true;
    this.outline.geometry.computeBoundingSphere();
    const axes = axesOf(st.angle);
    const h = [st.half.x, st.half.y, st.half.z];
    const size = 14 * px;
    const up = new Vector3(0, 1, 0);
    for (const m of this.grips) {
      const { axis, sign } = m.userData as { axis: 0 | 1 | 2; sign: 1 | -1 };
      const dir = axes[axis].clone().multiplyScalar(sign);
      m.position.copy(st.center).addScaledVector(dir, h[axis] + size * 0.9);
      m.quaternion.copy(new Quaternion().setFromUnitVectors(up, dir));
      m.scale.setScalar(size);
      m.material = m === hot ? this.hotMat : this.gripMat;
    }
    // Rotate ring: above the top face, off its +X/+Z corner, lying flat.
    this.ring.position.copy(st.center).addScaledVector(axes[0], h[0]).addScaledVector(axes[2], h[2]).addScaledVector(axes[1], h[1] + size * 0.2);
    this.ring.rotation.set(Math.PI / 2, 0, 0);
    this.ring.scale.setScalar(size);
    this.ring.material = this.ring === hot ? this.hotMat : this.gripMat;
  }

  /** Grip meshes for raycasting. */
  get targets(): Mesh[] {
    return [...this.grips, this.ring];
  }

  dispose(): void {
    this.outline.geometry.dispose();
    this.grips[0]?.geometry.dispose();
    this.ring.geometry.dispose();
    this.lineMat.dispose();
    this.gripMat.dispose();
    this.hotMat.dispose();
  }
}

type Object3DLike = Mesh;
export type { GripData };
/** Metres per pixel for an orthographic camera. */
export function metresPerPixel(camera: Camera & { top: number; bottom: number; zoom: number }, heightPx: number): number {
  return (camera.top - camera.bottom) / camera.zoom / Math.max(1, heightPx);
}

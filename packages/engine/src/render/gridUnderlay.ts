/**
 * The grid under the model (as in CAD in 2D views, as in Blender or Godot in 3D): lines every 10ⁿ metres, the
 * spacing chosen from the zoom so they stay ≥ ~8 px apart (minor lines fade in), every tenth line stronger, and
 * the origin's axes coloured (Blender's: X red, the other axis green). In 2D it fills the view on the view's
 * plane; in 3D it lies on the ±0 ground and fades with distance. It is its own scene, drawn before the model,
 * so it is never picked, snapped to or clipped, and the model draws over it in every visual style.
 */
import { CustomBlending, DoubleSide, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, Quaternion, Scene, ShaderMaterial, Vector3, type Camera } from 'three';

export interface GridSpec {
  /** '2d': flat, fills the view; '3d': the ground, fading with distance. */
  mode: '2d' | '3d';
  /** Where the lines' zero is (the origin's axes cross here), viewer metres. */
  origin: [number, number, number];
  /** The plane's two axes (unit vectors). */
  u: [number, number, number];
  v: [number, number, number];
}

const VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uOrigin; uniform vec3 uU; uniform vec3 uV;
uniform float uMinor; uniform float uMinorAlpha; uniform float uMajorAlpha;
uniform vec3 uLine; uniform vec3 uAxisU; uniform vec3 uAxisV;
uniform vec3 uCenter; uniform float uFadeR;
varying vec3 vW;
float line(float c, float step) {
  float w = fwidth(c);
  float d = abs(fract(c / step + 0.5) - 0.5) * step;
  return 1.0 - smoothstep(0.0, w, d);
}
void main() {
  vec3 d = vW - uOrigin;
  float a = dot(d, uU), b = dot(d, uV);
  float minor = max(line(a, uMinor), line(b, uMinor)) * uMinorAlpha;
  float major = max(line(a, uMinor * 10.0), line(b, uMinor * 10.0)) * uMajorAlpha;
  vec4 col = vec4(uLine, max(minor, major));
  float ax = 1.0 - smoothstep(0.0, fwidth(b) * 1.5, abs(b));
  float ay = 1.0 - smoothstep(0.0, fwidth(a) * 1.5, abs(a));
  col = mix(col, vec4(uAxisU, 0.85), ax);
  col = mix(col, vec4(uAxisV, 0.85), ay);
  if (uFadeR > 0.0) col.a *= 1.0 - smoothstep(uFadeR * 0.35, uFadeR, length(vW - uCenter));
  if (col.a < 0.004) discard;
  // premultiplied: the canvas composites premultiplied colour (plain colour came out near white)
  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

/**
 * The grid's spacing for a zoom: the minor spacing is 10ⁿ m with lines ≥ 8 px apart; minor lines fade in between
 * 8 and 32 px (alpha 0…1); every tenth line is a major line.
 */
export function gridSpacing(metresPerPixel: number): { minor: number; major: number; minorFade: number } {
  const minor = Math.pow(10, Math.ceil(Math.log10(Math.max(metresPerPixel * 8, 1e-4))));
  const px = minor / metresPerPixel;
  return { minor, major: minor * 10, minorFade: Math.min(1, Math.max(0, (px - 8) / 24)) };
}

/** Blender's axis colours. */
const AXIS_X: [number, number, number] = [0.86, 0.27, 0.3];
const AXIS_Y: [number, number, number] = [0.42, 0.7, 0.26];

export class GridUnderlay {
  readonly scene = new Scene();
  private mesh: Mesh;
  private mat: ShaderMaterial;
  private spec: GridSpec | null = null;
  private on = false;

  constructor() {
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uOrigin: { value: new Vector3() }, uU: { value: new Vector3(1, 0, 0) }, uV: { value: new Vector3(0, 0, -1) },
        uMinor: { value: 1 }, uMinorAlpha: { value: 0.2 }, uMajorAlpha: { value: 0.35 },
        uLine: { value: new Vector3(0.5, 0.5, 0.5) }, uAxisU: { value: new Vector3(...AXIS_X) }, uAxisV: { value: new Vector3(...AXIS_Y) },
        uCenter: { value: new Vector3() }, uFadeR: { value: 0 },
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      // drawn in the opaque pass first, blended onto the (transparent) cleared canvas
      transparent: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** The grid for the active view (null: none for this view). */
  setSpec(spec: GridSpec | null): void {
    this.spec = spec;
    if (!spec) return;
    const u = this.mat.uniforms;
    (u.uOrigin.value as Vector3).set(...spec.origin);
    (u.uU.value as Vector3).set(...spec.u).normalize();
    (u.uV.value as Vector3).set(...spec.v).normalize();
    // the plane's own axes: a vertical plane's second axis is up, so its lines are levels — colour that one green too
    const n = new Vector3(...spec.u).cross(new Vector3(...spec.v)).normalize();
    this.mesh.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n));
    this.mat.uniforms.uFadeR.value = 0;
  }
  setVisible(on: boolean): void {
    this.on = on;
  }
  get visible(): boolean {
    return this.on && !!this.spec;
  }
  /** Line colour from the theme (the projection line colour). */
  setLineColor(r: number, g: number, b: number): void {
    (this.mat.uniforms.uLine.value as Vector3).set(r, g, b);
  }

  /** Per frame: spacing from the zoom, the quad around what the camera looks at, the 3D fade. */
  update(camera: Camera, metresPerPixel: number, target: Vector3, viewSpan: number, modelRadius: number): void {
    const s = this.spec;
    if (!s) return;
    const u = this.mat.uniforms;
    // minor spacing 10ⁿ m with lines ≥ 8 px apart; minor lines fade in between 8 and 32 px
    const sp = gridSpacing(metresPerPixel);
    u.uMinor.value = sp.minor;
    u.uMinorAlpha.value = 0.22 * sp.minorFade;
    u.uMajorAlpha.value = 0.4;
    // the quad: centred where the camera looks, projected onto the plane; big enough to fill the view
    const o = new Vector3(...s.origin);
    const n = new Vector3(...s.u).cross(new Vector3(...s.v)).normalize();
    // centred on the middle of the screen: in 2D that is where the camera is (target and camera can part when
    // panning); in 3D, what the camera orbits
    const at = s.mode === '2d' ? camera.position : target;
    const c = at.clone().sub(n.clone().multiplyScalar(at.clone().sub(o).dot(n)));
    this.mesh.position.copy(c);
    if (s.mode === '3d') {
      const r = Math.max(modelRadius * 2.5, viewSpan * 1.5, 20);
      this.mesh.scale.set(r * 2, r * 2, 1);
      u.uFadeR.value = r;
      (u.uCenter.value as Vector3).copy(c);
    } else {
      const size = viewSpan * 3 + 10;
      this.mesh.scale.set(size, size, 1);
      u.uFadeR.value = 0;
    }
    camera.updateMatrixWorld();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

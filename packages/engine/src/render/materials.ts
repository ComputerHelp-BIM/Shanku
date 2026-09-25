import { Color, DataTexture, FloatType, GLSL3, NotEqualStencilFunc, RGBAFormat, ReplaceStencilOp, ShaderMaterial, UnsignedByteType, Vector2, Vector3 } from 'three';

/** Per-element state flags stored in the red channel of the state texture. */
export const STATE_SELECTED = 1;
export const STATE_HOVER = 2;
export const STATE_HIDDEN = 4;
/** Windows and doors: drawn in the transparent (glass) pass. */
export const STATE_GLASS = 8;
/** Would be picked by the selection box being dragged (Revit's live window / crossing preview). */
export const STATE_PRESELECT = 16;

export const STATE_TEXTURE_WIDTH = 2048;


/** A 1-element override texture for materials created without one (no overrides). */
export const EMPTY_OVERRIDE = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
EMPTY_OVERRIDE.needsUpdate = true;

/** Per-element Visibility/Graphics overrides, same layout as the state texture (see vOverride). */
export function createOverrideTexture(elementCount: number): DataTexture {
  return createStateTexture(elementCount);
}
export const OVERRIDE_COLOR = 128;
export const OVERRIDE_HALFTONE = 64;

/** A 1-element offset texture for materials with no exploded view (all offsets zero). */
export const EMPTY_OFFSET = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
EMPTY_OFFSET.needsUpdate = true;

/**
 * Exploded-view offsets per element (xyz in metres, same texel layout as the state texture),
 * scaled in the vertex shaders by uExplode (0 assembled, 1 fully exploded).
 */
export function createOffsetTexture(offsets: Float32Array, elementCount: number): DataTexture {
  const height = Math.max(1, Math.ceil(elementCount / STATE_TEXTURE_WIDTH));
  const data = new Float32Array(STATE_TEXTURE_WIDTH * height * 4);
  for (let i = 0; i < elementCount; i++) {
    data[i * 4] = offsets[i * 3];
    data[i * 4 + 1] = offsets[i * 3 + 1];
    data[i * 4 + 2] = offsets[i * 3 + 2];
  }
  const tex = new DataTexture(data, STATE_TEXTURE_WIDTH, height, RGBAFormat, FloatType);
  tex.needsUpdate = true;
  return tex;
}

/** Uniforms every model material carries for the exploded view. */
const explodeUniforms = () => ({ uOffset: { value: EMPTY_OFFSET }, uExplode: { value: 0 } });

export function createStateTexture(elementCount: number): DataTexture {
  const height = Math.max(1, Math.ceil(elementCount / STATE_TEXTURE_WIDTH));
  const data = new Uint8Array(STATE_TEXTURE_WIDTH * height * 4);
  const tex = new DataTexture(data, STATE_TEXTURE_WIDTH, height, RGBAFormat, UnsignedByteType);
  tex.needsUpdate = true;
  return tex;
}

// Shared vertex prelude: reads this element's state from the texture.
const STATE_VERTEX = /* glsl */ `
in float aElement;
uniform sampler2D uState;
uniform int uStateWidth;
uniform int uReveal;
uniform sampler2D uOverride;
// Exploded view: this element's offset (world metres) times the amount.
uniform sampler2D uOffset;
uniform float uExplode;
vec3 gOffset = vec3(0.0);
flat out int vState;
flat out int vId;
// Visibility/Graphics override: rgb = colour, a = packed (bit 7 colour set, bit 6 halftone, bits 0-5 transparency 0-63).
flat out vec4 vOverride;
int readState() {
  int id = int(aElement + 0.5);
  vId = id;
  ivec2 c = ivec2(id % uStateWidth, id / uStateWidth);
  vOverride = texelFetch(uOverride, c, 0);
  if (uExplode > 0.0) gOffset = texelFetch(uOffset, c, 0).xyz * uExplode;
  return int(texelFetch(uState, c, 0).r * 255.0 + 0.5);
}
`;

// Hidden elements vanish, unless Reveal Hidden Elements is on (then they draw in the reveal colour).
const HIDE = /* glsl */ `if ((vState & ${STATE_HIDDEN}) != 0 && uReveal == 0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }`;

/** Display styles, as Revit's SD / CO / HL / WF. */
export const DISPLAY_SHADED = 0;
export const DISPLAY_CONSISTENT = 1;
export const DISPLAY_HIDDEN_LINE = 2;
export const DISPLAY_WIREFRAME = 3;
/** Revit's Realistic: sun and sky lighting on a concrete finish, instead of flat face colours. */
export const DISPLAY_REALISTIC = 4;

/** Sun direction (towards the sun, world Y up): from the south-east, about 50° up. */
export const SUN_DIRECTION = new Vector3(0.55, 0.78, 0.3).normalize();

// three.js clipping chunks, used by the section box.
const CLIP_V_PARS = '#include <clipping_planes_pars_vertex>';
const CLIP_V = 'vec4 mvPosition = modelViewMatrix * vec4(position + gOffset, 1.0);\n#include <clipping_planes_vertex>';
const CLIP_F_PARS = '#include <clipping_planes_pars_fragment>';
const CLIP_F = '#include <clipping_planes_fragment>';

export function createModelMaterial(state: DataTexture, overrideTex: DataTexture = EMPTY_OVERRIDE): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    clipping: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    uniforms: {
      ...explodeUniforms(),
      uState: { value: state },
      uStateWidth: { value: STATE_TEXTURE_WIDTH },
      uReveal: { value: 0 },
      uOverride: { value: overrideTex },
      uRevealColor: { value: new Color(0.71, 0.09, 0.62) }, // Revit's reveal magenta
      uTop: { value: new Color() },
      uSide: { value: new Color() },
      uShade: { value: new Color() },
      uSelTop: { value: new Color() },
      uSelSide: { value: new Color() },
      uSelShade: { value: new Color() },
      uHover: { value: new Color() },
      uPreselect: { value: new Color(0.18, 0.5, 0.85) },
      uPaper: { value: new Color() },
      // Section-box caps: back faces seen through a cut are painted flat, so cut members read solid.
      uCap: { value: new Color() },
      // 0 = opaque pass (skips glass), 1 = glass pass (only glass, see-through)
      uPass: { value: 0 },
      uGlass: { value: new Color() },
      uMode: { value: DISPLAY_SHADED },
      // Horizontal "light" direction in the XZ plane: faces turned toward it get the lit side colour.
      uLight: { value: new Vector2(0.8, 0.6).normalize() },
      // Realistic: a light fair-faced concrete finish lit by the sun and the sky.
      uSun: { value: SUN_DIRECTION.clone() },
      uConcrete: { value: new Color(0.74, 0.72, 0.68) },
    },
    vertexShader: /* glsl */ `
${STATE_VERTEX}
${CLIP_V_PARS}
out vec3 vNormalW;
void main() {
  vState = readState();
  vNormalW = normalize(mat3(modelMatrix) * normal);
  ${CLIP_V}
  gl_Position = projectionMatrix * mvPosition;
  ${HIDE}
}`,
    fragmentShader: /* glsl */ `
precision highp float;
out vec4 outColor;
flat in int vState;
flat in vec4 vOverride;
flat in int vId;
in vec3 vNormalW;
${CLIP_F_PARS}
uniform vec3 uTop, uSide, uShade, uSelTop, uSelSide, uSelShade, uHover, uPaper, uCap, uGlass, uRevealColor, uPreselect;
uniform vec2 uLight;
uniform vec3 uSun, uConcrete;
uniform int uMode;
uniform int uPass;
void main() {
  ${CLIP_F}
  bool glass = (vState & ${STATE_GLASS}) != 0;
  bool sel = (vState & ${STATE_SELECTED}) != 0;
  int ovFlags = int(vOverride.a * 255.0 + 0.5);
  float ovAlpha = 1.0 - float(ovFlags & 63) / 63.0;
  // Pass 0 is opaque; pass 1 draws glass, the selection and transparent overrides, so what is behind shows.
  if ((glass || sel || ovAlpha < 0.999) != (uPass == 1)) discard;
  // Back faces are only drawn while a section box is on, as solid cut faces of opaque elements. In the
  // see-through pass they are skipped: a transparent slab must not paint its own underside opaque.
  if (!gl_FrontFacing) {
    if (uPass == 1) discard;
    outColor = vec4(sel ? uSelShade : uCap, 1.0);
    return;
  }
  bool hov = (vState & ${STATE_HOVER}) != 0;
  vec3 n = normalize(vNormalW);
  vec3 top = sel ? uSelTop : uTop;
  vec3 side = sel ? uSelSide : uSide;
  vec3 shade = sel ? uSelShade : uShade;
  vec3 col;
  bool ovColor = (ovFlags & ${OVERRIDE_COLOR}) != 0 && !sel;
  if (uMode == ${DISPLAY_REALISTIC}) {
    // Sun (warm) plus sky above and ground bounce below (hemisphere), on the element's albedo.
    vec3 albedo = sel ? uSelSide : ovColor ? vOverride.rgb : uConcrete;
    float sun = max(dot(n, normalize(uSun)), 0.0);
    vec3 sky = mix(vec3(0.34, 0.32, 0.30), vec3(0.70, 0.76, 0.86), n.y * 0.5 + 0.5);
    col = albedo * (sky * 0.5 + vec3(1.0, 0.95, 0.85) * sun * 0.95);
    col = col / (col + vec3(0.85)) * 1.85; // gentle tone curve: no burnt-out tops
  } else if (uMode == ${DISPLAY_CONSISTENT}) col = side;
  else if (uMode == ${DISPLAY_HIDDEN_LINE}) col = sel ? uSelTop : uPaper;
  else if (n.y > 0.6) col = top;
  else if (n.y < -0.6) col = shade;
  else {
    vec2 h = n.xz;
    float len = length(h);
    float t = len > 1e-4 ? clamp(dot(h / len, uLight) * 0.5 + 0.5, 0.0, 1.0) : 0.5;
    col = mix(shade, side, t);
  }
  // Visibility/Graphics: a surface colour keeps the face's shading; halftone blends toward the paper.
  if (ovColor && uMode != ${DISPLAY_HIDDEN_LINE} && uMode != ${DISPLAY_REALISTIC}) {
    float k = dot(col, vec3(0.299, 0.587, 0.114)) / max(dot(uTop, vec3(0.299, 0.587, 0.114)), 0.05);
    col = vOverride.rgb * clamp(k, 0.55, 1.1);
  }
  if ((ovFlags & ${OVERRIDE_HALFTONE}) != 0 && !sel) col = mix(col, uPaper, 0.55);
  // Hover is carried by the edges (outline); faces only warm very slightly.
  if (hov && !sel) col = mix(col, uHover, 0.08);
  if ((vState & ${STATE_PRESELECT}) != 0 && !sel) col = mix(col, uPreselect, 0.35); // box preview: blue
  if ((vState & ${STATE_HIDDEN}) != 0) {
    // Reveal Hidden Elements (only reached when revealing): hidden elements in the reveal colour.
    outColor = vec4(sel ? uSelTop : mix(col, uRevealColor, 0.72), uPass == 1 ? 0.5 : 1.0);
    return;
  }
  if (uPass == 1) {
    // Glass, and the selection: orange and see-through, as in Revit.
    outColor = sel ? vec4(col, hov ? 0.78 : 0.66) : glass ? vec4(mix(uGlass, col, 0.25), (hov ? 0.45 : 0.3) * ovAlpha) : vec4(col, ovAlpha);
    return;
  }
  outColor = vec4(col, 1.0);
}`,
  });
}

export function createEdgeMaterial(state: DataTexture, overrideTex: DataTexture = EMPTY_OVERRIDE): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    clipping: true,
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...explodeUniforms(),
      uState: { value: state },
      uStateWidth: { value: STATE_TEXTURE_WIDTH },
      uReveal: { value: 0 },
      uOverride: { value: overrideTex },
      uRevealColor: { value: new Color(0.71, 0.09, 0.62) }, // Revit's reveal magenta
      uEdge: { value: new Color() },
      uEdgeAlpha: { value: 1 },
      uDashed: { value: 0 },
      uDash: { value: 4 },
      uEdgeSel: { value: new Color() },
      uEdgeSelAlpha: { value: 1 },
      uHover: { value: new Color() },
      uPreselect: { value: new Color(0.18, 0.5, 0.85) },
    },
    vertexShader: /* glsl */ `
${STATE_VERTEX}
${CLIP_V_PARS}
void main() {
  vState = readState();
  ${CLIP_V}
  gl_Position = projectionMatrix * mvPosition;
  ${HIDE}
}`,
    fragmentShader: /* glsl */ `
precision highp float;
out vec4 outColor;
flat in int vState;
flat in vec4 vOverride;
flat in int vId;
${CLIP_F_PARS}
uniform vec3 uEdge, uEdgeSel, uHover, uRevealColor, uPreselect;
uniform float uEdgeAlpha, uEdgeSelAlpha;
// Hidden lines (Revit "Show Hidden Lines"): this pass only draws behind other geometry, dashed.
uniform int uDashed;
uniform float uDash;
void main() {
  ${CLIP_F}
  bool sel = (vState & ${STATE_SELECTED}) != 0;
  bool hov = (vState & ${STATE_HOVER}) != 0;
  if (uDashed == 1 && mod(floor((gl_FragCoord.x + gl_FragCoord.y) / uDash), 2.0) > 0.5) discard;
  bool hid = (vState & ${STATE_HIDDEN}) != 0;
  int ovFlags = int(vOverride.a * 255.0 + 0.5);
  float fade = (1.0 - float(ovFlags & 63) / 63.0) * ((ovFlags & ${OVERRIDE_HALFTONE}) != 0 ? 0.4 : 1.0);
  bool pre = (vState & ${STATE_PRESELECT}) != 0;
  outColor = sel ? vec4(uEdgeSel, uEdgeSelAlpha) : pre ? vec4(uPreselect, 1.0) : hov ? vec4(uHover, 1.0) : hid ? vec4(uRevealColor, 1.0) : vec4(uEdge, uEdgeAlpha * fade);
}`,
  });
}

/** Renders each element as its index+1 in 24-bit RGB for picking. */
export function createPickMaterial(state: DataTexture, overrideTex: DataTexture = EMPTY_OVERRIDE): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    clipping: true,
    uniforms: { ...explodeUniforms(), uState: { value: state }, uStateWidth: { value: STATE_TEXTURE_WIDTH }, uReveal: { value: 0 }, uOverride: { value: overrideTex }, uStateMask: { value: 0 } },
    vertexShader: /* glsl */ `
${STATE_VERTEX}
${CLIP_V_PARS}
void main() {
  vState = readState();
  ${CLIP_V}
  gl_Position = projectionMatrix * mvPosition;
  ${HIDE}
}`,
    fragmentShader: /* glsl */ `
precision highp float;
out vec4 outColor;
flat in int vState;
flat in vec4 vOverride;
flat in int vId;
// Section caps reuse this shader: a non-zero mask keeps only elements with those state bits
// (selected, hovered, box preview) so their caps can be drawn in their own colour.
uniform int uStateMask;
${CLIP_F_PARS}
void main() {
  ${CLIP_F}
  if (uStateMask != 0 && (vState & uStateMask) == 0) discard;
  int v = vId + 1;
  outColor = vec4(float((v >> 16) & 255), float((v >> 8) & 255), float(v & 255), 255.0) / 255.0;
}`,
  });
}

/**
 * Ground shadows: the model drawn once more, flattened onto the ground plane along the sun direction
 * as a translucent shade. One extra draw of the same geometry (no shadow maps), so it stays light on
 * large models. A stencil keeps overlapping parts from darkening twice. It follows hidden elements,
 * the exploded view and the section box (clipping uses each point's position before flattening).
 */
export function createShadowMaterial(state: DataTexture, overrideTex: DataTexture = EMPTY_OVERRIDE): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    clipping: true,
    transparent: true,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: NotEqualStencilFunc,
    stencilZPass: ReplaceStencilOp,
    uniforms: {
      ...explodeUniforms(),
      uState: { value: state },
      uStateWidth: { value: STATE_TEXTURE_WIDTH },
      uReveal: { value: 0 },
      uOverride: { value: overrideTex },
      uSun: { value: SUN_DIRECTION.clone() },
      uGround: { value: 0 },
      uShadow: { value: new Color(0.09, 0.1, 0.12) },
      uShadowAlpha: { value: 0.24 },
    },
    vertexShader: /* glsl */ `
${STATE_VERTEX}
${CLIP_V_PARS}
uniform vec3 uSun;
uniform float uGround;
void main() {
  vState = readState();
  ${CLIP_V}
  vec4 world = modelMatrix * vec4(position + gOffset, 1.0);
  vec3 sun = normalize(uSun);
  float t = max(world.y - uGround, 0.0) / max(sun.y, 0.08);
  vec4 flat_ = vec4(world.x - sun.x * t, uGround + 0.003, world.z - sun.z * t, 1.0);
  gl_Position = projectionMatrix * viewMatrix * flat_;
  ${HIDE}
  if ((vState & ${STATE_GLASS}) != 0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // glass casts no hard shadow
}`,
    fragmentShader: /* glsl */ `
precision highp float;
out vec4 outColor;
flat in int vState;
flat in vec4 vOverride;
flat in int vId;
uniform vec3 uShadow;
uniform float uShadowAlpha;
${CLIP_F_PARS}
void main() {
  ${CLIP_F}
  outColor = vec4(uShadow, uShadowAlpha);
}`,
  });
}

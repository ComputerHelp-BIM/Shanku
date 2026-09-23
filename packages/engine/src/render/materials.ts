import { Color, DataTexture, GLSL3, RGBAFormat, ShaderMaterial, UnsignedByteType, Vector2 } from 'three';

/** Per-element state flags stored in the red channel of the state texture. */
export const STATE_SELECTED = 1;
export const STATE_HOVER = 2;
export const STATE_HIDDEN = 4;
/** Windows and doors: drawn in the transparent (glass) pass. */
export const STATE_GLASS = 8;

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
flat out int vState;
flat out int vId;
// Visibility/Graphics override: rgb = colour, a = packed (bit 7 colour set, bit 6 halftone, bits 0-5 transparency 0-63).
flat out vec4 vOverride;
int readState() {
  int id = int(aElement + 0.5);
  vId = id;
  ivec2 c = ivec2(id % uStateWidth, id / uStateWidth);
  vOverride = texelFetch(uOverride, c, 0);
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

// three.js clipping chunks, used by the section box.
const CLIP_V_PARS = '#include <clipping_planes_pars_vertex>';
const CLIP_V = 'vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);\n#include <clipping_planes_vertex>';
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
      uPaper: { value: new Color() },
      // Section-box caps: back faces seen through a cut are painted flat, so cut members read solid.
      uCap: { value: new Color() },
      // 0 = opaque pass (skips glass), 1 = glass pass (only glass, see-through)
      uPass: { value: 0 },
      uGlass: { value: new Color() },
      uMode: { value: DISPLAY_SHADED },
      // Horizontal "light" direction in the XZ plane: faces turned toward it get the lit side colour.
      uLight: { value: new Vector2(0.8, 0.6).normalize() },
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
uniform vec3 uTop, uSide, uShade, uSelTop, uSelSide, uSelShade, uHover, uPaper, uCap, uGlass, uRevealColor;
uniform vec2 uLight;
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
  if (uMode == ${DISPLAY_CONSISTENT}) col = side;
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
  if ((ovFlags & ${OVERRIDE_COLOR}) != 0 && !sel && uMode != ${DISPLAY_HIDDEN_LINE}) {
    float k = dot(col, vec3(0.299, 0.587, 0.114)) / max(dot(uTop, vec3(0.299, 0.587, 0.114)), 0.05);
    col = vOverride.rgb * clamp(k, 0.55, 1.1);
  }
  if ((ovFlags & ${OVERRIDE_HALFTONE}) != 0 && !sel) col = mix(col, uPaper, 0.55);
  // Hover is carried by the edges (outline); faces only warm very slightly.
  if (hov && !sel) col = mix(col, uHover, 0.08);
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
      uState: { value: state },
      uStateWidth: { value: STATE_TEXTURE_WIDTH },
      uReveal: { value: 0 },
      uOverride: { value: overrideTex },
      uRevealColor: { value: new Color(0.71, 0.09, 0.62) }, // Revit's reveal magenta
      uEdge: { value: new Color() },
      uEdgeAlpha: { value: 1 },
      uEdgeSel: { value: new Color() },
      uEdgeSelAlpha: { value: 1 },
      uHover: { value: new Color() },
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
uniform vec3 uEdge, uEdgeSel, uHover, uRevealColor;
uniform float uEdgeAlpha, uEdgeSelAlpha;
void main() {
  ${CLIP_F}
  bool sel = (vState & ${STATE_SELECTED}) != 0;
  bool hov = (vState & ${STATE_HOVER}) != 0;
  bool hid = (vState & ${STATE_HIDDEN}) != 0;
  int ovFlags = int(vOverride.a * 255.0 + 0.5);
  float fade = (1.0 - float(ovFlags & 63) / 63.0) * ((ovFlags & ${OVERRIDE_HALFTONE}) != 0 ? 0.4 : 1.0);
  outColor = sel ? vec4(uEdgeSel, uEdgeSelAlpha) : hov ? vec4(uHover, 1.0) : hid ? vec4(uRevealColor, 1.0) : vec4(uEdge, uEdgeAlpha * fade);
}`,
  });
}

/** Renders each element as its index+1 in 24-bit RGB for picking. */
export function createPickMaterial(state: DataTexture, overrideTex: DataTexture = EMPTY_OVERRIDE): ShaderMaterial {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    clipping: true,
    uniforms: { uState: { value: state }, uStateWidth: { value: STATE_TEXTURE_WIDTH }, uReveal: { value: 0 }, uOverride: { value: overrideTex } },
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
void main() {
  ${CLIP_F}
  int v = vId + 1;
  outColor = vec4(float((v >> 16) & 255), float((v >> 8) & 255), float(v & 255), 255.0) / 255.0;
}`,
  });
}

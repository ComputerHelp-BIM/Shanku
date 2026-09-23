/**
 * Revit-like cursors as SVG data URIs, drawn for the canvas: dark on Paper, light on Ink, each with a
 * contrasting outline so it reads on any element colour. Orbit (turning arrows), pan (four-way arrow),
 * and the selection arrow with a small + (Ctrl, add) or − (Shift, remove).
 */
export interface CursorSet {
  orbit: string;
  pan: string;
  add: string;
  remove: string;
  zoom: string;
}

const svg = (body: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${hx} ${hy}, ${fallback}`;

function build(dark: boolean): CursorSet {
  // Paper canvas: dark cursor with a light outline. Ink canvas: light cursor with a dark outline.
  const ink = dark ? '#F4F5F7' : '#16181D';
  const halo = dark ? '#16181D' : '#FFFFFF';
  const arrow = `<path d='M3 2 L3 18 L7.2 14.2 L10 20.5 L12.6 19.4 L9.9 13.2 L15.6 13.2 Z' fill='${ink}' stroke='${halo}' stroke-width='1.2' stroke-linejoin='round'/>`;
  const badge = (minus: boolean) =>
    `<circle cx='18' cy='18' r='5' fill='${halo}' stroke='${ink}' stroke-width='1'/><path d='${minus ? 'M15.2 18h5.6' : 'M18 15.2v5.6M15.2 18h5.6'}' stroke='${ink}' stroke-width='1.6'/>`;
  const arcs = "<path d='M5 9a8 8 0 0 1 13.5-2.5'/><path d='M19 15a8 8 0 0 1-13.5 2.5'/>";
  return {
    orbit: svg(
      `<g fill='none' stroke='${halo}' stroke-width='4' stroke-linecap='round'>${arcs}</g><g fill='none' stroke='${ink}' stroke-width='2' stroke-linecap='round'>${arcs}</g>` +
        `<path d='M19.5 2.5v5h-5z' fill='${ink}' stroke='${halo}' stroke-width='0.8'/><path d='M4.5 21.5v-5h5z' fill='${ink}' stroke='${halo}' stroke-width='0.8'/><circle cx='12' cy='12' r='2' fill='${ink}' stroke='${halo}'/>`,
      12,
      12,
      'grabbing',
    ),
    pan: svg(
      `<path d='M12 2 L15.5 6 H13.2 V10.8 H18 V8.5 L22 12 L18 15.5 V13.2 H13.2 V18 H15.5 L12 22 L8.5 18 H10.8 V13.2 H6 V15.5 L2 12 L6 8.5 V10.8 H10.8 V6 H8.5 Z' fill='${ink}' stroke='${halo}' stroke-width='1.1' stroke-linejoin='round'/>`,
      12,
      12,
      'move',
    ),
    add: svg(arrow + badge(false), 3, 2, 'copy'),
    remove: svg(arrow + badge(true), 3, 2, 'default'),
    zoom: 'zoom-in',
  };
}

const LIGHT = build(false);
const DARK = build(true);

/** Cursors for a canvas: pass true when the canvas background is dark (Ink). */
export function cursorsFor(darkCanvas: boolean): CursorSet {
  return darkCanvas ? DARK : LIGHT;
}

/** Paper cursors (kept for callers that do not know the canvas). */
export const CURSOR = LIGHT;

/** Is a CSS colour dark? Used on the canvas background to pick the cursor set. */
export function isDarkColor(css: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128;
  }
  const r = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(css);
  return r ? 0.2126 * +r[1] + 0.7152 * +r[2] + 0.0722 * +r[3] < 128 : false;
}

/** The idle cursor for the current modifier keys. */
export function modifierCursor(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, set: CursorSet = LIGHT): string {
  return e.ctrlKey || e.metaKey ? set.add : e.shiftKey ? set.remove : '';
}

/**
 * Revit-like cursors, as SVG data URIs with a CSS fallback: orbit (turning arrows), pan (four-way arrow,
 * the built-in `move`), and the selection arrow with a small + (Ctrl, add) or − (Shift, remove).
 */
const svg = (body: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>${body}</svg>`)}") ${hx} ${hy}, ${fallback}`;

const ARROW = "<path d='M3 2 L3 18 L7.2 14.2 L10 20.5 L12.6 19.4 L9.9 13.2 L15.6 13.2 Z' fill='black' stroke='white' stroke-width='1.2' stroke-linejoin='round'/>";

export const CURSOR = {
  /** Orbit: two turning arrows around a centre dot. */
  orbit: svg(
    "<g fill='none' stroke='white' stroke-width='4' stroke-linecap='round'><path d='M5 9a8 8 0 0 1 13.5-2.5'/><path d='M19 15a8 8 0 0 1-13.5 2.5'/></g>" +
      "<g fill='none' stroke='black' stroke-width='2' stroke-linecap='round'><path d='M5 9a8 8 0 0 1 13.5-2.5'/><path d='M19 15a8 8 0 0 1-13.5 2.5'/></g>" +
      "<path d='M19.5 2.5v5h-5z' fill='black' stroke='white' stroke-width='0.8'/><path d='M4.5 21.5v-5h5z' fill='black' stroke='white' stroke-width='0.8'/><circle cx='12' cy='12' r='2' fill='black' stroke='white'/>",
    12,
    12,
    'grabbing',
  ),
  pan: 'move',
  add: svg(`${ARROW}<circle cx='18' cy='18' r='5' fill='white' stroke='black' stroke-width='1'/><path d='M18 15.2v5.6M15.2 18h5.6' stroke='black' stroke-width='1.6'/>`, 3, 2, 'copy'),
  remove: svg(`${ARROW}<circle cx='18' cy='18' r='5' fill='white' stroke='black' stroke-width='1'/><path d='M15.2 18h5.6' stroke='black' stroke-width='1.6'/>`, 3, 2, 'default'),
  zoom: 'zoom-in',
} as const;

/** The idle cursor for the current modifier keys. */
export function modifierCursor(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): string {
  return e.ctrlKey || e.metaKey ? CURSOR.add : e.shiftKey ? CURSOR.remove : '';
}

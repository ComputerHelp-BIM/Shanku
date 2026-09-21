/** Element index <-> 24-bit RGB used by the ID buffer. 0 means "nothing". Max 16,777,214 elements. */
export const MAX_PICKABLE = 0xfffffe;

export function encodePickId(index: number): [number, number, number] {
  const v = index + 1;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function decodePickId(r: number, g: number, b: number): number | null {
  const v = (r << 16) | (g << 8) | b;
  return v === 0 ? null : v - 1;
}

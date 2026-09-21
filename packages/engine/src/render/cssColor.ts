/** Parses the colour formats our tokens use: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseCssColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    if ([0, 2, 4].some((i) => Number.isNaN(n(i)))) return null;
    return { r: n(0) / 255, g: n(2) / 255, b: n(4) / 255, a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255, a: parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1 };
  }
  return null;
}

/** Tokens the viewer reads. Changing the theme re-reads them, so the 3D view follows Paper and Ink. */
export const VIEWER_TOKENS = [
  'viewport',
  'concrete-top',
  'concrete-side',
  'concrete-shade',
  'selected-top',
  'selected-side',
  'selected-shade',
  'hover-outline',
  'edge-model',
  'edge-selected',
  'line-cut',
  'line-projection',
] as const;
export type ViewerToken = (typeof VIEWER_TOKENS)[number];

const FALLBACK: Record<ViewerToken, string> = {
  viewport: '#F1EEE8',
  'concrete-top': '#CFCBC2',
  'concrete-side': '#A7AAB1',
  'concrete-shade': '#868B94',
  'selected-top': '#F5B67B',
  'selected-side': '#D9761E',
  'selected-shade': '#B45F16',
  'hover-outline': '#D9761E',
  'edge-model': 'rgba(23,25,30,0.40)',
  'edge-selected': '#8A4410',
  'line-cut': '#17191E',
  'line-projection': '#5B5F68',
};

export function readViewerTokens(el: Element = document.documentElement): Record<ViewerToken, Rgba> {
  const style = getComputedStyle(el);
  const out = {} as Record<ViewerToken, Rgba>;
  for (const t of VIEWER_TOKENS) {
    out[t] = parseCssColor(style.getPropertyValue(`--${t}`)) ?? (parseCssColor(FALLBACK[t]) as Rgba);
  }
  return out;
}

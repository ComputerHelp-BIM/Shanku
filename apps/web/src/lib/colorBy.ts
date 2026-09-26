import type { ElementRecord, Level } from '@shanku/engine';

/**
 * Colour by parameter (quick-wins A1), after the Structura viewer's element palette: pick what to
 * colour by, pick a palette, and the legend lists every group with its colour and count. Click a
 * swatch to recolour a group, click a row to hide it. Gradient modes (height, length, volume) show a
 * scale instead of groups.
 */
export type ColorMode = 'none' | 'category' | 'grade' | 'level' | 'type' | 'section' | 'mark' | 'height' | 'length' | 'volume';

export const COLOR_MODES: ReadonlyArray<{ id: ColorMode; label: string; tip: string; gradient?: boolean }> = [
  { id: 'none', label: 'None', tip: 'The normal concrete colours' },
  { id: 'category', label: 'Category', tip: 'Columns, beams, slabs, walls and footings each get a colour' },
  { id: 'grade', label: 'Grade', tip: 'Where the concrete grade changes' },
  { id: 'level', label: 'Level', tip: 'A colour per level' },
  { id: 'type', label: 'Type', tip: 'Every family type gets a colour' },
  { id: 'section', label: 'Section', tip: 'Every cross-section (width × depth) gets a colour: spot a size that changes where it should not' },
  { id: 'mark', label: 'Mark', tip: 'Every mark gets a colour; unmarked elements stand out' },
  { id: 'height', label: 'Height', tip: 'A gradient by elevation', gradient: true },
  { id: 'length', label: 'Length', tip: 'A gradient by member length: odd members stand out', gradient: true },
  { id: 'volume', label: 'Volume', tip: 'A gradient by concrete volume: where the concrete is', gradient: true },
];

/** The Structura viewer's palettes (same owner; reused as they are). */
export const PALETTES: Record<string, readonly string[]> = {
  engineering: ['#1f6f78', '#3f8f7d', '#c6852a', '#7d5ba6', '#2f6ea8', '#a8562f', '#4d7a4f', '#8a4f6d', '#5b6b7a', '#b0603c', '#3c8f9c', '#8f7a2a'],
  blueprint: ['#2a6fb0', '#3f8fd0', '#5fa8e0', '#1f4f80', '#7fc0ea', '#2f8fae', '#4a6fa0', '#6fb5c8', '#3a5f90', '#8fd0e8', '#265f95', '#5a9fc0'],
  contrast: ['#0b6e4f', '#b3312c', '#1f5fa8', '#c47b00', '#6a3fa0', '#0f7d8a', '#8a2f5f', '#4a7a1f', '#a0441f', '#2f4f9f', '#7a6a10', '#9f2f7a'],
  pastel: ['#7eb8b3', '#e0a3a3', '#9db4d4', '#e5c68a', '#b9a3d4', '#8fc7a8', '#e0b295', '#a3ccd4', '#d4a3c0', '#b6cf9a', '#9fa9d4', '#d8cb95'],
  mono: ['#3a444c', '#586670', '#76838c', '#94a0a8', '#2a3238', '#68757e', '#48545c', '#8a969e', '#343c44', '#7e8a92', '#525e66', '#9aa6ae'],
};

/** Gradient stops (teal → ochre → red), from the Structura viewer. */
const RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [26, 92, 110],
  [52, 150, 140],
  [198, 163, 62],
  [190, 104, 48],
  [165, 52, 60],
];

export function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const f = x * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(f));
  const k = f - i;
  return [0, 1, 2].map((c) => Math.round(RAMP[i][c] + (RAMP[i + 1][c] - RAMP[i][c]) * k)) as [number, number, number];
}
export const rampCss = (t: number) => `rgb(${ramp(t).join(', ')})`;

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const section = (e: ElementRecord) => {
  const w = e.dims.width, d = e.dims.depth;
  if (w === null || d === null) return '(no section)';
  const a = Math.round(w * 1000), b = Math.round(d * 1000);
  return e.category === 'Column' ? [a, b].sort((x, y) => x - y).join(' × ') : `${a} × ${b}`;
};

/** The group an element falls in for a group mode. */
export function groupKey(e: ElementRecord, mode: ColorMode): string {
  switch (mode) {
    case 'category': return e.category;
    case 'grade': return e.grade || '(no grade)';
    case 'level': return e.level || '(no level)';
    case 'type': return e.typeName || '(no type)';
    case 'section': return section(e);
    case 'mark': return e.mark || '(no mark)';
    default: return '';
  }
}

/** The value an element has in a gradient mode (m, m or m³); null when it has none. */
/** originY: the model's vertical origin shift, so heights read as the model's own elevations. */
export function gradientValue(e: ElementRecord, mode: ColorMode, originY = 0): number | null {
  if (mode === 'height') return (e.bounds[1] + e.bounds[4]) / 2 - originY;
  if (mode === 'length') return e.length;
  if (mode === 'volume') return e.volume > 0 ? e.volume : null;
  return null;
}

export interface LegendGroup {
  key: string;
  color: string;
  count: number;
  hidden: boolean;
  /** Element indices in the group. */
  elements: number[];
}

export interface ColorResult {
  /** Colour per element index (0–255 RGB); missing = keep the normal colour. */
  colors: Map<number, [number, number, number]>;
  /** Elements in groups the user hid from the legend. */
  hidden: number[];
  groups: LegendGroup[];
  range: { min: number; max: number; unit: string } | null;
}

export interface ColorSettings {
  mode: ColorMode;
  palette: string;
  /** "mode|key" → hex, the swatches the user recoloured. */
  custom: Record<string, string>;
  /** "mode|key" of groups hidden from the legend. */
  off: string[];
}

export const DEFAULT_COLOR_SETTINGS: ColorSettings = { mode: 'none', palette: 'engineering', custom: {}, off: [] };

const NEUTRAL: [number, number, number] = [196, 199, 204];
const EMPTY_KEYS = new Set(['(no grade)', '(no level)', '(no type)', '(no section)', '(no mark)']);

/**
 * Colours for every element in the chosen mode. Groups sort by level order for levels, by count for
 * everything else (most common first), with the "(no …)" group last and grey so gaps stand out.
 * `categoryColors` supplies the design system's category colours for the Category mode.
 */
export function computeColors(elements: readonly ElementRecord[], levels: readonly Level[], s: ColorSettings, categoryColors: Record<string, string> = {}, originY = 0): ColorResult {
  const colors = new Map<number, [number, number, number]>();
  if (s.mode === 'none') return { colors, hidden: [], groups: [], range: null };
  const meta = COLOR_MODES.find((m) => m.id === s.mode);
  if (meta?.gradient) {
    let min = Infinity, max = -Infinity;
    for (const e of elements) {
      const v = gradientValue(e, s.mode, originY);
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min)) return { colors, hidden: [], groups: [], range: null };
    const span = max - min || 1;
    for (const e of elements) {
      const v = gradientValue(e, s.mode, originY);
      colors.set(e.index, v === null ? NEUTRAL : ramp((v - min) / span));
    }
    return { colors, hidden: [], groups: [], range: { min, max, unit: s.mode === 'volume' ? 'm³' : 'm' } };
  }
  const byKey = new Map<string, number[]>();
  for (const e of elements) {
    const k = groupKey(e, s.mode);
    const list = byKey.get(k);
    if (list) list.push(e.index);
    else byKey.set(k, [e.index]);
  }
  const levelRank = new Map(levels.map((l, i) => [l.name, i]));
  const keys = [...byKey.keys()].sort((a, b) => {
    if (EMPTY_KEYS.has(a) !== EMPTY_KEYS.has(b)) return EMPTY_KEYS.has(a) ? 1 : -1;
    if (s.mode === 'level') return (levelRank.get(a) ?? 1e9) - (levelRank.get(b) ?? 1e9) || a.localeCompare(b);
    return byKey.get(b)!.length - byKey.get(a)!.length || a.localeCompare(b, undefined, { numeric: true });
  });
  const pal = PALETTES[s.palette] ?? PALETTES.engineering;
  const off = new Set(s.off);
  const hidden: number[] = [];
  let n = 0;
  const groups = keys.map((key): LegendGroup => {
    const custom = s.custom[`${s.mode}|${key}`];
    const color = custom ?? (EMPTY_KEYS.has(key) ? '#a7aab1' : s.mode === 'category' && categoryColors[key] && s.palette === 'engineering' ? categoryColors[key] : pal[n++ % pal.length]);
    const els = byKey.get(key)!;
    const isOff = off.has(`${s.mode}|${key}`);
    const rgb = hexRgb(color);
    for (const i of els) colors.set(i, rgb);
    if (isOff) hidden.push(...els);
    return { key, color, count: els.length, hidden: isOff, elements: els };
  });
  return { colors, hidden, groups, range: null };
}

/** Merges colour-by under Visibility/Graphics overrides: an explicit override always wins (as in Revit). */
export function mergeOverrides(
  colorBy: Map<number, [number, number, number]>,
  vg: ReadonlyArray<{ index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }>,
): Array<{ index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }> {
  if (!colorBy.size) return [...vg];
  const out = new Map<number, { index: number; color: [number, number, number] | null; transparency: number; halftone: boolean }>();
  for (const [index, color] of colorBy) out.set(index, { index, color, transparency: 0, halftone: false });
  for (const o of vg) {
    const base = out.get(o.index);
    out.set(o.index, { ...o, color: o.color ?? base?.color ?? null });
  }
  return [...out.values()];
}

const KEY = 'shanku.colorBy';
export function loadColorSettings(): ColorSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!v || typeof v !== 'object') return DEFAULT_COLOR_SETTINGS;
    return {
      mode: COLOR_MODES.some((m) => m.id === v.mode) ? v.mode : 'none',
      palette: typeof v.palette === 'string' && PALETTES[v.palette] ? v.palette : 'engineering',
      custom: v.custom && typeof v.custom === 'object' ? v.custom : {},
      off: Array.isArray(v.off) ? v.off.filter((x: unknown) => typeof x === 'string') : [],
    };
  } catch {
    return DEFAULT_COLOR_SETTINGS;
  }
}
export function saveColorSettings(s: ColorSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit */
  }
}

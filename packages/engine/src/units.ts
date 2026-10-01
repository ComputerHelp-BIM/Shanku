/**
 * Project units (decision 27A): Shanku works in millimetres inside (IFC and CH drawings are mm; numbers are
 * exact far beyond any building), and shows lengths in the project's display units, as Revit's Project
 * Units do: mm, cm, m or feet-inches, with chosen decimals and digit grouping. Every length shown or typed
 * goes through formatLength / parseLength.
 */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'ft-in';
export interface DisplayUnits {
  length: LengthUnit;
  /** Decimal places (mm, cm, m); for feet-inches, the inch fraction: 0 whole inches, 1 ½, 2 ¼, 3 ⅛, 4 1/16. */
  decimals: number;
  grouping: 'indian' | 'international' | 'none';
}
export const DEFAULT_UNITS: DisplayUnits = { length: 'mm', decimals: 0, grouping: 'indian' };
export const UNIT_SYMBOL: Record<LengthUnit, string> = { mm: 'mm', cm: 'cm', m: 'm', 'ft-in': 'ft-in' };
const PER_M: Record<Exclude<LengthUnit, 'ft-in'>, number> = { mm: 1000, cm: 100, m: 1 };

let current: DisplayUnits = DEFAULT_UNITS;
const listeners = new Set<() => void>();
export const getDisplayUnits = () => current;
export function setDisplayUnits(u: DisplayUnits): void {
  current = { ...u };
  for (const f of listeners) f();
}
/** Called when the display units change (views redraw their labels). */
export function onDisplayUnits(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function group(n: number, decimals: number, grouping: DisplayUnits['grouping']): string {
  const locale = grouping === 'indian' ? 'en-IN' : 'en-US';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouping !== 'none' });
}

/**
 * A length (metres) as the project shows it: "3,200", "320", "3.200", "10' - 6 ½\"". `symbol` adds the
 * unit ("3,200 mm"); `signed` adds + or − (level heads, offsets).
 */
export function formatLength(metres: number, opts: { symbol?: boolean; signed?: boolean; units?: DisplayUnits } = {}): string {
  const u = opts.units ?? current;
  const neg = metres < 0;
  const abs = Math.abs(metres);
  let text: string;
  if (u.length === 'ft-in') {
    const denom = [1, 2, 4, 8, 16][Math.max(0, Math.min(4, u.decimals))];
    let inches = Math.round((abs / 0.0254) * denom) / denom;
    let feet = Math.floor(inches / 12 + 1e-9);
    inches -= feet * 12;
    if (inches >= 12 - 1e-9) {
      feet += 1;
      inches = 0;
    }
    const whole = Math.floor(inches + 1e-9);
    const frac = Math.round((inches - whole) * denom);
    const fracText = frac ? ` ${frac / gcd(frac, denom)}/${denom / gcd(frac, denom)}` : '';
    text = `${group(feet, 0, u.grouping)}' - ${whole}${fracText}"`;
  } else {
    const v = abs * PER_M[u.length];
    const rounded = Number(v.toFixed(u.decimals));
    text = group(rounded, u.decimals, u.grouping);
    if (opts.symbol) text += ` ${u.length}`;
  }
  const isZero = !/[1-9]/.test(text);
  const sign = opts.signed && !isZero ? (neg ? '−' : '+') : neg && !isZero ? '−' : '';
  return sign + text;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Text typed by a person → metres (NaN when it is not a length). A plain number is in the project's unit (for
 * feet-inches: feet); a unit written with it wins ("3.2m", "450 mm", "10'6\"", "6\""). Any digit grouping, a
 * leading + or −, the minus sign (−).
 */
export function parseLength(text: string, units: DisplayUnits = current): number {
  let t = text.trim().replace(/\u2212/g, '-').replace(/^\+/, '');
  if (!t) return NaN;
  const sign = t.startsWith('-') ? -1 : 1;
  t = t.replace(/^-/, '').trim();
  // feet and inches: 10' 6", 10'-6 1/2", 10', 6", 6 1/2"
  const fi = /^(?:(\d+(?:\.\d+)?)\s*')?\s*-?\s*(?:(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*")?$/.exec(t.replace(/,/g, ''));
  if (fi && (fi[1] !== undefined || fi[2] !== undefined) && /['"]/.test(t)) {
    const feet = Number(fi[1] ?? 0), inches = Number(fi[2] ?? 0) + (fi[3] ? Number(fi[3]) / Number(fi[4]) : 0);
    return sign * (feet * 12 + inches) * 0.0254;
  }
  const m = /^([\d,\s]*\.?\d+)\s*(mm|cm|m|ft|in)?$/i.exec(t);
  if (!m) return NaN;
  const n = Number(m[1].replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  const unit = (m[2]?.toLowerCase() ?? (units.length === 'ft-in' ? 'ft' : units.length)) as string;
  const perM: Record<string, number> = { mm: 1000, cm: 100, m: 1, ft: 1 / 0.3048, in: 1 / 0.0254 };
  return (sign * n) / perM[unit];
}

/** The unit as fields label it ("mm", "m", "ft-in"). */
export const unitLabel = (u: DisplayUnits = current) => UNIT_SYMBOL[u.length];

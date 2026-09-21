import type { PropertyValue } from '@shanku/engine';

const nf = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

export const fmtCount = (n: number) => new Intl.NumberFormat('en-IN').format(n);

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const fmtMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

export function fmtValue(value: PropertyValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return nf.format(value);
  return value;
}

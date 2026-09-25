/**
 * Trademark and compatibility notice, in one place: the homepage footer, the Guide's About section and
 * anywhere Shanku shows full product copy use it. Wording: Autodesk's standard attribution (accurate
 * whatever each mark's registration status in India) and Computer Help's independence statement.
 * The month comes from the build date, so it cannot go stale.
 */
declare const __BUILD_DATE__: string | undefined;

export const TRADEMARK_NOTICE =
  'Autodesk, Revit and AutoCAD are registered trademarks or trademarks of Autodesk, Inc., and/or its subsidiaries and/or affiliates in the USA and/or other countries. Shanku is an independent software application developed by Computer Help and is not affiliated with, sponsored by, or endorsed by Autodesk, Inc.';

/** The build's date (in tests and tools without the build stamp: today). */
export function buildDate(): Date {
  const stamp = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : undefined;
  const d = stamp ? new Date(stamp) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** "September 2026". */
export function asOf(d: Date = buildDate()): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/** The full disclaimer for product copy. */
export function disclaimer(d: Date = buildDate()): string {
  return `Disclaimer: ${TRADEMARK_NOTICE} All features and compatibility data are accurate as of ${asOf(d)}.`;
}

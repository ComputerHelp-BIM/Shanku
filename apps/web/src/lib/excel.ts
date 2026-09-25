import { siFactor, type ElementRecord, type ModelInfo } from '@shanku/engine';
import { effectiveRebar, itemKey, rateFor, rateItems, type RateBook } from './rates';
import { CITY_PROFILES } from './rateProfiles';
import { REBAR_BANDS, rebarEstimate } from './rebar';

export interface BoqExportInput {
  info: ModelInfo;
  elements: readonly ElementRecord[];
  rates: RateBook;
  markRules: readonly string[];
  gradeRules: readonly string[];
  appVersion: string;
  /** What the elements are, e.g. "Visible elements only · 312 of 850 elements" (describeScope). */
  scope?: string;
  /** For tests; defaults to now. */
  date?: Date;
  /** For tests: omit cached formula results so a spreadsheet engine must calculate them. */
  omitResults?: boolean;
}

/**
 * Workbook colours from the design system (Paper theme, packages/tokens/tokens.json; a test keeps
 * them in step). Excel cannot read CSS, so the values are copied here as ARGB.
 */
export const WORKBOOK_TOKENS = {
  'brand-ink': '#17191E',
  'brand-paper': '#F6F4EF',
  panel: '#E9E4DA',
  border: '#E2DED4',
  'text-secondary': '#5B5F68',
  accent: '#D9761E',
  'accent-text': '#9C4C0A',
  'row-selected': '#F3E2D0',
  field: '#FFFFFF',
} as const;
const argb = (k: keyof typeof WORKBOOK_TOKENS) => `FF${WORKBOOK_TOKENS[k].slice(1)}`;
const SANS = 'IBM Plex Sans'; // the design system's UI font; Excel substitutes its default where it is not installed
const MONO = 'IBM Plex Mono';
/** Minimal built-in style: the design system's own fills and borders are applied on top. */
const TABLE_STYLE = 'TableStyleLight1';
const INPUT_FILL = argb('row-selected'); // editable cells look like the app's rate inputs
const INPUT_TEXT = argb('accent-text');
const F_VOL = '#,##0.000';
const F_DIM = '#,##0.00';
/** Indian digit grouping: 1,23,45,678.90 */
const F_INR = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';

/** Elements sheet column letters, used by the other sheets' formulas. */
const EL = { level: 'D', category: 'E', grade: 'G', volume: 'M', rate: 'N', amount: 'P' } as const;

type Cell = string | number | null | { formula: string; result?: number | string };

/** Rate from the Rates sheet; an empty rate stays empty (never 0), a missing item is empty. */
const rateLookup = (key: string) => {
  const hit = `INDEX(Rates!$E:$E,MATCH(${key},Rates!$A:$A,0))`;
  return `IFERROR(IF(${hit}="","",${hit}),"")`;
};

/**
 * The approved BOQ workbook: Summary, Levels, Elements, Rates, About. Every data range is
 * an Excel Table (filters, sorting, banded rows, totals via SUBTOTAL). Summary and Levels
 * are live SUMIFS over Elements; element rates come from the Rates sheet unless overridden.
 */
export async function buildBoqWorkbook(input: BoqExportInput): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const { info, elements, rates } = input;
  const date = input.date ?? new Date();
  const f = (formula: string, result: number | string | null): Cell => (input.omitResults || result === null ? { formula } : { formula, result });
  const wb = new ExcelJS.Workbook();
  wb.creator = `Shanku ${input.appVersion}`;
  wb.created = date;

  const sheet = (name: string, title: string) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }], properties: { tabColor: { argb: name === 'Summary' ? argb('accent') : argb('brand-ink') } } });
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { name: SANS, bold: true, size: 16, color: { argb: argb('brand-ink') } };
    ws.getRow(1).height = 30;
    ws.getCell('A2').value = `${info.projectName || info.fileName} · ${info.fileName} · ${info.compatibility.format} (${info.compatibility.level}) · exported ${date.toLocaleString('en-IN')}`;
    ws.getCell('A3').value = 'Concrete quantities as modelled: net volumes, no deductions for waste or reinforcement. Rates in ₹ per m³.';
    ws.getCell('A4').value = input.scope ? `Scope: ${input.scope}` : null;
    ws.getCell('A2').font = ws.getCell('A3').font = ws.getCell('A4').font = { name: SANS, color: { argb: argb('text-secondary') }, size: 10 };
    return ws;
  };
  /** Tables to brand once every sheet is built (fills, borders and fonts from the design system). */
  const branded: Array<{ ws: import('exceljs').Worksheet; cols: Col[]; rows: number }> = [];
  type Col = { name: string; width: number; fmt?: string; total?: 'sum' | 'none'; label?: string };
  const table = (ws: import('exceljs').Worksheet, name: string, cols: Col[], rows: Cell[][]) => {
    ws.addTable({
      name,
      ref: 'A5',
      headerRow: true,
      totalsRow: true,
      style: { theme: TABLE_STYLE, showRowStripes: true },
      columns: cols.map((c, i) => ({
        name: c.name,
        filterButton: true,
        totalsRowFunction: c.total === 'sum' ? 'sum' : 'none',
        totalsRowLabel: i === 0 ? 'Total' : undefined,
      })),
      rows: rows.length ? rows : [cols.map(() => null)],
    });
    branded.push({ ws, cols, rows: Math.max(1, rows.length) });
    cols.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width;
      if (c.fmt) col.numFmt = c.fmt;
    });
  };

  // ---- Elements ----
  const lengthF = siFactor(info.units.length);
  const elRows: Cell[][] = elements.map((e, i) => {
    const r = 6 + i;
    const rr = rateFor(e, rates);
    const rate: Cell =
      rr.source === 'override'
        ? rr.rate
        : f(rateLookup(`${EL.category}${r}&"|"&${EL.grade}${r}`), rr.rate ?? '');
    return [
      e.mark || null, e.expressId, e.globalId, e.level || null, e.category, e.typeName || null, e.grade || '(no grade)',
      e.dims.length, e.dims.width, e.dims.depth, e.dims.height, e.area, e.volume,
      rate, rr.source === 'override' ? 'Override' : 'Item',
      f(`IF(${EL.rate}${r}="","",${EL.volume}${r}*${EL.rate}${r})`, rr.amount ?? ''),
      e.quantitySource === 'ifc' ? 'IFC quantities' : 'Geometry',
    ];
  });
  const items = rateItems(elements, rates);
  const levelElev = new Map(info.levels.map((l) => [l.name, l.elevation === null ? null : l.elevation * lengthF]));

  // ---- Summary ----
  const ws1 = sheet('Summary', 'Bill of quantities — Summary');
  table(
    ws1,
    'Summary',
    [
      { name: 'Category', width: 12 },
      { name: 'Grade / material', width: 24 },
      { name: 'Count', width: 9, fmt: '#,##0', total: 'sum' },
      { name: 'Volume (m³)', width: 13, fmt: F_VOL, total: 'sum' },
      { name: 'Unit', width: 6 },
      { name: 'Rate (₹)', width: 12, fmt: F_INR },
      { name: 'Overrides', width: 10, fmt: '#,##0', total: 'sum' },
      { name: 'Amount (₹)', width: 18, fmt: F_INR, total: 'sum' },
    ],
    items.map((it, i) => {
      const r = 6 + i;
      const crit = `Elements!$${EL.category}:$${EL.category},A${r},Elements!$${EL.grade}:$${EL.grade},B${r}`;
      return [
        it.category, it.grade,
        f(`COUNTIFS(${crit})`, it.count),
        f(`SUMIFS(Elements!$${EL.volume}:$${EL.volume},${crit})`, it.volume),
        'm³',
        f(rateLookup(`A${r}&"|"&B${r}`), it.rate ?? ''),
        f(`COUNTIFS(${crit},Elements!$O:$O,"Override")`, it.overrides),
        f(`SUMIFS(Elements!$${EL.amount}:$${EL.amount},${crit})`, it.amount),
      ];
    }),
  );

  // ---- Levels ----
  const lv = new Map<string, { level: string; category: string; count: number; volume: number; amount: number }>();
  for (const e of elements) {
    const k = `${e.level}\u0000${e.category}`;
    const row = lv.get(k) ?? { level: e.level, category: e.category, count: 0, volume: 0, amount: 0 };
    row.count++;
    row.volume += e.volume;
    row.amount += rateFor(e, rates).amount ?? 0;
    lv.set(k, row);
  }
  const levelOrder = new Map(info.levels.map((l, i) => [l.name, i]));
  const levelRows = [...lv.values()].sort((a, b) => (levelOrder.get(a.level) ?? 1e9) - (levelOrder.get(b.level) ?? 1e9) || a.category.localeCompare(b.category));
  const ws2 = sheet('Levels', 'Bill of quantities — Levels');
  table(
    ws2,
    'Levels',
    [
      { name: 'Level', width: 24 },
      { name: 'Elevation (m)', width: 13, fmt: '#,##0.000' },
      { name: 'Category', width: 12 },
      { name: 'Count', width: 9, fmt: '#,##0', total: 'sum' },
      { name: 'Volume (m³)', width: 13, fmt: F_VOL, total: 'sum' },
      { name: 'Amount (₹)', width: 18, fmt: F_INR, total: 'sum' },
    ],
    levelRows.map((l, i) => {
      const r = 6 + i;
      const crit = `Elements!$${EL.level}:$${EL.level},A${r},Elements!$${EL.category}:$${EL.category},C${r}`;
      return [
        l.level || '(no level)', levelElev.get(l.level) ?? null, l.category,
        f(`COUNTIFS(${crit})`, l.count),
        f(`SUMIFS(Elements!$${EL.volume}:$${EL.volume},${crit})`, l.volume),
        f(`SUMIFS(Elements!$${EL.amount}:$${EL.amount},${crit})`, l.amount),
      ];
    }),
  );

  // ---- Elements ----
  const ws3 = sheet('Elements', 'Bill of quantities — Elements');
  table(
    ws3,
    'Elements',
    [
      { name: 'Mark', width: 10 },
      { name: 'Element ID', width: 11, fmt: '0' },
      { name: 'GlobalId', width: 25 },
      { name: 'Level', width: 22 },
      { name: 'Category', width: 11 },
      { name: 'Type', width: 34 },
      { name: 'Grade', width: 20 },
      { name: 'Length (m)', width: 11, fmt: F_DIM },
      { name: 'Width (m)', width: 10, fmt: F_DIM },
      { name: 'Depth (m)', width: 10, fmt: F_DIM },
      { name: 'Height (m)', width: 10, fmt: F_DIM },
      { name: 'Area (m²)', width: 11, fmt: F_DIM, total: 'sum' },
      { name: 'Volume (m³)', width: 12, fmt: F_VOL, total: 'sum' },
      { name: 'Rate (₹)', width: 11, fmt: F_INR },
      { name: 'Rate source', width: 11 },
      { name: 'Amount (₹)', width: 16, fmt: F_INR, total: 'sum' },
      { name: 'Quantity source', width: 15 },
    ],
    elRows,
  );
  elements.forEach((e, i) => {
    if (rateFor(e, rates).source === 'override') {
      const c = ws3.getCell(`${EL.rate}${6 + i}`);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
      c.font = { italic: true, bold: true, color: { argb: INPUT_TEXT } };
    }
  });

  // ---- Rates (the input sheet) ----
  const ws4 = sheet('Rates', 'Bill of quantities — Rates');
  ws4.getCell('A3').value = 'Type rates in the orange column. Summary, Levels and Elements recalculate. Rows marked Override on Elements keep their own rate.';
  table(
    ws4,
    'Rates',
    [
      { name: 'Key', width: 30 },
      { name: 'Category', width: 12 },
      { name: 'Grade / material', width: 24 },
      { name: 'Unit', width: 6 },
      { name: 'Rate (₹)', width: 12, fmt: F_INR },
      { name: 'Overrides', width: 10, fmt: '#,##0' },
      { name: 'Basis / note', width: 36 },
    ],
    items.map((it) => [it.key, it.category, it.grade, 'm³', it.rate, it.overrides, rates.edited.includes(it.key) ? 'Edited in Shanku' : rates.items[it.key] === undefined && it.rate !== null ? `Profile: ${CITY_PROFILES.find((c) => c.id === rates.profile?.id)?.name ?? 'custom'}` : null]),
  );
  items.forEach((_, i) => {
    const c = ws4.getCell(`E${6 + i}`);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
    c.font = { bold: true, color: { argb: INPUT_TEXT } };
  });

  // ---- Reinforcement (estimate from steel ratios; only when a ratio is set) ----
  const steel = effectiveRebar(rates);
  const rebar = rebarEstimate(elements, steel);
  const withRatio = rebar.rows.filter((r) => r.ratio !== null);
  if (withRatio.length) {
    const ws5 = sheet('Reinforcement', 'Bill of quantities — Reinforcement (estimate)');
    ws5.getCell('A3').value = 'Steel estimated from ratios (kg of steel per m³ of concrete). Change the orange cells; volumes follow the Elements sheet.';
    table(
      ws5,
      'Reinforcement',
      [
        { name: 'Category', width: 12 },
        { name: 'Concrete (m³)', width: 14, fmt: F_VOL, total: 'sum' },
        { name: 'Ratio (kg/m³)', width: 13, fmt: '#,##0' },
        { name: 'Usual range (kg/m³)', width: 19 },
        { name: 'Steel (kg)', width: 13, fmt: '#,##0', total: 'sum' },
        { name: 'Rate (₹/kg)', width: 12, fmt: F_INR },
        { name: 'Amount (₹)', width: 16, fmt: F_INR, total: 'sum' },
      ],
      withRatio.map((r, i) => {
        const row = 6 + i;
        const band = REBAR_BANDS[r.category];
        return [
          r.category,
          f(`SUMIFS(Elements!$${EL.volume}:$${EL.volume},Elements!$${EL.category}:$${EL.category},A${row})`, r.volume),
          r.ratio,
          band ? `${band[0]}–${band[1]}` : '—',
          f(`B${row}*C${row}`, r.kg),
          steel.rate,
          f(`IF(F${row}="","",E${row}*F${row})`, r.amount ?? ''),
        ];
      }),
    );
    withRatio.forEach((_, i) => {
      for (const col of ['C', 'F']) {
        const c = ws5.getCell(`${col}${6 + i}`);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
        c.font = { bold: true, color: { argb: INPUT_TEXT } };
      }
    });
  }

  // ---- Design system: title band, header row, banded rows, totals ----
  const MONO_COLS = new Set(['Element ID', 'GlobalId', 'Key']);
  for (const { ws, cols, rows } of branded) {
    const n = cols.length;
    for (let c = 1; c <= n; c++) {
      // Title band: paper ground with the accent rule under the title, as the app's title bar.
      for (let r = 1; r <= 4; r++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('brand-paper') } };
      ws.getCell(1, c).border = { bottom: { style: 'medium', color: { argb: argb('accent') } } };
      const h = ws.getCell(5, c);
      h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('brand-ink') } };
      h.font = { name: SANS, bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      h.alignment = { vertical: 'middle', wrapText: true };
      const mono = MONO_COLS.has(cols[c - 1].name);
      for (let r = 6; r < 6 + rows; r++) {
        const cell = ws.getCell(r, c);
        if (!cell.fill || (cell.fill as { pattern?: string }).pattern !== 'solid') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (r - 6) % 2 ? argb('brand-paper') : argb('field') } };
        cell.font = { ...(cell.font ?? {}), name: mono ? MONO : SANS, size: 10 };
        cell.border = { bottom: { style: 'hair', color: { argb: argb('border') } } };
      }
      const t = ws.getCell(6 + rows, c);
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('panel') } };
      t.font = { name: SANS, bold: true, size: 10, color: { argb: argb('brand-ink') } };
      t.border = { top: { style: 'medium', color: { argb: argb('accent') } } };
    }
    ws.getRow(5).height = 30;
  }

  // ---- About ----
  const ab = wb.addWorksheet('About');
  const geom = elements.filter((e) => e.quantitySource === 'geometry').length;
  const missing = items.filter((i) => i.rate === null).length;
  const aboutRows: Array<[string, string]> = [
    ['Generated by', `Shanku ${input.appVersion}`],
    ['Scope', input.scope ?? `Whole model · ${elements.length.toLocaleString('en-IN')} elements`],
    ['Source file', info.fileName],
    ['Export format', `${info.compatibility.format} — ${info.compatibility.level}`],
    ['Units', 'Dimensions m, areas m², volumes m³, rates ₹ per m³, amounts ₹'],
    ['Volumes', geom ? `IFC base quantities for ${elements.length - geom} elements; computed from 3D geometry for ${geom}.` : 'IFC base quantities for every element.'],
    ['Dimensions', 'Column width × depth and height; beam length, width, depth; slab length × width and thickness; wall length, thickness, height. From IFC quantities where reliable, else element bounds.'],
    ['Rates', `${items.length} rate items, ${missing} without a rate; ${Object.keys(rates.overrides).length} element overrides.`],
    ['Mark rules', input.markRules.join(', ')],
    ['Grade rules', `${input.gradeRules.join(', ')}; then the IFC material name`],
    ['Not included', withRatio.length ? 'Formwork, waste. Reinforcement is an estimate from steel ratios (Reinforcement sheet), not a bar bending schedule.' : 'Reinforcement, formwork, waste.'],
  ];
  aboutRows.forEach((r) => ab.addRow(r));
  ab.getColumn(1).width = 16;
  ab.getColumn(2).width = 100;
  ab.views = [{ showGridLines: false }];
  ab.properties.tabColor = { argb: argb('text-secondary') };
  ab.eachRow((row, i) => {
    row.getCell(1).font = { name: SANS, bold: true, size: 10, color: { argb: argb('text-secondary') } };
    row.getCell(2).font = { name: SANS, size: 10, color: { argb: argb('brand-ink') } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    for (const c of [1, 2]) row.getCell(c).border = { bottom: { style: 'hair', color: { argb: argb('border') } } };
    if (i % 2 === 0) for (const c of [1, 2]) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('brand-paper') } };
  });
  void itemKey;

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Saves a buffer as a file download. */
export function downloadFile(buffer: ArrayBuffer, fileName: string, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

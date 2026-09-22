import { siFactor, type ElementRecord, type ModelInfo } from '@shanku/engine';
import { itemKey, rateFor, rateItems, type RateBook } from './rates';

export interface BoqExportInput {
  info: ModelInfo;
  elements: readonly ElementRecord[];
  rates: RateBook;
  markRules: readonly string[];
  gradeRules: readonly string[];
  appVersion: string;
  /** For tests; defaults to now. */
  date?: Date;
  /** For tests: omit cached formula results so a spreadsheet engine must calculate them. */
  omitResults?: boolean;
}

const TABLE_STYLE = 'TableStyleMedium15'; // dark header, light bands: closest built-in to the design system
const INPUT_FILL = 'FFFFF7E8';
const INPUT_TEXT = 'FFA3500C';
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
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5 }] });
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A2').value = `${info.projectName || info.fileName} · ${info.fileName} · ${info.compatibility.format} (${info.compatibility.level}) · exported ${date.toLocaleString('en-IN')}`;
    ws.getCell('A3').value = 'Concrete quantities as modelled: net volumes, no deductions for waste or reinforcement. Rates in ₹ per m³.';
    ws.getCell('A2').font = ws.getCell('A3').font = { color: { argb: 'FF5B5F68' }, size: 10 };
    return ws;
  };
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
    items.map((it) => [it.key, it.category, it.grade, 'm³', it.rate, it.overrides, rates.edited.includes(it.key) ? 'Edited in Shanku' : null]),
  );
  items.forEach((_, i) => {
    const c = ws4.getCell(`E${6 + i}`);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } };
    c.font = { bold: true, color: { argb: INPUT_TEXT } };
  });

  // ---- About ----
  const ab = wb.addWorksheet('About');
  const geom = elements.filter((e) => e.quantitySource === 'geometry').length;
  const missing = items.filter((i) => i.rate === null).length;
  const aboutRows: Array<[string, string]> = [
    ['Generated by', `Shanku ${input.appVersion}`],
    ['Source file', info.fileName],
    ['Export format', `${info.compatibility.format} — ${info.compatibility.level}`],
    ['Units', 'Dimensions m, areas m², volumes m³, rates ₹ per m³, amounts ₹'],
    ['Volumes', geom ? `IFC base quantities for ${elements.length - geom} elements; computed from 3D geometry for ${geom}.` : 'IFC base quantities for every element.'],
    ['Dimensions', 'Column width × depth and height; beam length, width, depth; slab length × width and thickness; wall length, thickness, height. From IFC quantities where reliable, else element bounds.'],
    ['Rates', `${items.length} rate items, ${missing} without a rate; ${Object.keys(rates.overrides).length} element overrides.`],
    ['Mark rules', input.markRules.join(', ')],
    ['Grade rules', `${input.gradeRules.join(', ')}; then the IFC material name`],
    ['Not included', 'Reinforcement, formwork, waste.'],
  ];
  aboutRows.forEach((r) => ab.addRow(r));
  ab.getColumn(1).width = 16;
  ab.getColumn(2).width = 100;
  ab.getColumn(1).font = { bold: true };
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

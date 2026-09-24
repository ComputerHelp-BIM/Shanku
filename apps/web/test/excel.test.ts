import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import type { ElementRecord, ModelInfo } from '@shanku/engine';
import { buildBoqWorkbook } from '../src/lib/excel';
import { emptyRates, setItemRate, setOverride } from '../src/lib/rates';

const el = (i: number, level: string, category: ElementRecord['category'], grade: string, volume: number, dims: Partial<ElementRecord['dims']> = {}): ElementRecord => ({
  index: i, expressId: 100 + i, globalId: `G${i}`.padEnd(22, 'x'), ifcClass: 'IfcX', category, name: '', tag: '', typeName: 'T', level,
  mark: `M${i}`, markSource: '', grade, gradeSource: 'IfcMaterial', volume, area: null, length: null, quantitySource: 'ifc',
  dims: { length: null, width: null, depth: null, height: null, ...dims }, bounds: [0, 0, 0, 1, 1, 1],
});
const els = [
  el(0, 'L1', 'Column', 'RCC_COLUMN', 0.5, { width: 0.3, depth: 0.9, height: 2.8 }),
  el(1, 'L1', 'Column', 'RCC_COLUMN', 0.3),
  el(2, 'L2', 'Beam', 'RCC_BEAM', 1.0, { length: 4, width: 0.23, depth: 0.45 }),
  el(3, 'L2', 'Slab', 'RCC_SLAB', 2.0),
];
let rates = setItemRate(emptyRates(), 'Column|RCC_COLUMN', 8600);
rates = setItemRate(rates, 'Beam|RCC_BEAM', 8200);
rates = setOverride(rates, els[1].globalId, 9000);
const info = {
  fileName: 'm.ifc', projectName: 'P', schema: 'IFC4', units: { length: 'mm', area: 'm²', volume: 'm³' },
  levels: [{ name: 'L1', elevation: 0, elementCount: 2 }, { name: 'L2', elevation: 3200, elementCount: 2 }],
  compatibility: { level: 'recommended', format: 'IFC4 Reference View', notes: [] },
} as unknown as ModelInfo;
const expected = { col: 0.5 * 8600 + 0.3 * 9000, beam: 8200, total: 0.5 * 8600 + 0.3 * 9000 + 8200 };

describe('BOQ workbook (approved format)', () => {
  it('has the five sheets, Excel Tables, overrides and cached results', async () => {
    const buf = await buildBoqWorkbook({ info, elements: els, rates, markRules: ['Mark'], gradeRules: ['Grade'], appVersion: 't', date: new Date(0) });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Levels', 'Elements', 'Rates', 'About']);
    for (const n of ['Summary', 'Levels', 'Elements', 'Rates']) expect(wb.getWorksheet(n)!.getTable(n)).toBeTruthy();
    const e = wb.getWorksheet('Elements')!;
    expect(e.getCell('N7').value).toBe(9000); // override stored as a value
    expect(e.getCell('O7').value).toBe('Override');
    expect((e.getCell('N6').value as { formula: string }).formula).toContain('MATCH(E6&"|"&G6,Rates!$A:$A,0)');
    expect((e.getCell('N6').value as { result: number }).result).toBe(8600);
    expect(e.getCell('I6').value).toBe(0.3);
    expect(wb.getWorksheet('Levels')!.getCell('B7').value).toBeCloseTo(3.2);
  });

  it('adds the scope line and, with steel ratios, a Reinforcement sheet with live formulas', async () => {
    const withSteel = { ...rates, rebar: { ratios: { Column: 200, Beam: 1500 }, rate: 70 } };
    const buf = await buildBoqWorkbook({ info, elements: els, rates: withSteel, markRules: ['Mark'], gradeRules: ['Grade'], appVersion: 't', date: new Date(0), scope: 'L1 to L2 · 4 of 9 elements' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Levels', 'Elements', 'Rates', 'Reinforcement', 'About']);
    expect(wb.getWorksheet('Summary')!.getCell('A4').value).toBe('Scope: L1 to L2 · 4 of 9 elements');
    const r = wb.getWorksheet('Reinforcement')!;
    expect(r.getCell('A6').value).toBe('Column');
    expect((r.getCell('B6').value as { formula: string; result: number }).formula).toBe('SUMIFS(Elements!$M:$M,Elements!$E:$E,A6)');
    expect((r.getCell('B6').value as { result: number }).result).toBeCloseTo(0.8);
    expect((r.getCell('E6').value as { result: number }).result).toBeCloseTo(160);
    expect((r.getCell('G7').value as { result: number }).result).toBeCloseTo(1500 * 70);
    expect(r.getCell('D6').value).toBe('120–250');
    const about = wb.getWorksheet('About')!;
    expect(about.getCell('B2').value).toBe('L1 to L2 · 4 of 9 elements');
  });

  // Proves the formulas themselves: LibreOffice recalculates a workbook written without cached results.
  it.skipIf(!existsSync('/usr/bin/soffice'))('calculates the same totals in a real spreadsheet engine', async () => {
    const buf = await buildBoqWorkbook({ info, elements: els, rates, markRules: ['Mark'], gradeRules: ['Grade'], appVersion: 't', date: new Date(0), omitResults: true });
    const dir = mkdtempSync(join(tmpdir(), 'boq-'));
    writeFileSync(join(dir, 'b.xlsx'), Buffer.from(buf));
    execFileSync('soffice', ['--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', '--outdir', dir, join(dir, 'b.xlsx')], { stdio: 'ignore', timeout: 90_000 });
    const csv = (name: string) => readFileSync(join(dir, readdirSync(dir).find((f) => f.includes(name) && f.endsWith('.csv'))!), 'utf8');
    const num = (s: string) => Number(s.replace(/[",]/g, ''));
    const summary = csv('Summary').split('\n').map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
    const col = summary.find((r) => r[0] === 'Column')!;
    expect(num(col[2])).toBe(2);
    expect(num(col[3])).toBeCloseTo(0.8);
    expect(num(col[5])).toBe(8600);
    expect(num(col[6])).toBe(1);
    expect(num(col[7])).toBeCloseTo(expected.col, 2);
    const total = summary.find((r) => r[0] === 'Total')!;
    expect(num(total[7])).toBeCloseTo(expected.total, 2);
    const slab = summary.find((r) => r[0] === 'Slab')!;
    expect(slab[5]).toBe(''); // no rate -> empty, not zero
  }, 120_000);
});

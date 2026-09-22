import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildBoq, type ElementRecord, type ModelInfo } from '@shanku/engine';
import { buildBoqWorkbook } from '../src/lib/excel';

const el = (i: number, level: string, category: ElementRecord['category'], grade: string, volume: number, extra: Partial<ElementRecord> = {}): ElementRecord => ({
  index: i, expressId: 100 + i, globalId: `G${i}`.padEnd(22, 'x'), ifcClass: 'IfcColumn', category, name: '', tag: '', typeName: 'T', level,
  mark: `M${i}`, markSource: 'Identity Data.Mark', grade, gradeSource: 'IfcMaterial', volume, area: null, length: null, quantitySource: 'ifc',
  bounds: [0, 0, 0, 1, 1, 1], ...extra,
});

describe('BOQ workbook', () => {
  it('writes grouped rows with live SUM totals, an element sheet and an about sheet', async () => {
    const els = [el(0, 'L1', 'Column', 'RCC_COLUMN', 0.4, { length: 3 }), el(1, 'L1', 'Column', 'RCC_COLUMN', 0.6, { length: 3 }), el(2, 'L2', 'Beam', 'RCC_BEAM', 0.5, { length: 5, quantitySource: 'geometry' })];
    const levels = [{ name: 'L1', elevation: 0, elementCount: 2 }, { name: 'L2', elevation: 3, elementCount: 1 }];
    const boq = buildBoq(els, levels, ['level', 'category', 'grade']);
    const info = { fileName: 'm.ifc', projectName: 'P', schema: 'IFC4', compatibility: { level: 'recommended', format: 'IFC4 Reference View', notes: [] } } as unknown as ModelInfo;
    const buf = await buildBoqWorkbook({ info, boq, elements: els, markRules: ['Mark'], gradeRules: ['Grade'], appVersion: '0.6.0', date: new Date(0) });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['BOQ', 'Elements', 'About']);
    const ws = wb.getWorksheet('BOQ')!;
    expect(ws.getRow(5).values).toEqual([undefined, 'Level', 'Category', 'Grade / material', 'Count', 'Volume (m³)', 'Length (m)', 'Area (m²)', 'Elements from geometry']);
    expect(ws.getCell('A6').value).toBe('L1');
    expect(ws.getCell('D6').value).toBe(2);
    expect(ws.getCell('E6').value).toBeCloseTo(1.0);
    const total = ws.getCell('E8').value as { formula: string; result: number };
    expect(total.formula).toBe('SUM(E6:E7)');
    expect(total.result).toBeCloseTo(1.5);
    expect(wb.getWorksheet('Elements')!.rowCount).toBe(4);
    expect(wb.getWorksheet('Elements')!.getCell('L4').value).toBe('Geometry');
    expect(String(wb.getWorksheet('About')!.getCell('B7').value)).toMatch(/geometry for 1/);
  });
});

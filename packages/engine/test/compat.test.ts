import { describe, expect, it } from 'vitest';
import { assessCompatibility, readViewDefinition } from '../src/ifc/compat';
import { parseRules, rulePriority } from '../src/ifc/marks';

const base = { quantitySets: 100, revitPropertySets: true, elementCount: 100, elementsWithoutLevel: 0 };

describe('IFC compatibility', () => {
  it('reads the view definition from the header', () => {
    expect(readViewDefinition("FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]','RevitIdentifiers [x]'),'2;1');")).toBe('ReferenceView_V1.2');
  });
  it('ranks IFC4 Reference View with quantities as recommended', () => {
    expect(assessCompatibility({ ...base, schema: 'IFC4', viewDefinition: 'ReferenceView_V1.2' }).level).toBe('recommended');
  });
  it('rates IFC2x3 CV2.0 and Design Transfer View as supported, IFC4x3 as experimental', () => {
    expect(assessCompatibility({ ...base, schema: 'IFC2X3', viewDefinition: 'CoordinationView_V2.0, QuantityTakeOffAddOnView' }).level).toBe('supported');
    expect(assessCompatibility({ ...base, schema: 'IFC4', viewDefinition: 'DesignTransferView_V1.0' }).level).toBe('supported');
    expect(assessCompatibility({ ...base, schema: 'IFC4X3', viewDefinition: '' }).level).toBe('experimental');
  });
  it('downgrades and explains a file with no quantities', () => {
    const c = assessCompatibility({ ...base, quantitySets: 0, schema: 'IFC4', viewDefinition: 'ReferenceView_V1.2' });
    expect(c.level).toBe('supported');
    expect(c.notes[0]).toMatch(/Export base quantities/);
  });
  it('rates handover views as limited', () => {
    expect(assessCompatibility({ ...base, schema: 'IFC2X3', viewDefinition: 'BasicFMHandoverView' }).level).toBe('limited');
  });
});

describe('mark rules', () => {
  it('matches case-insensitively, with optional property-set qualifiers, in priority order', () => {
    const rules = parseRules(['Mark', '01--COLUMN_M.ID', 'Comments']);
    expect(rulePriority(rules, 'Identity Data', 'mark')).toBe(0);
    expect(rulePriority(rules, '01--column_m', 'ID')).toBe(1);
    expect(rulePriority(rules, 'Other', 'ID')).toBe(-1);
    expect(rulePriority(rules, 'Identity Data', 'Comments')).toBe(2);
  });
});

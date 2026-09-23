import { describe, expect, it } from 'vitest';
import { applyTemplate, exportTemplates, importTemplates, templateFromView, type ViewState } from '../src/lib/viewTemplates';

const view = (): ViewState => ({
  graphics: {
    categories: { Beam: { color: '#FF0000' } },
    elements: { 7: { halftone: true } },
    filters: [
      { id: 'a', name: 'Level 2', categories: [], combine: 'and', rules: [{ param: 'Level', op: 'equals', value: 'Level 2' }] },
      { id: 'unused', name: 'Unused', categories: [], combine: 'and', rules: [] },
    ],
    applied: [{ filterId: 'a', enabled: true, override: { transparency: 50 } }],
  },
  displayStyle: 'consistent',
  edges: false,
});

describe('view templates (Revit)', () => {
  it('captures the view, carrying only the filters it uses, as an independent copy', () => {
    const v = view();
    const t = templateFromView('Structure', v);
    expect(t.filters.map((f) => f.id)).toEqual(['a']);
    v.graphics.categories.Beam.color = '#000000';
    expect(t.categories.Beam.color).toBe('#FF0000');
  });

  it('applies included parts, keeps element overrides and parts not included', () => {
    const t = templateFromView('Structure', view());
    const blank: ViewState = { graphics: { categories: { Slab: { visible: false } }, elements: { 3: { color: '#00FF00' } }, filters: [], applied: [] }, displayStyle: 'shaded', edges: true };
    const r = applyTemplate(blank, { ...t, include: { categories: true, filters: true, visualStyle: false, edges: true } });
    expect(r.graphics.categories).toEqual({ Beam: { color: '#FF0000' } });
    expect(r.graphics.elements).toEqual({ 3: { color: '#00FF00' } });
    expect(r.graphics.filters.map((f) => f.id)).toEqual(['a']);
    expect(r.graphics.applied[0].override.transparency).toBe(50);
    expect(r.displayStyle).toBe('shaded'); // not included
    expect(r.edges).toBe(false);
  });

  it('exports and imports, renaming clashes', () => {
    const t = templateFromView('Structure', view());
    const back = importTemplates(exportTemplates([t]), [t]);
    expect(back[0].name).toBe('Structure (imported)');
    expect(back[0].id).not.toBe(t.id);
    expect(() => importTemplates('{"x":1}', [])).toThrow(/not a Shanku view template/);
  });
});

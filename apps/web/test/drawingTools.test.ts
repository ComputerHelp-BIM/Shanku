import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAWING_DISPLAY, indexEntities } from '@shanku/engine';
import {
  DEFAULT_QUICK_SELECT,
  countObjects,
  findText,
  formatPoint,
  hiddenMask,
  nextObjectVisibility,
  propsAsText,
  quickPropertyRows,
  quickSelect,
  selectSimilar,
  visibleObjects,
} from '../src/lib/drawingTools';
import { drawingMenu, VIEW_ONLY, type DrawingAction, type DrawingMenuState } from '../src/lib/drawingMenu';
import type { MenuItem } from '../src/lib/menu';

// Five objects: 0 and 1 are lines on layer 0 in colour 1, 2 a line on layer 1, 3 a polyline on
// layer 0 in colour 2, 4 an MTEXT on layer 1.
const types = ['LINE', 'LINE', 'LINE', 'LWPOLYLINE', 'MTEXT'];
const texts = [[0, 0, 100, 0, 'left', 'baseline', 'C12\n230X450', 3, 1, 4]] as never;
const index = indexEntities({
  handles: ['A', 'B', 'C', 'D', 'E'],
  segEnt: new Uint32Array([0, 1, 2, 3, 3]),
  segLayer: new Uint16Array([0, 0, 1, 0, 0]),
  segColor: new Uint16Array([1, 1, 1, 2, 2]),
  polyEnt: new Uint32Array([]),
  polyLayer: new Uint16Array([]),
  polyColor: new Uint16Array([]),
  texts,
});
const all = [true, true];

describe('object isolation (AutoCAD ISOLATEOBJECTS / HIDEOBJECTS)', () => {
  it('isolates, narrows, hides inside an isolation and ends', () => {
    const iso = nextObjectVisibility(null, 'isolate', [3, 1, 1]);
    expect(iso).toEqual({ mode: 'isolate', entities: [1, 3] });
    expect(nextObjectVisibility(iso, 'isolate', [3])).toEqual({ mode: 'isolate', entities: [3] });
    expect(nextObjectVisibility(iso, 'hide', [1])).toEqual({ mode: 'isolate', entities: [3] });
    expect(nextObjectVisibility(iso, 'end', [])).toBeNull();
  });

  it('adds up hidden objects and ignores an empty selection', () => {
    const h = nextObjectVisibility(null, 'hide', [2]);
    expect(nextObjectVisibility(h, 'hide', [0, 2])).toEqual({ mode: 'hide', entities: [0, 2] });
    expect(nextObjectVisibility(h, 'isolate', [])).toBe(h);
  });

  it('builds the viewer mask and the visible list', () => {
    expect(hiddenMask(null, 5)).toBeNull();
    expect([...hiddenMask({ mode: 'isolate', entities: [1, 9] }, 5)!]).toEqual([1, 0, 1, 1, 1]);
    expect([...hiddenMask({ mode: 'hide', entities: [1] }, 5)!]).toEqual([0, 1, 0, 0, 0]);
    expect(visibleObjects(index, all, null)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleObjects(index, [true, false], { mode: 'hide', entities: [0] })).toEqual([1, 3]);
  });
});

describe('selection tools', () => {
  it('Select Similar matches type, layer and colour, and keeps the seeds', () => {
    expect(selectSimilar(types, index, [0], [0, 1, 2, 3, 4])).toEqual([0, 1]); // 2 is on another layer, 3 is a polyline
    expect(selectSimilar(types, index, [0], [2, 3])).toEqual([0]);
  });

  it('Quick Select includes, excludes, scopes to the selection and appends', () => {
    const visible = [0, 1, 2, 3, 4];
    expect(quickSelect(types, index, visible, [], { ...DEFAULT_QUICK_SELECT, type: 'LINE' })).toEqual([0, 1, 2]);
    expect(quickSelect(types, index, visible, [], { ...DEFAULT_QUICK_SELECT, type: 'LINE', layer: 0 })).toEqual([0, 1]);
    expect(quickSelect(types, index, visible, [], { ...DEFAULT_QUICK_SELECT, type: 'LINE', apply: 'exclude' })).toEqual([3, 4]);
    expect(quickSelect(types, index, visible, [2, 3], { ...DEFAULT_QUICK_SELECT, scope: 'selection', type: 'LINE' })).toEqual([2]);
    expect(quickSelect(types, index, visible, [4], { ...DEFAULT_QUICK_SELECT, layer: 1, append: true, type: 'LINE' })).toEqual([2, 4]);
    expect(quickSelect(types, index, [0], [], { ...DEFAULT_QUICK_SELECT, type: 'MTEXT' })).toEqual([]); // hidden objects never match
  });

  it('Count groups by AutoCAD type name, most common first', () => {
    expect(countObjects(types, index, [0, 1, 2, 3, 4])).toEqual({ total: 5, byType: [['Line', 3], ['MText', 1], ['Polyline', 1]], layers: 2 });
  });
});

describe('Find text', () => {
  it('finds across lines, respects case, whole words and visibility', () => {
    expect(findText(texts, 'c12').map((h) => h.entity)).toEqual([4]);
    expect(findText(texts, 'c12', { matchCase: true })).toEqual([]);
    expect(findText(texts, '230', { wholeWord: true })).toEqual([]);
    expect(findText(texts, '230X450', { wholeWord: true })).toHaveLength(1);
    expect(findText(texts, 'C12', { isVisible: () => false })).toEqual([]);
    expect(findText(texts, '   ')).toEqual([]);
    expect(findText(texts, '(')).toEqual([]); // regex characters are literal
  });
});

describe('formatting', () => {
  it('reads coordinates like AutoCAD', () => {
    expect(formatPoint(3848.5544, 32325.7521)).toBe('3848.554, 32325.752, 0.000');
  });

  it('shows the Quick Properties rows AutoCAD shows for a polyline', () => {
    const p = { Type: 'Polyline', Handle: '2A', Layer: 'Part-1', Color: 'ByLayer', Linetype: 'ByLayer', 'Global width': 0, Closed: 'Yes', Vertices: 4 };
    expect(quickPropertyRows(p)).toEqual([
      ['Color', 'ByLayer'],
      ['Layer', 'Part-1'],
      ['Linetype', 'ByLayer'],
      ['Global width', '0'],
      ['Closed', 'Yes'],
    ]);
    expect(propsAsText({ Type: 'Line', Start: [1, 2] })).toBe('Type: Line\nStart: 1, 2');
  });
});

describe('2D right-click menus', () => {
  const state: DrawingMenuState = {
    selectionCount: 0,
    last: null,
    isolated: false,
    undo: null,
    redo: null,
    canPrevious: false,
    display: DEFAULT_DRAWING_DISPLAY,
    quickProperties: true,
    propertiesOpen: false,
    layersOpen: true,
  };
  const labels = (items: MenuItem[]) => items.flatMap((i) => (i.kind === 'item' ? [i.label] : []));
  const find = (items: MenuItem[], label: string) => items.find((i) => i.kind === 'item' && i.label === label) as Extract<MenuItem, { kind: 'item' }>;

  it('has the AutoCAD default menu when nothing is selected', () => {
    const items = drawingMenu(state, () => undefined);
    expect(labels(items)).toEqual(['Repeat', 'Clipboard', 'Isolate', 'Undo', 'Redo', 'Pan', 'Zoom', 'Zoom Window', 'Zoom Previous', 'Zoom Extents', 'Quick Select…', 'Count', 'Find…', 'Display', 'Layers', 'Properties']);
    expect(find(items, 'Repeat').disabled).toBe(true);
    expect(find(items, 'Zoom Previous').disabled).toBe(true);
    expect(find(items, 'Layers').checked).toBe(true);
    const iso = find(items, 'Isolate').submenu!;
    expect(iso.every((i) => i.kind !== 'item' || i.disabled)).toBe(true); // nothing selected, nothing isolated
  });

  it('has the AutoCAD edit menu with a selection; editing is greyed out and says why', () => {
    const items = drawingMenu({ ...state, selectionCount: 3, last: 'Zoom Window', isolated: true }, () => undefined);
    const l = labels(items);
    expect(l.slice(0, 3)).toEqual(['Repeat Zoom Window', 'Clipboard', 'Isolate']);
    for (const edit of ['Erase', 'Move', 'Copy Selection', 'Scale', 'Rotate', 'Draw Order', 'Group', 'Add Selected']) {
      expect(find(items, edit)).toMatchObject({ disabled: true, title: VIEW_ONLY });
    }
    expect(l).toContain('Select Similar');
    expect(l).toContain('Deselect All');
    expect(l).toContain('Count Selection (3)');
    expect(find(items, 'Quick Properties').checked).toBe(true);
    expect(find(items, 'Isolate').submenu!.every((i) => i.kind !== 'item' || !i.disabled)).toBe(true);
  });

  it('runs the chosen action', () => {
    const got: DrawingAction[] = [];
    const items = drawingMenu({ ...state, selectionCount: 1 }, (a) => got.push(a));
    find(items, 'Select Similar').onClick?.();
    const hide = find(items, 'Isolate').submenu!.find((i) => i.kind === 'item' && i.label === 'Hide Objects') as Extract<MenuItem, { kind: 'item' }>;
    hide.onClick?.();
    expect(got).toEqual(['selectSimilar', 'hide']);
  });
});

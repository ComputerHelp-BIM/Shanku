import type { CrosshairSize, DrawingDisplay } from '@shanku/engine';
import { item, sep, type MenuItem } from './menu';

/** Everything the 2D right-click menu can do; App.tsx carries each one out. */
export type DrawingAction =
  | 'repeat'
  | 'copyPoint'
  | 'copyProps'
  | 'copyHandles'
  | 'isolate'
  | 'hide'
  | 'endIsolation'
  | 'undo'
  | 'redo'
  | 'pan'
  | 'zoom'
  | 'zoomWindow'
  | 'zoomPrevious'
  | 'zoomExtents'
  | 'zoomSelection'
  | 'selectSimilar'
  | 'deselectAll'
  | 'quickSelect'
  | 'count'
  | 'find'
  | 'properties'
  | 'quickProperties'
  | 'layers'
  | 'grid'
  | 'ucsIcon'
  | `crosshair:${CrosshairSize}`;

export interface DrawingMenuState {
  selectionCount: number;
  /** Last command run from this menu, for Repeat. */
  last: string | null;
  /** Objects are isolated or hidden. */
  isolated: boolean;
  undo: string | null;
  redo: string | null;
  canPrevious: boolean;
  display: DrawingDisplay;
  quickProperties: boolean;
  propertiesOpen: boolean;
  layersOpen: boolean;
}

/** Why editing entries are greyed out; shown as their tooltip. */
export const VIEW_ONLY = 'Shanku opens drawings to view and check them; editing is not available yet.';

/**
 * AutoCAD's shortcut menus for the drawing area: the default menu when nothing is selected, and the
 * edit menu when objects are selected. Same order and names as AutoCAD, so muscle memory works;
 * editing entries are there but greyed out, with a tooltip saying why.
 */
export function drawingMenu(s: DrawingMenuState, act: (a: DrawingAction) => void): MenuItem[] {
  const has = s.selectionCount > 0;
  const a = (label: string, action: DrawingAction, opts: Parameters<typeof item>[2] = {}) => item(label, () => act(action), opts);
  const viewOnly = (label: string, submenu?: string[]) => item(label, undefined, { disabled: true, title: VIEW_ONLY, submenu: submenu?.map((l) => item(l, undefined, { disabled: true })) });

  const repeat = item(s.last ? `Repeat ${s.last}` : 'Repeat', () => act('repeat'), { disabled: !s.last });
  const clipboard = item('Clipboard', undefined, {
    submenu: [
      ...(has ? [a('Copy Properties', 'copyProps'), a('Copy Handles', 'copyHandles')] : []),
      a('Copy Point Coordinates', 'copyPoint'),
      sep,
      item('Paste', undefined, { disabled: true, title: VIEW_ONLY }),
    ],
  });
  const isolate = item('Isolate', undefined, {
    submenu: [
      a('Isolate Objects', 'isolate', { disabled: !has }),
      a('Hide Objects', 'hide', { disabled: !has }),
      a('End Object Isolation', 'endIsolation', { disabled: !s.isolated }),
    ],
  });
  const display = item('Display', undefined, {
    submenu: [
      a('Grid', 'grid', { checked: s.display.grid, hint: 'F7' }),
      a('UCS Icon', 'ucsIcon', { checked: s.display.ucsIcon }),
      sep,
      a('Crosshair: Small', 'crosshair:small', { checked: s.display.crosshair === 'small' }),
      a('Crosshair: Full Screen', 'crosshair:full', { checked: s.display.crosshair === 'full' }),
      a('Crosshair: Off (Arrow)', 'crosshair:off', { checked: s.display.crosshair === 'off' }),
    ],
  });
  const find = a('Find…', 'find');
  const quickSelect = a('Quick Select…', 'quickSelect');

  if (!has) {
    return [
      repeat,
      clipboard,
      isolate,
      sep,
      a(s.undo ? `Undo ${s.undo}` : 'Undo', 'undo', { disabled: !s.undo, hint: 'Ctrl + Z' }),
      a(s.redo ? `Redo ${s.redo}` : 'Redo', 'redo', { disabled: !s.redo, hint: 'Ctrl + Y' }),
      sep,
      a('Pan', 'pan'),
      a('Zoom', 'zoom'),
      a('Zoom Window', 'zoomWindow', { hint: 'ZR' }),
      a('Zoom Previous', 'zoomPrevious', { disabled: !s.canPrevious, hint: 'ZP' }),
      a('Zoom Extents', 'zoomExtents', { hint: 'ZF' }),
      sep,
      quickSelect,
      a('Count', 'count'),
      find,
      sep,
      display,
      a('Layers', 'layers', { checked: s.layersOpen }),
      a('Properties', 'properties', { checked: s.propertiesOpen }),
    ];
  }
  return [
    repeat,
    clipboard,
    isolate,
    sep,
    viewOnly('Erase'),
    viewOnly('Move'),
    viewOnly('Copy Selection'),
    viewOnly('Scale'),
    viewOnly('Rotate'),
    viewOnly('Draw Order', ['Bring to Front', 'Send to Back']),
    viewOnly('Group', ['Group', 'Ungroup']),
    sep,
    viewOnly('Add Selected'),
    a('Select Similar', 'selectSimilar'),
    a('Deselect All', 'deselectAll', { hint: 'Esc' }),
    sep,
    a('Zoom to Selection', 'zoomSelection'),
    quickSelect,
    a(s.selectionCount > 1 ? `Count Selection (${s.selectionCount.toLocaleString('en-IN')})` : 'Count Selection', 'count'),
    find,
    sep,
    a('Properties', 'properties', { checked: s.propertiesOpen }),
    a('Quick Properties', 'quickProperties', { checked: s.quickProperties }),
  ];
}

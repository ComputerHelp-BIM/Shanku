/** Revit-style two-letter shortcuts, typed in sequence with no modifier. */
export type CommandId =
  | 'fit'
  | 'previous'
  | 'zoomRegion'
  | 'isolateElement'
  | 'isolateCategory'
  | 'hideElement'
  | 'resetHidden'
  | 'wireframe'
  | 'hiddenLine'
  | 'shaded'
  | 'consistent'
  | 'sectionBox';

export const SEQUENCES: Record<string, CommandId> = {
  ZF: 'fit',
  ZE: 'fit',
  ZX: 'fit',
  ZA: 'fit',
  ZP: 'previous',
  ZC: 'previous',
  ZR: 'zoomRegion',
  ZZ: 'zoomRegion',
  HI: 'isolateElement',
  IC: 'isolateCategory',
  HH: 'hideElement',
  HR: 'resetHidden',
  WF: 'wireframe',
  HL: 'hiddenLine',
  SD: 'shaded',
  CO: 'consistent',
  BX: 'sectionBox',
};

/**
 * Feeds letters and returns a command when the last two letters (typed within
 * `windowMs`) form a known sequence.
 */
export function createSequenceReader(windowMs = 1500) {
  let last = '';
  let lastAt = 0;
  return (letter: string, now: number): CommandId | null => {
    const l = letter.toUpperCase();
    const pair = now - lastAt <= windowMs ? last + l : '';
    const hit = pair.length === 2 ? SEQUENCES[pair] ?? null : null;
    last = hit ? '' : l;
    lastAt = now;
    return hit;
  };
}

/** Shown in the Keyboard tab. */
export const SHORTCUT_HELP: Array<{ keys: string; action: string }> = [
  { keys: 'Middle-drag', action: 'Pan' },
  { keys: 'Shift + middle-drag', action: 'Orbit (about the selection, else the model)' },
  { keys: 'Wheel', action: 'Zoom about the cursor' },
  { keys: 'Double middle-click', action: 'Zoom to fit' },
  { keys: 'Alt + drag / Alt + Shift + drag', action: 'Orbit / pan on a trackpad' },
  { keys: 'Click', action: 'Select' },
  { keys: 'Ctrl + click / Shift + click', action: 'Add to / remove from selection' },
  { keys: 'Drag left → right', action: 'Window select (fully inside)' },
  { keys: 'Drag right → left', action: 'Crossing select (touching)' },
  { keys: 'Esc', action: 'Clear selection, cancel zoom region' },
  { keys: 'Home', action: 'Default 3D view, whole model' },
  { keys: 'ZF · ZE · ZX · ZA', action: 'Zoom to fit' },
  { keys: 'ZP · ZC', action: 'Previous pan/zoom' },
  { keys: 'ZR · ZZ', action: 'Zoom in region (then drag)' },
  { keys: 'HI · IC', action: 'Isolate element · isolate category' },
  { keys: 'HH · HR', action: 'Hide element · reset temporary hide/isolate' },
  { keys: 'BX', action: 'Section box around the selection (again to remove)' },
  { keys: 'WF · HL · SD · CO', action: 'Wireframe · hidden line · shaded · consistent colours' },
  { keys: 'Ctrl + K', action: 'Find by Element ID, GlobalId or name' },
  { keys: 'Ctrl + ` (or Ctrl + Shift + `)', action: 'Toggle this panel' },
];

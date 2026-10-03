import type { DisplayStyle } from '@cad2bim/engine';

/** cad2bim's version, shown in the status bar and the Guide (kept in step with package.json). */
export const APP_VERSION = '0.57.0';
/** The view bar's visual styles, with their shortcuts. */
export const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  // Revit's order and names; Consistent Colors has no default shortcut in Revit (CO is Copy)
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
  { id: 'hiddenLine', label: 'Hidden Line', keys: 'HL' },
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent Colors', keys: '' },
  { id: 'realistic', label: 'Realistic', keys: '' },
]
/** The ribbon's tabs, in order; Revit comes last, where Revit puts add-in tabs. */
export const RIBBON_TABS = ['Model', 'Modify', 'Annotate', 'View', 'Manage', 'Revit'].map((label) => ({ id: label.toLowerCase(), label }));

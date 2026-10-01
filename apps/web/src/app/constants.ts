import type { DisplayStyle } from '@shanku/engine';

/** Shanku's version, shown in the status bar and the Guide (kept in step with package.json). */
export const APP_VERSION = '0.54.0';
/** The view bar's visual styles, with their shortcuts. */
export const STYLES: Array<{ id: DisplayStyle; label: string; keys: string }> = [
  { id: 'shaded', label: 'Shaded', keys: 'SD' },
  { id: 'consistent', label: 'Consistent', keys: 'CO' },
  { id: 'hiddenLine', label: 'Hidden line', keys: 'HL' },
  { id: 'wireframe', label: 'Wireframe', keys: 'WF' },
  { id: 'realistic', label: 'Realistic', keys: '' },
];
/** The ribbon's tabs, in order; Revit comes last, where Revit puts add-in tabs. */
export const RIBBON_TABS = ['Model', 'Modify', 'Annotate', 'View', 'Manage', 'Revit'].map((label) => ({ id: label.toLowerCase(), label }));

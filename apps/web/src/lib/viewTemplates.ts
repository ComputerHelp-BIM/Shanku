/**
 * Revit-style View Templates: named view settings kept on this device (and exportable as JSON), applied
 * to the current view as one undoable step. Each part has an Include switch, as in Revit.
 */
import type { DisplayStyle } from '@shanku/engine';
import type { AppliedFilter, ViewFilter } from './filters';
import type { CategoryOverrides, ViewGraphics } from './visibility';

export interface TemplateIncludes {
  /** V/G Overrides Model (per category). */
  categories: boolean;
  /** V/G Overrides Filters (definitions travel with the template). */
  filters: boolean;
  visualStyle: boolean;
  edges: boolean;
}

export interface ViewTemplate {
  id: string;
  name: string;
  include: TemplateIncludes;
  categories: CategoryOverrides;
  filters: ViewFilter[];
  applied: AppliedFilter[];
  displayStyle: DisplayStyle;
  edges: boolean;
}

/** What a template reads from and writes to. Element overrides stay with the view (as in Revit). */
export interface ViewState {
  graphics: ViewGraphics;
  displayStyle: DisplayStyle;
  edges: boolean;
}

export const ALL_INCLUDED: TemplateIncludes = { categories: true, filters: true, visualStyle: true, edges: true };

export function newTemplateId(): string {
  return `vt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Revit: Create Template from Current View. Copies, so later view edits do not change the template. */
export function templateFromView(name: string, v: ViewState): ViewTemplate {
  const used = new Set(v.graphics.applied.map((a) => a.filterId));
  return structuredClone({
    id: newTemplateId(),
    name,
    include: { ...ALL_INCLUDED },
    categories: v.graphics.categories,
    filters: v.graphics.filters.filter((f) => used.has(f.id)),
    applied: v.graphics.applied,
    displayStyle: v.displayStyle,
    edges: v.edges,
  });
}

/**
 * Revit: Apply Template Properties to Current View. Included parts replace the view's; filter
 * definitions the template needs are added (same id: the template's version wins); the rest stays.
 */
export function applyTemplate(v: ViewState, t: ViewTemplate): ViewState {
  const g = v.graphics;
  let filters = g.filters;
  if (t.include.filters) {
    const byId = new Map(filters.map((f) => [f.id, f]));
    for (const f of t.filters) byId.set(f.id, structuredClone(f));
    filters = [...byId.values()];
  }
  return {
    graphics: {
      ...g,
      categories: t.include.categories ? structuredClone(t.categories) : g.categories,
      filters,
      applied: t.include.filters ? structuredClone(t.applied) : g.applied,
    },
    displayStyle: t.include.visualStyle ? t.displayStyle : v.displayStyle,
    edges: t.include.edges ? t.edges : v.edges,
  };
}

// ---- storage (this device) and exchange (JSON file)
const KEY = 'shanku.viewTemplates';
const FORMAT = 'shanku.viewTemplates/1';

export function loadTemplates(): ViewTemplate[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return j?.format === FORMAT && Array.isArray(j.templates) ? j.templates : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: ViewTemplate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ format: FORMAT, templates }));
  } catch {
    /* storage unavailable: templates last for this session */
  }
}

export function exportTemplates(templates: ViewTemplate[]): string {
  return JSON.stringify({ format: FORMAT, exported: new Date().toISOString(), templates }, null, 2);
}

/** Reads an exported file. Imported templates get new ids and " (imported)" if a name is taken. */
export function importTemplates(text: string, existing: ViewTemplate[]): ViewTemplate[] {
  const j = JSON.parse(text);
  if (j?.format !== FORMAT || !Array.isArray(j.templates)) throw new Error('This is not a Shanku view template file.');
  const names = new Set(existing.map((t) => t.name));
  return j.templates.map((t: ViewTemplate) => ({
    ...t,
    include: { ...ALL_INCLUDED, ...t.include },
    id: newTemplateId(),
    name: names.has(t.name) ? `${t.name} (imported)` : t.name,
  }));
}

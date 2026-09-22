/**
 * How well an IFC export suits Shanku. Pure function over facts read from the file,
 * so it is easy to test and to explain in the UI.
 */
export type CompatLevel = 'recommended' | 'supported' | 'limited' | 'experimental';

export interface CompatFacts {
  schema: string;
  /** From FILE_DESCRIPTION, e.g. "ReferenceView_V1.2" or "CoordinationView_V2.0, QuantityTakeOffAddOnView". */
  viewDefinition: string;
  quantitySets: number;
  /** Revit writes parameter groups as property sets named like "Dimensions", "Constraints". */
  revitPropertySets: boolean;
  /** The header names Revit / Autodesk as the authoring tool (only then are Revit property sets expected). */
  fromRevit?: boolean;
  elementCount: number;
  elementsWithoutLevel: number;
}

export interface Compatibility {
  level: CompatLevel;
  /** Human name of the export, e.g. "IFC4 Reference View". */
  format: string;
  /** One line per finding, most important first. */
  notes: string[];
}

export const RECOMMENDED_EXPORT = 'IFC4 Reference View [Structural] with the Shanku settings (base quantities, Revit property sets, split by level, store IFC GUID)';

export function readViewDefinition(head: string): string {
  const m = head.match(/ViewDefinition\s*\[([^\]]*)\]/i);
  return m ? m[1].trim() : '';
}

export function assessCompatibility(f: CompatFacts): Compatibility {
  const schema = f.schema.toUpperCase();
  const view = f.viewDefinition.toLowerCase();
  let level: CompatLevel;
  let format: string;
  const notes: string[] = [];

  if (schema.startsWith('IFC4X3')) {
    level = 'experimental';
    format = 'IFC4x3';
    notes.push('IFC4x3 export from Revit is experimental. Geometry opens; properties and quantities may be incomplete.');
  } else if (schema === 'IFC4' && view.includes('referenceview')) {
    level = 'recommended';
    format = 'IFC4 Reference View';
  } else if (schema === 'IFC4' && view.includes('designtransferview')) {
    level = 'supported';
    format = 'IFC4 Design Transfer View';
    notes.push('Design Transfer View is marked unofficial in Revit. It works, and keeps material profiles for future editing.');
  } else if (schema === 'IFC2X3' && view.includes('coordinationview_v2')) {
    level = 'supported';
    format = 'IFC2x3 Coordination View 2.0';
    notes.push('IFC2x3 exports no quantities for stairs. IFC4 Reference View is preferred.');
  } else if (schema === 'IFC4' || schema === 'IFC2X3') {
    level = 'limited';
    format = `${schema === 'IFC4' ? 'IFC4' : 'IFC2x3'}${f.viewDefinition ? ` ${f.viewDefinition.split(',')[0]}` : ''}`;
    notes.push('This export view targets handover or checking, not structural models. Geometry opens; expect missing properties.');
  } else {
    level = 'limited';
    format = schema || 'Unknown schema';
    notes.push(`Schema ${schema || 'unknown'} is older than Shanku targets. Re-export as IFC4 Reference View.`);
  }

  if (f.quantitySets === 0) {
    notes.unshift('No base quantities: volumes and areas for the BOQ are missing. In Revit, turn on "Export base quantities".');
    if (level === 'recommended') level = 'supported';
  }
  if (!f.revitPropertySets && f.fromRevit !== false) notes.push('No Revit property sets (material, dimensions, marks). Turn on "Export Revit property sets" if this came from Revit.');
  if (f.elementCount > 0 && f.elementsWithoutLevel / f.elementCount > 0.05)
    notes.push(`${f.elementsWithoutLevel} elements have no level. Turn on "Split walls, columns, ducts by level".`);
  if (level === 'recommended' && notes.length === 0) notes.push('Best format for Shanku: quantities, properties and levels all present.');
  return { level, format, notes };
}

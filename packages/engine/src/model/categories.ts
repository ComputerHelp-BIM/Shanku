import type { Category } from './types';

/** IFC class (upper case, as web-ifc names it) -> Shanku category. */
const MAP: Record<string, Category> = {
  IFCCOLUMN: 'Column',
  IFCCOLUMNSTANDARDCASE: 'Column',
  IFCBEAM: 'Beam',
  IFCBEAMSTANDARDCASE: 'Beam',
  IFCSLAB: 'Slab',
  IFCSLABSTANDARDCASE: 'Slab',
  IFCSLABELEMENTEDCASE: 'Slab',
  IFCWALL: 'Wall',
  IFCWALLSTANDARDCASE: 'Wall',
  IFCWALLELEMENTEDCASE: 'Wall',
  IFCFOOTING: 'Footing',
  IFCPILE: 'Pile',
  IFCREINFORCINGBAR: 'Rebar',
  IFCREINFORCINGMESH: 'Rebar',
  IFCTENDON: 'Rebar',
  IFCSTAIR: 'Stair',
  IFCSTAIRFLIGHT: 'Stair',
  IFCMEMBER: 'Member',
  IFCMEMBERSTANDARDCASE: 'Member',
  IFCPLATE: 'Plate',
  IFCPLATESTANDARDCASE: 'Plate',
};

export function categoryOf(ifcClassUpper: string): Category {
  return MAP[ifcClassUpper.toUpperCase()] ?? 'Other';
}

const PRETTY: Record<string, string> = {
  IFCBEAMSTANDARDCASE: 'IfcBeamStandardCase',
  IFCCOLUMNSTANDARDCASE: 'IfcColumnStandardCase',
  IFCWALLSTANDARDCASE: 'IfcWallStandardCase',
  IFCSLABSTANDARDCASE: 'IfcSlabStandardCase',
  IFCMEMBERSTANDARDCASE: 'IfcMemberStandardCase',
  IFCPLATESTANDARDCASE: 'IfcPlateStandardCase',
  IFCREINFORCINGBAR: 'IfcReinforcingBar',
  IFCREINFORCINGMESH: 'IfcReinforcingMesh',
  IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  IFCSTAIRFLIGHT: 'IfcStairFlight',
  IFCFLOWSEGMENT: 'IfcFlowSegment',
  IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
};

/** "IFCBEAMSTANDARDCASE" -> "IfcBeamStandardCase" for display. */
export function prettyIfcClass(upper: string): string {
  const key = upper.toUpperCase();
  if (PRETTY[key]) return PRETTY[key];
  const body = key.startsWith('IFC') ? key.slice(3) : key;
  return 'Ifc' + body.charAt(0) + body.slice(1).toLowerCase();
}

/** Order used in the project browser and status bar. */
export const CATEGORY_ORDER: Category[] = [
  'Footing',
  'Pile',
  'Column',
  'Wall',
  'Beam',
  'Slab',
  'Stair',
  'Member',
  'Plate',
  'Rebar',
  'Other',
];

export const CATEGORY_PLURAL: Record<Category, string> = {
  Column: 'Columns',
  Beam: 'Beams',
  Slab: 'Slabs',
  Wall: 'Walls',
  Footing: 'Footings',
  Pile: 'Piles',
  Rebar: 'Rebar',
  Stair: 'Stairs',
  Member: 'Members',
  Plate: 'Plates',
  Other: 'Other',
};

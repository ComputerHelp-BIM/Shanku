/**
 * "What is in this file?" (from the Structura viewer): when a file does not open, Shanku looks at
 * its first and last bytes, says what the file really is, and gives the export steps that produce
 * a file it can read. Nothing leaves the device; the report is plain text the user can copy.
 */

export interface DiagnosisInput {
  name: string;
  size: number;
  /** First bytes of the file (64 KB is plenty). */
  head: Uint8Array;
  /** Last bytes, for spotting a cut-off IFC. */
  tail?: Uint8Array;
  /** The error Shanku hit, if it tried to open the file. */
  error?: string;
}

export interface Diagnosis {
  /** Human name of what the file is: "Revit project", "IFC (STEP)". */
  format: string;
  title: string;
  steps: string[];
  /** Plain-text report for support, one fact per line. */
  report: string;
}

const text = (b: Uint8Array, n = b.length) => new TextDecoder('latin1').decode(b.subarray(0, Math.min(n, b.length)));
const hex = (b: Uint8Array, n = 16) => [...b.subarray(0, n)].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Schema, view definition and authoring tool from an IFC STEP header. */
export function ifcHeader(head: string): { schema: string | null; view: string | null; writer: string | null } {
  const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(head)?.[1] ?? null;
  const view = /ViewDefinition\s*\[([^\]]+)\]/i.exec(head)?.[1]?.trim() ?? null;
  // FILE_NAME(name, time, (author), (organization), preprocessor, originating_system, authorization)
  const fileName = /FILE_NAME\s*\(([\s\S]*?)\)\s*;/i.exec(head)?.[1] ?? '';
  const parts = fileName.match(/'(?:[^']|'')*'|\([^)]*\)|\$/g) ?? [];
  const writer = parts[5]?.replace(/^'|'$/g, '').trim() || parts[4]?.replace(/^'|'$/g, '').trim() || null;
  return { schema, view, writer: writer && writer !== '$' ? writer : null };
}

type Advice = Pick<Diagnosis, 'format' | 'title' | 'steps'>;

const EXPORT_IFC = [
  'Revit: File → Export → IFC. Choose IFC4 Reference View (or IFC 2x3 Coordination View 2.0) and tick "Export base quantities".',
  'Tekla Structures: File → Export → IFC.',
  'Other BIM programs: look for Export → IFC.',
];

function advise(i: DiagnosisInput, head: string, tailText: string): Advice {
  const ext = i.name.toLowerCase().split('.').pop() ?? '';
  const b = i.head;
  if (i.size === 0) return { format: 'Empty file', title: 'The file is empty', steps: ['The download, copy or export probably failed part way. Export or download it again.'] };
  if (/^\s*ISO-10303-21/.test(head)) {
    const cut = i.tail && tailText && !/END-ISO-10303-21\s*;?\s*$/.test(tailText.trim());
    if (cut) return { format: 'IFC (STEP), cut off', title: 'The IFC file is incomplete', steps: ['It does not end with END-ISO-10303-21, so the export or download stopped early.', 'Export it again, and check the file size matches the original.'] };
    return { format: 'IFC (STEP)', title: 'This IFC file could not be read', steps: ['Export it again from the source program; an older or unusual export option can produce files Shanku cannot read.', ...EXPORT_IFC, 'If it still fails, copy the report below and send it to us.'] };
  }
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === 'ifczip' || /\.ifc/i.test(head)) return { format: 'IFC in a ZIP (ifcZIP)', title: 'Unzip it first', steps: ['This is a compressed IFC. Unzip it (right-click → Extract all) and open the .ifc file inside.'] };
    return { format: 'ZIP archive', title: 'Unzip it first', steps: ['This is a ZIP archive. Extract it and open the .ifc or .dxf file inside.'] };
  }
  if (/^\s*<\?xml/.test(head) && /ifcXML|iso_10303_28/i.test(head)) return { format: 'ifcXML', title: 'Export IFC as STEP (.ifc) instead of XML', steps: ['Shanku reads IFC in the usual STEP format (.ifc). In the export dialog choose .ifc, not .ifcXML.'] };
  if (/^AC10\d\d/.test(head) || ext === 'dwg') return { format: 'AutoCAD DWG', title: 'Save the drawing as DXF', steps: ['AutoCAD: Save As → AutoCAD DXF (any version), or type DXFOUT.', 'No AutoCAD? The free ODA File Converter turns DWG into DXF.', 'Then open the DXF in Shanku (Model → DXF).'] };
  if (head.startsWith('AutoCAD Binary DXF')) return { format: 'Binary DXF', title: 'Save the drawing as ASCII DXF', steps: ['This DXF is in the binary format. In AutoCAD, Save As → DXF and choose ASCII (the default).'] };
  if (/^\s*0\s*\r?\n\s*SECTION/.test(head) || /^\s*999\s*\r?\n/.test(head) || ext === 'dxf')
    return { format: 'DXF drawing', title: 'This DXF could not be read', steps: ['Open it in AutoCAD, run AUDIT (fix errors: Yes) and PURGE, then save it again as DXF.', 'Very old or hand-made DXF files sometimes miss the header; saving from AutoCAD adds it.', 'If it still fails, copy the report below and send it to us.'] };
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && (ext === 'rvt' || ext === 'rfa' || ext === 'rte'))
    return { format: ext === 'rfa' ? 'Revit family' : 'Revit project', title: 'Export IFC from Revit', steps: ['Shanku does not read Revit files directly. In Revit: File → Export → IFC.', 'Choose IFC4 Reference View (or IFC 2x3 Coordination View 2.0) and tick "Export base quantities" so the BOQ uses Revit’s quantities.', 'Then open the .ifc in Shanku.'] };
  if (['edb', 'ebk', 'e2k', '$et'].includes(ext))
    return { format: 'ETABS model', title: 'ETABS files are not read yet', steps: ['The ETABS importer is planned. For now, open the model in the Structura viewer, which reads ETABS text files (.e2k, .$et).', 'For an .edb file: in ETABS, File → Export → ETABS .e2k Text File.', 'If your ETABS version offers File → Export → IFC, that IFC opens in Shanku.'] };
  if (['sdb', 's2k', '$2k'].includes(ext))
    return { format: 'SAP2000 model', title: 'SAP2000 files are not read yet', steps: ['Open the model in the Structura viewer, which reads SAP2000 text files (.s2k, .$2k).', 'For an .sdb file: in SAP2000, File → Export → SAP2000 .s2k Text File.'] };
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) return { format: 'PDF document', title: 'PDF drawings cannot be opened', steps: ['A PDF has no model or layers Shanku can use. Ask for the DXF (2D) or the IFC (3D) instead.'] };
  if (ext === 'skp') return { format: 'SketchUp model', title: 'Export IFC from SketchUp', steps: ['SketchUp Pro: File → Export → 3D Model → IFC. Then open the .ifc in Shanku.'] };
  if (ext === 'nwd' || ext === 'nwc' || ext === 'nwf') return { format: 'Navisworks file', title: 'Export IFC from the source model', steps: ['Navisworks files cannot be read. Ask for an IFC exported from the program that made the model.'] };
  if (ext === 'std') return { format: 'STAAD.Pro model', title: 'STAAD.Pro files are not read', steps: ['Export an IFC or a DXF from STAAD.Pro, or from the drawing program the model came from.'] };
  return { format: `Unknown (.${ext || 'no extension'})`, title: 'Shanku cannot open this kind of file', steps: ['Shanku opens IFC models (.ifc) and DXF drawings (.dxf).', ...EXPORT_IFC, 'For drawings: save or export as DXF.'] };
}

/** What the file is, what to do about it, and a report to copy. */
export function diagnoseFile(i: DiagnosisInput, extra: string[] = []): Diagnosis {
  const head = text(i.head, 65536);
  const tailText = i.tail ? text(i.tail) : '';
  const a = advise(i, head, tailText);
  const lines = [`File: ${i.name}`, `Size: ${fmtSize(i.size)} (${i.size.toLocaleString('en-IN')} bytes)`, `Detected: ${a.format}`, `Starts with: ${hex(i.head) || '(nothing)'}`];
  if (/^\s*ISO-10303-21/.test(head)) {
    const h = ifcHeader(head);
    lines.push(`IFC schema: ${h.schema ?? 'not stated'}`, `View definition: ${h.view ?? 'not stated'}`, `Written by: ${h.writer ?? 'not stated'}`);
    if (i.tail) lines.push(`Ends with END-ISO-10303-21: ${/END-ISO-10303-21\s*;?\s*$/.test(tailText.trim()) ? 'yes' : 'no'}`);
  }
  const acadver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/.exec(head)?.[1];
  if (acadver) lines.push(`DXF version: ${acadver}`);
  if (i.error) lines.push(`Error: ${i.error}`);
  lines.push(...extra);
  return { ...a, report: lines.join('\n') };
}

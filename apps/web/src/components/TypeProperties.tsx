import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, PropertiesFooter, PropertyGrid, PropertyRow, PropertySection, usePropertySort } from '@shanku/ui';
import { Viewer, type ParsedModel } from '@shanku/engine';
import { typeNameProblem } from '../lib/editChecks';
import { byGroup, stageOp, stageTypeEdit, typeKey, type PendingChange, type RevitElementParams, type RevitParam, type TypeRef } from '../lib/paramEdits';

const LOAD_LATER = 'Loading families comes later: load them in Revit (Insert → Load Family).';
const RENAME_LATER = 'Renaming a type comes later: rename it in Revit, or Duplicate here.';

/** A small 3D view of one instance of the type, as Revit's Preview. */
function TypePreview({ model, index }: { model: ParsedModel; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const v = new Viewer(ref.current);
    v.setModel(model);
    v.setHidden(model.elements.flatMap((_, i) => (i === index ? [] : [i])));
    v.fit([index], false);
    return () => v.dispose();
  }, [model, index]);
  return <div ref={ref} className="app-type-preview" aria-label="Preview of the type" />;
}


export interface TypePropertiesProps {
  element: RevitElementParams | null;
  model: ParsedModel | null;
  index: number | null;
  /** The selection (GlobalIds): a duplicated type is given to them. */
  selection: readonly string[];
  /** Changes already staged (from an earlier Apply), shown as the values. */
  pending: readonly PendingChange[];
  /** The add-in can edit types (0.12.0+); otherwise read-only. */
  canEdit: boolean;
  /** OK and Apply: the dialog's edits go to Changes for Revit. */
  onCommit: (draft: PendingChange[]) => void;
  onClose: () => void;
}

/**
 * Revit's Type Properties dialog: Family and Type, Duplicate, the Type Parameters table with its groups,
 * Sort by, Preview, OK / Cancel / Apply. Edits collect in a draft: OK stages them in Changes for Revit and
 * closes, Apply stages them and stays, Cancel drops them. A type parameter changes every instance of the
 * type; Duplicate makes a new type (checked against Revit's naming rules) that the selection moves to, so
 * edits then apply to the selection only.
 */
export function TypeProperties({ element, model, index, selection, pending, canEdit, onCommit, onClose }: TypePropertiesProps) {
  const [sort, setSort] = usePropertySort('typeProperties');
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<PendingChange[]>([]);
  /** A type duplicated in this dialog: its name (the dialog then shows and edits it). */
  const [dupName, setDupName] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  // a new selection or another type: a fresh dialog
  useEffect(() => {
    setDraft([]);
    setDupName(null);
    setNaming(null);
  }, [element?.globalId, element?.typeId]);

  const types = element?.types ?? [];
  const taken = useMemo(() => types.filter((t) => t.family === (element?.familyName ?? '')).map((t) => t.name), [types, element?.familyName]);
  if (!element?.typeParams?.length) return <p className="app-empty-note">Select an element of a model loaded from Revit.</p>;

  const family = element.familyName ?? element.category;
  const shown: TypeRef = dupName ? { familyName: family, typeName: dupName } : { typeId: element.typeId, familyName: family, typeName: element.typeName };
  const key = typeKey(shown);
  // the value shown: this dialog's draft, else a change already staged, else Revit's (a duplicate starts from its source)
  const valueOf = (p: RevitParam) => {
    const d = draft.find((c) => c.globalId === key && c.paramId === p.id && c.name === p.name);
    if (d) return { display: d.value, modified: true };
    const st = pending.find((c) => c.globalId === key && c.paramId === p.id && c.name === p.name);
    if (st) return { display: st.value, modified: true };
    return { display: p.display, modified: false };
  };
  const label = `Type ${family}: ${shown.typeName}`;
  // (a duplicate is new in Revit, so its edits carry no "was" value to check: toEditOp leaves it out)
  const edit = (p: RevitParam, value: string) => setDraft((d) => stageTypeEdit(d, shown, p, value, label));
  const instances = element.typeInstances ?? 0;
  const duplicate = () => {
    const name = naming ?? '';
    if (typeNameProblem(name, taken)) return;
    setDraft((d) => stageOp(d, { kind: 'duplicateType', typeId: element.typeId, newName: name, globalIds: [...selection], familyName: family, typeName: element.typeName, name: 'Duplicate type', value: `${family}: ${name}`, element: `${selection.length === 1 ? '1 element' : `${selection.length} elements`} → ${name}` }));
    setDupName(name);
    setNaming(null);
  };
  const commit = (close: boolean) => {
    if (draft.length) onCommit(draft);
    setDraft([]);
    if (close) onClose();
  };
  const readOnlyWhy = !canEdit ? 'Editing types needs Shanku Bridge for Revit 0.12.0 or later.' : undefined;
  const problem = naming !== null ? typeNameProblem(naming, taken) : null;

  return (
    <div className={['app-typeprops', preview && 'has-preview'].filter(Boolean).join(' ')}>
      {preview && model && index !== null ? <TypePreview model={model} index={index} /> : null}
      <div className="app-typeprops__main">
        <div className="app-typeprops__head">
          <label>
            <span>Family:</span>
            <select disabled value={family} title={LOAD_LATER}>
              <option>{family}</option>
            </select>
          </label>
          <Button size="sm" disabled title={LOAD_LATER}>
            Load…
          </Button>
          <label>
            <span>Type:</span>
            <select disabled value={shown.typeName}>
              <option>{shown.typeName}</option>
            </select>
          </label>
          <Button size="sm" disabled={!canEdit || !!dupName} title={readOnlyWhy ?? (dupName ? 'This is the duplicate; OK or Apply to stage it.' : 'A new type from this one; the selection moves to it')} onClick={() => setNaming(`${element.typeName} 2`)}>
            Duplicate…
          </Button>
          <span />
          <Button size="sm" disabled title={RENAME_LATER}>
            Rename…
          </Button>
        </div>
        {naming !== null ? (
          <div className="app-typeprops__name" role="group" aria-label="Name of the new type">
            <label>
              <span>Name:</span>
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && duplicate()} aria-invalid={!!problem} />
            </label>
            <Button size="sm" variant="primary" disabled={!!problem} onClick={duplicate}>
              OK
            </Button>
            <Button size="sm" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            {problem ? <span className="app-typeprops__problem">{problem}</span> : null}
          </div>
        ) : null}
        {canEdit ? (
          <p className={`app-typeprops__scope${dupName ? '' : ' is-warning'}`}>
            {dupName
              ? selection.length === 1
                ? 'A new type for the selected element: its values change only that element.'
                : `A new type for the ${selection.length} selected elements: its values change only them.`
              : `Values here change all ${instances.toLocaleString('en-IN')} instance${instances === 1 ? '' : 's'} of ${element.typeName}. To change only the selection, Duplicate first.`}
          </p>
        ) : null}
        <div className="app-typeprops__label">Type Parameters</div>
        <div className="app-typeprops__table">
          <div className="app-typeprops__rows">
            <PropertyGrid sort={sort}>
              <div className="app-typeprops__cols" aria-hidden="true">
                <span>Parameter</span>
                <span>Value</span>
              </div>
              {byGroup(element.typeParams).map((g) => (
                <PropertySection key={g.group} title={g.group} persistKey={`revit-type:${g.group.toLowerCase()}`}>
                  {g.params.map((p) => {
                    const v = valueOf(p);
                    const editable = canEdit && !p.readOnly && p.kind !== 'element';
                    return (
                      <PropertyRow
                        key={`${p.id}|${p.name}`}
                        label={p.name}
                        value={v.display}
                        unit={p.unit ?? undefined}
                        modified={v.modified}
                        readOnly={!editable}
                        hint={editable ? undefined : (readOnlyWhy ?? p.why ?? 'Read-only in Revit')}
                        kind={p.kind === 'yesno' ? 'yesno' : 'text'}
                        onCommit={editable ? (value) => edit(p, value) : undefined}
                      />
                    );
                  })}
                </PropertySection>
              ))}
            </PropertyGrid>
          </div>
        </div>
        <PropertiesFooter sort={sort} onSort={setSort}>
          <span />
        </PropertiesFooter>
        <div className="app-typeprops__buttons">
          <Button size="sm" onClick={() => setPreview((v) => !v)} aria-pressed={preview}>
            {preview ? '<< Preview' : 'Preview >>'}
          </Button>
          <span className="app-spacer" />
          <Button size="sm" variant="primary" onClick={() => commit(true)}>
            OK
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!draft.length} onClick={() => commit(false)} title="Stage the changes in Changes for Revit and keep this open">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

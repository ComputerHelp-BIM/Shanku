import { useEffect, useRef, useState } from 'react';
import { Button, PropertiesFooter, PropertyGrid, PropertyRow, PropertySection, usePropertySort } from '@shanku/ui';
import { Viewer, type ParsedModel } from '@shanku/engine';
import { byGroup, type RevitElementParams } from '../lib/paramEdits';

const LATER = 'Editing types comes in a later version; for now edit them in Revit (Edit Type).';

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

/**
 * Revit's Type Properties dialog: Family and Type, Load / Duplicate / Rename, the Type Parameters table
 * with its groups, Sort by, Preview, OK / Cancel / Apply. Read-only for now: type parameters change
 * every instance of the type and are edited in Revit until type editing arrives.
 */
export function TypeProperties({ element, model, index, onClose }: { element: RevitElementParams | null; model: ParsedModel | null; index: number | null; onClose: () => void }) {
  const [sort, setSort] = useSortPersisted();
  const [preview, setPreview] = useState(false);
  if (!element?.typeParams?.length) return <p className="app-empty-note">Select an element of a model loaded from Revit.</p>;
  return (
    <div className={['app-typeprops', preview && 'has-preview'].filter(Boolean).join(' ')}>
      {preview && model && index !== null ? <TypePreview model={model} index={index} /> : null}
      <div className="app-typeprops__main">
        <div className="app-typeprops__head">
          <label>
            <span>Family:</span>
            <select disabled value={element.familyName ?? ''} title={LATER}>
              <option>{element.familyName || element.category}</option>
            </select>
          </label>
          <Button size="sm" disabled title={LATER}>
            Load…
          </Button>
          <label>
            <span>Type:</span>
            <select disabled value={element.typeName} title={LATER}>
              <option>{element.typeName}</option>
            </select>
          </label>
          <Button size="sm" disabled title={LATER}>
            Duplicate…
          </Button>
          <span />
          <Button size="sm" disabled title={LATER}>
            Rename…
          </Button>
        </div>
        <div className="app-typeprops__label">Type Parameters</div>
        <div className="app-typeprops__table">
          <div className="app-typeprops__rows">
            <PropertyGrid sort={sort}>
              {/* inside the grid so the header follows the draggable split */}
              <div className="app-typeprops__cols" aria-hidden="true">
                <span>Parameter</span>
                <span>Value</span>
              </div>
              {byGroup(element.typeParams).map((g) => (
                <PropertySection key={g.group} title={g.group} persistKey={`revit-type:${g.group.toLowerCase()}`}>
                  {g.params.map((p) => (
                    <PropertyRow key={`${p.id}|${p.name}`} label={p.name} value={p.display} readOnly hint={LATER} kind={p.kind === 'yesno' ? 'yesno' : 'text'} />
                  ))}
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
          <Button size="sm" variant="primary" onClick={onClose}>
            OK
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled title={LATER}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

function useSortPersisted() {
  return usePropertySort('typeProperties');
}
